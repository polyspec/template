// What the AST and the generated artifact writers share: the digest of bytes, the JSON of a manifest and the compiler
// contract whose digest every artifact records.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { packageRoot } from './package-root.mts';

export const contractPath = join(packageRoot, 'interface.json');
export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
