// Computes build-compiler implementation digests used by artifact refresh.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE = '@polyspec/template-compiler';

/**
 * The digest of files given as [label, absolute path], in the order of their labels, with this module: the label and the
 * bytes of each file. A label names a file of this package `@polyspec/template-compiler/<path>`, so the package digests
 * the same in the repository and installed.
 */
export function digestFiles(entries) {
  const digest = createHash('sha256');
  const all = [...packageFiles(['compiler-digest.mjs']), ...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  for (const [label, path] of all) {
    digest.update(label);
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** Files of this package by their paths in the package. */
function packageFiles(paths) {
  return paths.map(path => [`${PACKAGE}/${path}`, join(packageRoot, path)]);
}

/** The files under a directory of base, sorted, as paths relative to base. */
function filesUnder(base, relativeDirectory) {
  return readdirSync(join(base, relativeDirectory), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath ?? entry.path, entry.name).slice(base.length).replace(/^[\\/]+/, '').replaceAll('\\', '/'))
    .sort();
}

/** The directory of the package that holds a resolved module: the nearest directory above it with a package.json. */
function packageDirectory(file) {
  let directory = dirname(file);
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`${file} is in no package`);
    directory = parent;
  }
  return directory;
}

/**
 * The files of the parser of ast-artifact.mjs. In the repository of the package, they are the sources and the build
 * configuration of packages/template-ts, which the build of the package turns into dist with the tools of
 * package-lock.json, so a check computes the digest without building the package (T17.1-6). Installed, they are the
 * manifest and the dist of the @polyspec/template package that ast-artifact.mjs imports.
 */
function parserFiles() {
  const repository = resolve(packageRoot, '../..');
  if (existsSync(join(repository, 'packages/template-ts/src')) && existsSync(join(repository, 'package-lock.json'))) {
    return [
      ...filesUnder(repository, 'packages/template-ts/src'),
      'packages/template-ts/package.json',
      'packages/template-ts/tsconfig.json',
      'packages/template-ts/tsup.config.ts',
      'package-lock.json',
    ].map(path => [path, join(repository, path)]);
  }
  const installed = packageDirectory(fileURLToPath(import.meta.resolve('@polyspec/template')));
  return ['package.json', ...filesUnder(installed, 'dist')].map(path => [`@polyspec/template/${path}`, join(installed, path)]);
}

/** Identifies the parser and AST artifact compiler implementation: the parser and the artifact writer. */
export function astCompilerDigest() {
  return digestFiles([...parserFiles(), ...packageFiles(['ast-artifact.mjs'])]);
}

/** The files of the shared generated compiler and the backend of one language, as entries of digestFiles. */
export function generatedCompilerFiles(language) {
  const backend = language === 'ts' ? 'typescript' : language;
  return packageFiles(['backend-support.mjs', `backends/${backend}.mjs`, 'compiler.mjs', 'generated-artifact.mjs', 'ir.mjs']);
}

/** Identifies the shared generated compiler and one language backend. */
export function generatedCompilerDigest(language) {
  return digestFiles(generatedCompilerFiles(language));
}
