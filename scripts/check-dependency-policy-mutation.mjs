#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), 'template-dependency-policy-'));
try {
  const original = JSON.parse(readFileSync(join(root, 'config/dependency-policy.json'), 'utf8'));
  let policy = structuredClone(original);
  policy.exceptions = policy.exceptions.filter(item => !(item.ecosystem === 'npm' && item.package === 'esbuild'));
  const mutation = join(directory, 'policy.json');
  writeFileSync(mutation, `${JSON.stringify(policy, null, 2)}\n`);
  const result = spawnSync(process.execPath, ['scripts/check-dependency-policy.mjs', mutation], { cwd: root, encoding: 'utf8' });
  if (result.status === 0 || !result.stderr.includes('outdated npm dependency has no exception')) throw new Error('dependency policy accepted an unexplained old-version mutation');
  policy = structuredClone(original);
  policy.composerPlatforms[0].php = '8.1.0';
  writeFileSync(mutation, `${JSON.stringify(policy, null, 2)}\n`);
  const platformResult = spawnSync(process.execPath, ['scripts/check-dependency-policy.mjs', mutation], { cwd: root, encoding: 'utf8' });
  if (platformResult.status === 0 || !platformResult.stderr.includes('does not lock Composer resolution')) throw new Error('dependency policy accepted a mismatched minimum Composer platform');
  process.stdout.write('dependency policy: unexplained old-version and mismatched Composer platform mutations rejected\n');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
