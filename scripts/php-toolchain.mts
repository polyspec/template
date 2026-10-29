// Standalone tooling uses the same installed PHP wrapper as Make and kit's runtime runners.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonDocument } from './json-document.mts';
import { toolsDirectory } from './tools-directory.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const phpInterpreter = join(toolsDirectory(root), 'bin/php');

/** The declared minor accepts its patch releases, and no other interpreter release. */
export function phpVersionIsAllowed(allowed: string[], version: string): boolean {
  const minor = /^(\d+\.\d+)\.\d+$/.exec(version)?.[1];
  return minor !== undefined && allowed.includes(minor);
}

/** The installed interpreter, checked against the checkout policy, without a PATH fallback. */
export function phpCommand(): string {
  if (!existsSync(phpInterpreter)) throw new Error('var/tools/bin/php is missing; run make install-tools');
  const { php } = jsonDocument<{ php: string[] }>('PHP toolchain', {
    type: 'object', required: ['php'], properties: { php: { type: 'array', minItems: 1, items: { type: 'string' } } },
  }).read(join(root, 'config/toolchain.json'));
  const result = spawnSync(phpInterpreter, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`var/tools/bin/php failed: ${result.error?.message ?? result.stderr.trim()}`);
  if (!phpVersionIsAllowed(php, result.stdout.trim())) {
    throw new Error(`var/tools/bin/php reported ${JSON.stringify(result.stdout.trim())}, expected ${php.join(', ')}; run make install-tools`);
  }
  return phpInterpreter;
}
