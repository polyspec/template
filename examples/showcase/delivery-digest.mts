// Computes the digest of the TypeScript-to-JavaScript delivery compilation of the showcase, which artifact refresh records.
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestFiles, generatedCompilerFiles } from '../../packages/compiler/compiler-digest.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Whether `value` is an entry of digestFiles: a label and an absolute path. */
function isFileEntry(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';
}

/** The entries of the TypeScript backend for digestFiles; compiler-digest.mjs declares no types, so they are checked. */
function typescriptCompilerFiles(): [string, string][] {
  const files: unknown = generatedCompilerFiles('ts');
  if (!Array.isArray(files) || !files.every(isFileEntry)) throw new Error(`generatedCompilerFiles('ts') returned no [label, path] entries: ${JSON.stringify(files)}`);
  return files;
}

/** Identifies TypeScript-to-JavaScript delivery compilation: the TypeScript backend, its tools and this compilation. */
export function typescriptDeliveryDigest(): string {
  return digestFiles([
    ...typescriptCompilerFiles(),
    ...['package-lock.json', 'examples/showcase/compile-generated.mts'].map((path): [string, string] => [path, join(root, path)]),
  ]);
}
