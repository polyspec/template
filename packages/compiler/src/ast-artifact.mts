// Builds and verifies one canonical AST artifact graph.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { parse, type Node, type Template } from '@polyspec/template';
import { astCompilerDigest } from './compiler-digest.mts';
import { astManifestDocument, DocumentSchemaError, type AstFile, type AstManifest } from './documents.mts';
import { contractPath, hash, json } from './artifact-support.mts';
const lineIndex = (bytes: Buffer): number[] => {
  const starts = [0];
  for (let index = 0; index < bytes.length; index++) if (bytes[index] === 0x0a) starts.push(index + 1);
  return starts;
};

function sourceNames(root: string, directory = root): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'compiled') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) names.push(...sourceNames(root, path));
    else if (entry.isFile() && entry.name.endsWith('.tpl')) names.push(relative(root, path).split('\\').join('/'));
  }
  return names;
}

function referencedTemplates(ast: Template, from: string): string[] {
  const names: string[] = [];
  const visit = (nodes: Node[]): void => {
    for (const node of nodes) {
      const path = node.type === 'Include' ? node.path : node.type === 'Block' ? node.path : null;
      if (path !== null) {
        const name = posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path));
        if (name !== '..' && !name.startsWith('../')) names.push(name);
      }
      if (node.type === 'For' || node.type === 'IfBlock') visit(node.body);
      if ((node.type === 'If' || node.type === 'IfBlock') && node.else !== null) visit(node.else);
      if (node.type === 'For' && node.empty !== null) visit(node.empty);
      if (node.type === 'If') for (const branch of node.branches) visit(branch.body);
    }
  };
  visit(ast.body);
  return names;
}

/** Whether every value is greater than the value before it. */
function ascending(values: number[]): boolean {
  let previous = -Infinity;
  for (const value of values) {
    if (value <= previous) return false;
    previous = value;
  }
  return true;
}

/**
 * An artifact that is missing or stale: its manifest or one of its files is absent, its manifest is in the form of another
 * compiler (not a document of the schema), a file does not match its digest, or its source graph is incomplete. It is the one failure of a verification that a rebuild fixes, so the true refresh policy rebuilds
 * on it and on nothing else.
 */
export class ArtifactStaleError extends Error {
  override name = 'ArtifactStaleError';
}

/** Reads a manifest; one in the form of another compiler is stale, and a manifest that is not JSON or not readable fails as it is. */
export function readStale<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof DocumentSchemaError) throw new ArtifactStaleError(error.message, { cause: error });
    throw error;
  }
}

function verify(output: string): AstManifest {
  const manifestPath = join(output, 'manifest.json');
  if (!existsSync(manifestPath)) throw new ArtifactStaleError(`AST artifact manifest is missing: ${manifestPath}`);
  const manifest = readStale(() => astManifestDocument.read(manifestPath));
  const files = Object.entries(manifest.files);
  if (files.length === 0 || !manifest.files[manifest.entry]) throw new ArtifactStaleError('AST artifact source graph is incomplete');
  for (const [name, file] of files) {
    if (file.lines[0] !== 0 || !ascending(file.lines)) {
      throw new Error(`AST artifact line index is invalid: ${name}`);
    }
    const path = join(output, file.path);
    if (!existsSync(path) || hash(readFileSync(path)) !== file.artifactDigest) throw new ArtifactStaleError(`AST artifact file is missing or changed: ${name}`);
  }
  return manifest;
}

/** The source directory, output directory and entry of an AST artifact, its refresh policy, type manifest and delimiters. */
export interface CompileAstOptions {
  root: string;
  output: string;
  entry: string;
  refresh?: string;
  typeManifest?: string | null;
  delimiters?: string | null;
}

/** Compiles one source directory into a canonical AST graph outside request handling. */
export function compileAst(options: CompileAstOptions): AstManifest {
  const { entry, refresh = 'true', typeManifest = null, delimiters = null } = options;
  const root = resolve(options.root);
  const output = resolve(options.output);
  if (refresh === 'false') return verify(output);
  const contractDigest = hash(readFileSync(contractPath));
  const compilerDigest = astCompilerDigest();
  if (refresh !== 'dev' && refresh !== 'true') throw new Error(`${refresh} is not an artifact refresh policy`);
  const names = sourceNames(root);
  if (names.length === 0) throw new Error(`source graph has no .tpl files: ${root}`);
  if (!names.includes(entry)) throw new Error(`source graph entry is missing: ${entry}`);
  const sources = new Map(names.map(name => [name, readFileSync(join(root, name))]));
  const sourceOf = (name: string): Buffer => {
    const source = sources.get(name);
    if (source === undefined) throw new Error(`source graph has no source ${name}`);
    return source;
  };
  const asts = new Map<string, Template>();
  const astOf = (name: string): Template => {
    const ast = asts.get(name);
    if (ast === undefined) throw new Error(`source graph has no AST of ${name}`);
    return ast;
  };
  // A referenced template that exists joins the graph, and the loop parses it in its turn.
  for (const name of names) {
    const ast = parse(sourceOf(name), name, delimiters === null ? {} : { delimiters });
    asts.set(name, ast);
    for (const dependency of referencedTemplates(ast, name)) {
      const path = join(root, dependency);
      if (sources.has(dependency) || !existsSync(path) || !statSync(path).isFile()) continue;
      names.push(dependency);
      sources.set(dependency, readFileSync(path));
    }
  }
  names.sort((left, right) => left.localeCompare(right));
  const sourceDigest = hash(Buffer.concat([
    Buffer.from(`delimiters\0${delimiters ?? ''}\0`),
    ...names.flatMap(name => [Buffer.from(name + '\0'), sourceOf(name), Buffer.from('\0')]),
  ]));
  const typeDigest = typeManifest && existsSync(typeManifest) ? hash(readFileSync(typeManifest)) : hash(Buffer.alloc(0));
  if (refresh === 'true' && existsSync(join(output, 'manifest.json'))) {
    try {
      const current = verify(output);
      if (current.contractDigest === contractDigest && current.compilerDigest === compilerDigest && current.sourceDigest === sourceDigest && current.typeDigest === typeDigest && current.entry === entry && current.delimiters === delimiters) return current;
    } catch (error) {
      // Only a missing or stale artifact is rebuilt under the true refresh policy; any other failure is its own.
      if (!(error instanceof ArtifactStaleError)) throw error;
    }
  }
  const temporary = join(dirname(output), `.${basename(output)}-${process.pid}.tmp`);
  rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { recursive: true });
  try {
    const files: Record<string, AstFile> = {};
    for (const name of names) {
      const ast = json(astOf(name));
      const path = `${name}.ast.json`;
      mkdirSync(dirname(join(temporary, path)), { recursive: true });
      writeFileSync(join(temporary, path), ast);
      files[name] = { path: posix.normalize(path), sourceDigest: hash(sourceOf(name)), artifactDigest: hash(ast), lines: lineIndex(sourceOf(name)) };
    }
    const manifest: AstManifest = { schema: 3, mode: 'ast', target: 'canonical', entry, delimiters, sourceDigest, typeDigest, contractDigest, compilerDigest, files };
    writeFileSync(join(temporary, 'manifest.json'), json(manifest));
    mkdirSync(output, { recursive: true });
    for (const file of Object.values(files)) {
      mkdirSync(dirname(join(output, file.path)), { recursive: true });
      renameSync(join(temporary, file.path), join(output, file.path));
    }
    renameSync(join(temporary, 'manifest.json'), join(output, 'manifest.json'));
    rmSync(temporary, { recursive: true, force: true });
    return manifest;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
