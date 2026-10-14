#!/usr/bin/env node
// Checks two things.
//
// 1. Every symbol of the public entry surface of a package carries a documentation comment.
//    The public entry surface is what an installed package exposes through the documented entry points:
//      TypeScript  the symbols re-exported from src/index.ts, src/render.ts and src/node/index.ts,
//                  and the public members of the classes among them
//      Go          the exported identifiers of the module root package, the subpackage types that
//                  its declarations name, and the exported methods of those types
//      PHP         the classes of the API table of the package README and their public methods
//      Rust        the crate attribute #![deny(missing_docs)], which makes the compiler check
//                  every public item
//    A symbol that a package exports only so that another file of the same package can use it is
//    internal and is not checked here.
//
// 2. Every source file starts with a comment naming what the file implements.
//
// A documentation comment is a comment that ends on the line directly above the declaration.
// Exit status 1 with one line per finding, 0 with a summary count.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync, type ClassElement, type Declaration, type Directive, type ModuleExportName, type Statement } from 'oxc-parser';
import { compareText } from './compare-text.mts';
import { captured, required } from './required.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const findings: string[] = [];
const counts = new Map<string, number>();
let group = 'files';
let checked = 0;

// Counts one checked symbol against the group that is being checked.
function count(): void {
  checked++;
  counts.set(group, (counts.get(group) ?? 0) + 1);
}

function report(file: string, line: number, message: string): void {
  findings.push(`${relative(root, file)}:${line}: ${message}`);
}

// Lists the files of a directory tree whose name ends with one of the extensions.
function sources(directory: string, extensions: string[]): string[] {
  const skip = new Set(['node_modules', 'vendor', 'target', 'dist']);
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(path);
      } else if (extensions.some(extension => entry.name.endsWith(extension))) {
        files.push(path);
      }
    }
  };
  walk(absolute);
  return files.sort(compareText);
}

// True when a comment ends on the line directly above the declaration. Attribute and decorator
// lines between the comment and the declaration are skipped.
function documented(lines: string[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const line = required(lines[cursor], `line ${cursor + 1}`).trim();
    if (line === '') return false;
    if (line === '*/' || line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) return true;
    if (line.startsWith('#[') || line.startsWith('@')) continue;
    return false;
  }
  return false;
}

// ---------------------------------------------------------------- TypeScript

group = 'packages/ts';

const typescriptRoot = join(root, 'packages/ts/src');
const typescriptEntries = ['index.ts', 'render.ts', 'node/index.ts'];

// Resolves a module specifier of a file to a source path inside the package.
function typescriptModule(fromFile: string, specifier: string): string {
  return resolve(dirname(fromFile), specifier.replace(/\.js$/, '.ts'));
}

/** A TypeScript file parsed by oxc-parser: its lines and its top-level statements; a file that does not parse fails. */
interface TypescriptFile {
  lines: string[];
  statements: Array<Directive | Statement>;
  /** The 0-based line of a source offset. */
  lineOf(offset: number): number;
}

function parseTypescript(file: string): TypescriptFile {
  const text = readFileSync(file, 'utf8');
  const { program, errors } = parseSync(file, text);
  if (errors.length > 0) throw new Error(`${relative(root, file)}: ${errors.map(error => error.message).join('; ')}`);
  return { lines: text.split('\n'), statements: program.body, lineOf: offset => text.slice(0, offset).split('\n').length - 1 };
}

/** The name of a module export name: an identifier or a string literal. */
function exportName(name: ModuleExportName): string {
  return name.type === 'Literal' ? name.value : name.name;
}

/** The names that a declaration declares, with the keyword that the finding names. */
function declaredNames(declaration: Declaration): { kind: string; name: string }[] {
  switch (declaration.type) {
    case 'FunctionDeclaration': return declaration.id ? [{ kind: 'function', name: declaration.id.name }] : [];
    case 'ClassDeclaration': return declaration.id ? [{ kind: 'class', name: declaration.id.name }] : [];
    case 'TSInterfaceDeclaration': return [{ kind: 'interface', name: declaration.id.name }];
    case 'TSTypeAliasDeclaration': return [{ kind: 'type', name: declaration.id.name }];
    case 'TSEnumDeclaration': return [{ kind: 'enum', name: declaration.id.name }];
    case 'VariableDeclaration': return declaration.declarations.flatMap(declarator => (declarator.id.type === 'Identifier' ? [{ kind: declaration.kind, name: declarator.id.name }] : []));
    default: return [];
  }
}

// Collects {file, name} for every symbol that the entry files re-export or declare.
function typescriptSurface(): { file: string; name: string }[] {
  const surface = new Map<string, { file: string; name: string }>();
  const add = (file: string, name: string): void => {
    const key = `${file}::${name}`;
    if (!surface.has(key)) surface.set(key, { file, name });
  };
  for (const entry of typescriptEntries) {
    const file = join(typescriptRoot, entry);
    if (!existsSync(file)) {
      findings.push(`${relative(root, file)}:1: the entry file does not exist`);
      continue;
    }
    const { statements } = parseTypescript(file);
    // Where each imported binding of the entry file comes from: its module and its name there.
    const imported = new Map<string, { module: string; name: string }>();
    for (const statement of statements) {
      if (statement.type !== 'ImportDeclaration') continue;
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportSpecifier') imported.set(specifier.local.name, { module: typescriptModule(file, statement.source.value), name: exportName(specifier.imported) });
      }
    }
    for (const statement of statements) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      if (statement.declaration) {
        // Declarations of the entry file itself.
        for (const { name } of declaredNames(statement.declaration)) add(file, name);
      } else if (statement.source) {
        // export { a, type b, c as d } from './x.js'
        for (const specifier of statement.specifiers) add(typescriptModule(file, statement.source.value), exportName(specifier.local));
      } else {
        // export type { a, b as c };  where a and b are imported bindings
        for (const specifier of statement.specifiers) {
          const binding = imported.get(exportName(specifier.local));
          if (binding) add(binding.module, binding.name);
        }
      }
    }
  }
  return [...surface.values()];
}

// Checks one TypeScript declaration and, for a class, its public members. A module that
// re-exports the name from another module is followed until the declaration is found.
function checkTypescriptSymbol(file: string, name: string, seen = new Set<string>()): void {
  if (!existsSync(file)) {
    findings.push(`${relative(root, file)}:1: ${name} comes from a file that does not exist`);
    return;
  }
  const key = `${file}::${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  const source = parseTypescript(file);
  for (const statement of source.statements) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration;
    const found = declaration ? declaredNames(declaration).find(item => item.name === name) : undefined;
    if (declaration && found) {
      count();
      const index = source.lineOf(statement.start);
      if (!documented(source.lines, index)) report(file, index + 1, `${found.kind} ${name}`);
      if (declaration.type === 'ClassDeclaration') checkTypescriptMembers(file, source, name, declaration.body.body);
      return;
    }
    if (!declaration && statement.source) {
      const specifier = statement.specifiers.find(item => exportName(item.exported) === name);
      if (specifier) {
        checkTypescriptSymbol(typescriptModule(file, statement.source.value), exportName(specifier.local), seen);
        return;
      }
    }
  }
  findings.push(`${relative(root, file)}:1: ${name} is part of the public surface but is not declared here`);
}

// The public methods of an exported class: every method, accessor and constructor that is neither private nor protected.
function checkTypescriptMembers(file: string, source: TypescriptFile, className: string, members: ClassElement[]): void {
  for (const member of members) {
    if (member.type !== 'MethodDefinition' && member.type !== 'TSAbstractMethodDefinition') continue;
    if (member.accessibility === 'private' || member.accessibility === 'protected' || member.key.type === 'PrivateIdentifier') continue;
    if (member.key.type !== 'Identifier') continue;
    count();
    const index = source.lineOf(member.start);
    if (!documented(source.lines, index)) report(file, index + 1, `method ${className}.${member.key.name}`);
  }
}

for (const symbol of typescriptSurface()) checkTypescriptSymbol(symbol.file, symbol.name);

// ---------------------------------------------------------------- Go

group = 'packages/go';

const goRoot = join(root, 'packages/go');
const goDeclaration = /^(?:func|type|var|const)\s+([A-Z]\w*)/;
const goMethod = /^func\s+\([^)]*?\*?(\w+)\)\s+([A-Z]\w*)/;

// Checks a Go declaration whose documentation comment starts with the identifier name.
function checkGoDeclaration(file: string, lines: string[], index: number, name: string, label?: string): void {
  count();
  let cursor = index - 1;
  while (cursor >= 0 && required(lines[cursor], `line ${cursor + 1} of ${file}`).trim().startsWith('//')) cursor--;
  const first = required(lines[cursor + 1], `line ${cursor + 2} of ${file}`).trim();
  if (cursor === index - 1 || !first.startsWith(`// ${name}`)) report(file, index + 1, label ?? name);
}

if (existsSync(goRoot)) {
  const rootFiles = readdirSync(goRoot)
    .filter(name => name.endsWith('.go') && !name.endsWith('_test.go'))
    .map(name => join(goRoot, name));

  // Package aliases of the root package and the subpackage types that its declarations name.
  const packageDirectories = new Map<string, string>();
  const referenced = new Map<string, { directory: string; name: string }>();
  for (const file of rootFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/"github\.com\/polyspec\/template\/([\w/]+)"/g)) {
      const path = captured(match, 1, `an import path of ${file}`);
      packageDirectories.set(path.replace(/^.*\//, ''), join(goRoot, path));
    }
    for (const match of text.matchAll(/\b([a-z]\w*)\.([A-Z]\w*)/g)) {
      const alias = captured(match, 1, `a package alias of ${file}`);
      const name = captured(match, 2, `a qualified identifier of ${file}`);
      const directory = packageDirectories.get(alias);
      if (!directory) continue;
      const key = `${directory}::${name}`;
      if (!referenced.has(key)) referenced.set(key, { directory, name });
    }
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const method = goMethod.exec(line);
      const declaration = method ? null : goDeclaration.exec(line);
      if (method) checkGoDeclaration(file, lines, index, captured(method, 2, `a method name of ${file}`), `method ${captured(method, 1, `a receiver of ${file}`)}.${captured(method, 2, `a method name of ${file}`)}`);
      else if (declaration) checkGoDeclaration(file, lines, index, captured(declaration, 1, `a declared name of ${file}`));
    });
  }

  // Subpackage types named by the root package, and their exported methods.
  for (const { directory, name } of referenced.values()) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory).filter(item => item.endsWith('.go') && !item.endsWith('_test.go'))) {
      const path = join(directory, entry);
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const declaration = goDeclaration.exec(line);
        if (declaration && declaration[1] === name) checkGoDeclaration(path, lines, index, name);
        const method = goMethod.exec(line);
        if (method && method[1] === name) {
          const methodName = captured(method, 2, `a method name of ${path}`);
          checkGoDeclaration(path, lines, index, methodName, `method ${name}.${methodName}`);
        }
      });
    }
  }
}

// ---------------------------------------------------------------- PHP

group = 'packages/php';

// The classes of the API table of packages/php/README.md.
const phpClasses = [
  'Engine.php',
  'TemplateError.php',
  'Loader/LoaderInterface.php',
  'Loader/ArrayLoader.php',
  'Loader/FilesystemLoader.php',
  'Value/Json.php',
  'Value/SafeString.php',
];
const phpType = /^\s*(?:final\s+|abstract\s+)?(class|interface|trait|enum)\s+([A-Za-z_]\w*)/;
const phpMethod = /^\s*public\s+(?:static\s+)?function\s+([A-Za-z_]\w*)/;

for (const relativePath of phpClasses) {
  const file = join(root, 'packages/php/src', relativePath);
  if (!existsSync(file)) {
    findings.push(`packages/php/src/${relativePath}:1: the file of a public class does not exist`);
    continue;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const type = phpType.exec(line);
    const method = type ? null : phpMethod.exec(line);
    const label = type ? `${type[1]} ${type[2]}` : method ? `method ${method[1]}` : null;
    if (label === null) return;
    count();
    if (!documented(lines, index)) report(file, index + 1, label);
  });
}

// ---------------------------------------------------------------- Rust

group = 'packages/rust';

const rustLibrary = join(root, 'packages/rust/src/lib.rs');
if (existsSync(rustLibrary)) {
  count();
  if (!readFileSync(rustLibrary, 'utf8').includes('#![deny(missing_docs)]')) {
    findings.push('packages/rust/src/lib.rs:1: the crate does not set #![deny(missing_docs)]');
  }
}

// ---------------------------------------------------------------- File comments

group = 'files';

// True when the file starts with a comment, ignoring the lines that must come first.
function startsWithComment(file: string): boolean {
  const skip = [/^#!/, /^<\?php$/, /^declare\(/, /^#!\[/, /^namespace\s/, /^use\s/];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (skip.some(pattern => pattern.test(line))) continue;
    return line.startsWith('//') || line.startsWith('/*') || line.startsWith('*');
  }
  return false;
}

const fileGroups: [string, string[]][] = [
  ['packages/ts/src', ['.ts']],
  ['packages/rust/src', ['.rs']],
  ['packages/php/src', ['.php']],
];
for (const [directory, extensions] of fileGroups) {
  for (const file of sources(directory, extensions)) {
    if (file.endsWith('.d.ts')) continue;
    count();
    if (!startsWithComment(file)) report(file, 1, 'the file has no comment naming what it implements');
  }
}

// A Go package carries its comment on one of its files.
const goPackages = new Set(
  sources('packages/go', ['.go'])
    .filter(file => !file.endsWith('_test.go'))
    .map(file => dirname(file)),
);
for (const directory of [...goPackages].sort()) {
  count();
  const documentedPackage = readdirSync(directory)
    .filter(name => name.endsWith('.go') && !name.endsWith('_test.go'))
    .some(name => /(^|\n)\/\/ (Package|Command) \w[\s\S]*?\npackage\s/.test(readFileSync(join(directory, name), 'utf8')));
  if (!documentedPackage) report(join(directory, 'doc.go'), 1, 'the package has no comment naming what it implements');
}

// ---------------------------------------------------------------- Result

if (findings.length) {
  for (const finding of findings) process.stderr.write(`[doc-coverage] ${finding}\n`);
  process.stderr.write(`[doc-coverage] ${findings.length} of ${checked} public symbols and files are undocumented\n`);
  process.exit(1);
}
const summary = [...counts].map(([name, value]) => `${name} ${value}`).join(', ');
process.stdout.write(`[doc-coverage] ${checked} public symbols and files documented (${summary})\n`);
