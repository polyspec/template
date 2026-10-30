// The editor boundaries of config/editor-boundaries.json (config/editor-boundaries.schema.json; EDT-2, EDT-3, T23.4,
// T27.1-37): each boundary names packages, the modules that they may neither import nor declare, and the globals that they
// may not use. The check starts at every source of a package that no exempt glob matches and follows the relative imports
// transitively, also out of the package, so a re-export of a forbidden module in any reached file fails. A bare specifier
// is judged by its name and never followed. scripts/module-imports.mts reads the imports (amaro, acorn and acorn-walk),
// acorn-walk finds the properties of globalThis, and eslint-scope finds the references that no scope declares. An import
// that the check cannot follow is a finding, never skipped.
//
//   node scripts/check-editor-boundaries.mts      (from the root of the checkout, as make editor-boundary-check runs it)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { matchesAny } from '@polyspec/kit/glob';
import { simple } from 'acorn-walk';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { analyze } from 'eslint-scope';
import { jsonDocument, parseJson } from './json-document.mts';
import { moduleImports, parseModule, resolveRelative, type Import } from './module-imports.mts';

const CONFIG = 'config/editor-boundaries.json';
const SCHEMA = fileURLToPath(new URL('../config/editor-boundaries.schema.json', import.meta.url));
// The JSON Schema of the configuration, a JSON object that Ajv compiles.
const schemaDocument = jsonDocument<Record<string, unknown>>('JSON Schema', { type: 'object' });

type Boundary = { packages: string[]; sources: string; forbiddenModules: string[]; forbiddenGlobals?: string[]; exempt?: string[] };
type Config = { schema: 1; boundaries: Boundary[] };

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
// The files the check reads: JavaScript and TypeScript; .jsx and .tsx are sources it refuses.
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const COMMONJS = /\.c[jt]s$/;

/** Whether `value` is a JSON object, as a package.json and its dependency fields are. */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The ESTree program that eslint-scope reads. */
type EstreeProgram = Parameters<typeof analyze>[0];

/** Whether `node` is the ESTree program that its type field names. */
const isEstreeProgram = (node: unknown): node is EstreeProgram =>
  typeof node === 'object' && node !== null && 'type' in node && node.type === 'Program';

/** The configuration of `root`, or the errors of its schema. */
function readConfig(root: string): { config: Config; errors?: undefined } | { config?: undefined; errors: string[] } {
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile<Config>(schemaDocument.read(SCHEMA));
  const value = parseJson(readFileSync(path.join(root, CONFIG), 'utf8'), CONFIG);
  if (validate(value)) return { config: value };
  return { errors: [`${CONFIG} is no editor boundary configuration: ${ajv.errorsText(validate.errors)}`] };
}

/** The imports and the used globals of the JavaScript or TypeScript `text` of `file`. */
function readSource(file: string, text: string): { imports: Import[]; globals: string[] } {
  const program = parseModule(file, text);
  const globalProperties: string[] = [];
  simple(program, {
    MemberExpression(node) {
      if (node.object.type !== 'Identifier' || node.object.name !== 'globalThis') return;
      if (!node.computed && node.property.type === 'Identifier') globalProperties.push(node.property.name);
      else if (node.property.type === 'Literal' && typeof node.property.value === 'string') globalProperties.push(node.property.value);
    },
  });
  // eslint-scope reads the ESTree program that acorn writes; its types name the estree package instead of acorn's, so the
  // program is read again as the ESTree program that its type field names.
  const tree: unknown = program;
  if (!isEstreeProgram(tree)) throw new Error(`${file}: acorn wrote no ESTree program`);
  const scopes = analyze(tree, { ecmaVersion: 2022, sourceType: COMMONJS.test(file) ? 'commonjs' : 'module' });
  // The global scope exists for every program that analyze reads.
  const global = scopes.globalScope;
  if (global === null) throw new Error(`${file}: eslint-scope found no global scope`);
  const free = global.through.map(reference => reference.identifier.name);
  return { imports: moduleImports(file, program), globals: [...new Set([...free, ...globalProperties])] };
}

/** The sources below `directory`, as sorted absolute paths. */
function sourcesBelow(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .map(entry => path.join(directory, entry))
    .filter(file => SOURCE.test(file) && !DECLARATION.test(file) && statSync(file).isFile())
    .sort();
}

/** The findings of one package of `boundary` and the number of files that the check read. */
function packageFindings(root: string, directory: string, boundary: Boundary): { findings: string[]; files: number } {
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const findings: string[] = [];
  const sources = path.join(root, directory, boundary.sources);
  if (!existsSync(sources)) return { findings: [`${directory}/${boundary.sources}: the sources of the package do not exist`], files: 0 };
  const manifestFile = `${directory}/package.json`;
  // The dependency fields of a package.json are objects of names; the check reads their names only.
  const manifest = parseJson(readFileSync(path.join(root, manifestFile), 'utf8'), manifestFile);
  for (const field of DEPENDENCY_FIELDS) {
    const declared = isObject(manifest) ? manifest[field] : undefined;
    for (const name of isObject(declared) ? Object.keys(declared) : []) {
      if (matchesAny(boundary.forbiddenModules, name)) findings.push(`${manifestFile}: declares ${name} in ${field}`);
    }
  }
  const exempt = boundary.exempt ?? [];
  const forbiddenGlobals = new Set(boundary.forbiddenGlobals ?? []);
  // Every checked source starts with itself as its chain; a file reached later carries the chain of its first importer.
  const chains = new Map<string, string[]>();
  const queue: string[] = [];
  for (const file of sourcesBelow(sources)) {
    if (matchesAny(exempt, path.relative(path.join(root, directory), file).split(path.sep).join('/'))) continue;
    chains.set(file, [relative(file)]);
    queue.push(file);
  }
  for (const file of queue) {
    const chain = chains.get(file) ?? [relative(file)];
    const where = chain.join(' -> ');
    if (/\.[jt]sx$/.test(file)) {
      findings.push(`${where}: is a ${path.extname(file)} file, which the check does not read`);
      continue;
    }
    const { imports, globals } = readSource(relative(file), readFileSync(file, 'utf8'));
    for (const specifier of imports) {
      if (specifier === null) findings.push(`${where}: imports a computed specifier, which the check cannot follow`);
      else if (specifier.startsWith('#')) findings.push(`${where}: imports ${specifier}, a subpath import, which the check cannot follow`);
      else if (specifier.startsWith('/') || specifier.startsWith('file:')) findings.push(`${where}: imports ${specifier}, an absolute specifier, which the check cannot follow`);
      else if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const target = resolveRelative(file, specifier);
        if (target === null) findings.push(`${where}: imports ${specifier}, which is no file; a relative import names its file, with .js for a .ts file`);
        else if (SOURCE.test(target) && !chains.has(target)) {
          chains.set(target, [...chain, relative(target)]);
          queue.push(target);
        }
      } else if (matchesAny(boundary.forbiddenModules, specifier)) findings.push(`${where}: imports ${specifier}`);
    }
    for (const name of globals) if (forbiddenGlobals.has(name)) findings.push(`${where}: uses the global ${name}`);
  }
  return { findings, files: queue.length };
}

/** The findings of the boundaries of `root`, the number of packages and boundaries, and the number of files read. */
export function checkBoundaries(root: string): { findings: string[]; packages: number; boundaries: number; files: number } {
  const { config, errors } = readConfig(root);
  if (errors) return { findings: errors, packages: 0, boundaries: 0, files: 0 };
  const findings: string[] = [];
  let packages = 0;
  let files = 0;
  for (const boundary of config.boundaries) {
    for (const directory of boundary.packages) {
      const result = packageFindings(root, directory, boundary);
      findings.push(...result.findings);
      files += result.files;
      packages += 1;
    }
  }
  return { findings, packages, boundaries: config.boundaries.length, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { findings, packages, boundaries, files } = checkBoundaries(process.cwd());
  if (findings.length > 0) {
    process.stderr.write(`${findings.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`[editor-boundaries] ${packages} packages of ${boundaries} boundaries passed, ${files} files checked\n`);
}
