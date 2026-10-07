// Computes the digest of the TypeScript-to-JavaScript delivery compilation of the showcase, which artifact refresh records.
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestFiles, generatedCompilerFiles } from '../../packages/template-compiler/compiler-digest.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Identifies TypeScript-to-JavaScript delivery compilation: the TypeScript backend, its tools and this compilation. */
export function typescriptDeliveryDigest() {
  return digestFiles([
    ...generatedCompilerFiles('ts'),
    ...['package-lock.json', 'tools/showcase/compile-generated.mjs'].map(path => [path, join(root, path)]),
  ]);
}
