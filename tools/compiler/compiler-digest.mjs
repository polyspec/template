// Computes build-compiler implementation digests used by artifact refresh.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));

function digestFiles(relativePaths) {
  const digest = createHash('sha256');
  for (const path of ['tools/compiler/compiler-digest.mjs', ...relativePaths].sort()) {
    digest.update(path);
    digest.update('\0');
    digest.update(readFileSync(join(projectRoot, path)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** The files under a directory of the repository, sorted, as repository paths. */
function filesUnder(relativeDirectory) {
  return readdirSync(join(projectRoot, relativeDirectory), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath ?? entry.path, entry.name).slice(projectRoot.length).replace(/^[\\/]+/, '').replaceAll('\\', '/'))
    .sort();
}

/**
 * Identifies the parser and AST artifact compiler implementation: the sources and the build configuration of
 * packages/template-ts, which the build of the package turns into dist with the tools of package-lock.json, and the
 * artifact writer (T17.1-6). The digest reads only tracked sources, so a check computes it without building the package.
 */
export function astCompilerDigest() {
  return digestFiles([
    ...filesUnder('packages/template-ts/src'),
    'packages/template-ts/package.json',
    'packages/template-ts/tsconfig.json',
    'packages/template-ts/tsup.config.ts',
    'package-lock.json',
    'tools/compiler/ast-artifact.mjs',
  ]);
}

/** Identifies the shared generated compiler and one language backend. */
export function generatedCompilerDigest(language) {
  const backend = language === 'ts' ? 'typescript' : language;
  return digestFiles([
    'tools/compiler/backend-support.mjs',
    `tools/compiler/backends/${backend}.mjs`,
    'tools/compiler/compiler.mjs',
    'tools/compiler/generated-artifact.mjs',
    'tools/compiler/ir.mjs',
  ]);
}

/** Identifies TypeScript-to-JavaScript delivery compilation. */
export function typescriptDeliveryDigest() {
  return digestFiles([
    'package-lock.json',
    'tools/compiler/backend-support.mjs',
    'tools/compiler/backends/typescript.mjs',
    'tools/compiler/compiler.mjs',
    'tools/compiler/generated-artifact.mjs',
    'tools/compiler/ir.mjs',
    'tools/showcase/compile-generated.mjs',
  ]);
}
