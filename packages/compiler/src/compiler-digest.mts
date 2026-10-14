// Computes build-compiler implementation digests used by artifact refresh.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { filesUnder, packageDirectory, packageRoot } from './package-root.mts';

const PACKAGE = '@polyspec/template-compiler';
/** A file of a digest: its label and its absolute path. */
type DigestEntry = [label: string, path: string];

// The repository of the package, whose checks read the sources of packages/ts and packages/compiler, and run the modules
// of src/ as they are; the published package has no src/ and runs the build of dist/ (tsup.config.ts).
const repository = resolve(packageRoot, '../..');
const inRepository = existsSync(join(packageRoot, 'src')) && existsSync(join(repository, 'package-lock.json'));

/**
 * The digest of files given as [label, absolute path], in the order of their labels, with this module: the label and the
 * bytes of each file. A label names a file of this package `@polyspec/template-compiler/<path>` and a file of the
 * repository by its path in it.
 */
export function digestFiles(entries: DigestEntry[]): string {
  const digest = createHash('sha256');
  const own = inRepository ? packageFiles(['src/compiler-digest.mts', 'src/package-root.mts']) : builtFiles();
  const all = [...own, ...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  for (const [label, path] of all) {
    digest.update(label);
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** Files of this package by their paths in the package. */
function packageFiles(paths: string[]): DigestEntry[] {
  return paths.map((path): DigestEntry => [`${PACKAGE}/${path}`, join(packageRoot, path)]);
}

/** Files of the repository by their paths in it. */
function repositoryFiles(paths: string[]): DigestEntry[] {
  return paths.map((path): DigestEntry => [path, join(repository, path)]);
}

/** The files under a directory of base, sorted, as paths relative to base. */
const filesOf = (base: string, directory: string): string[] => filesUnder(join(base, directory)).map(path => `${directory}/${path}`);

/**
 * The files of the published package that run: its manifest, its build and the Go of the Go backend. The build bundles
 * every backend into the modules of dist/, so installed, one digest covers every language.
 */
function builtFiles(): DigestEntry[] {
  return packageFiles(['package.json', ...filesOf(packageRoot, 'dist'), ...filesOf(packageRoot, 'backends/go')]);
}

/**
 * The files of the parser of ast-artifact.mts. In the repository of the package, they are the sources and the build
 * configuration of packages/ts, which the build of the package turns into dist with the tools of
 * package-lock.json, so a check computes the digest without building the package (T17.1-6). Installed, they are the
 * manifest and the dist of the @polyspec/template package that ast-artifact.mts imports.
 */
function parserFiles(): DigestEntry[] {
  if (inRepository) {
    return repositoryFiles([
      ...filesOf(repository, 'packages/ts/src'),
      'packages/ts/package.json',
      'packages/ts/tsconfig.json',
      'packages/ts/tsup.config.ts',
      'package-lock.json',
    ]);
  }
  const installed = packageDirectory('@polyspec/template', import.meta.url);
  return ['package.json', ...filesOf(installed, 'dist')].map((path): DigestEntry => [`@polyspec/template/${path}`, join(installed, path)]);
}

/** The module that reads the JSON documents of the compiler: AST artifact manifests and type manifests. */
const documentFiles = (): DigestEntry[] => inRepository ? packageFiles(['src/documents.mts']) : [];

/** Identifies the parser and AST artifact compiler implementation: the parser and the artifact writer. */
export function astCompilerDigest(): string {
  return digestFiles([...parserFiles(), ...(inRepository ? packageFiles(['src/artifact-support.mts', 'src/ast-artifact.mts']) : []), ...documentFiles()]);
}

/**
 * The files of the shared generated compiler and the backend of one language, as entries of digestFiles: the module of
 * the backend and the files of its folder, such as the Go that the Go backend writes as it is.
 */
export function generatedCompilerFiles(language: string): DigestEntry[] {
  if (!inRepository) return [];
  const backend = language === 'ts' ? 'typescript' : language;
  const sources = existsSync(join(packageRoot, 'backends', backend)) ? filesOf(packageRoot, `backends/${backend}`) : [];
  return [
    ...packageFiles(['src/artifact-support.mts', 'src/backend-support.mts', `src/backends/${backend}.mts`, ...sources, 'src/compiler.mts', 'src/generated-artifact.mts', 'src/ir.mts']),
    ...documentFiles(),
  ];
}

/** Identifies the shared generated compiler and one language backend. */
export function generatedCompilerDigest(language: string): string {
  return digestFiles(generatedCompilerFiles(language));
}
