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

/** Identifies the parser and AST artifact compiler implementation. */
export function astCompilerDigest() {
  const distribution = readdirSync(join(projectRoot, 'packages/template-ts/dist'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
    .map(entry => `packages/template-ts/dist/${entry.name}`);
  return digestFiles([
    ...distribution,
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
