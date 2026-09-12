#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), 'template-dependency-policy-'));
try {
  const policy = JSON.parse(readFileSync(join(root, 'config/dependency-policy.json'), 'utf8'));
  policy.exceptions = policy.exceptions.filter(item => !(item.ecosystem === 'npm' && item.package === 'esbuild'));
  const mutation = join(directory, 'policy.json');
  writeFileSync(mutation, `${JSON.stringify(policy, null, 2)}\n`);
  const result = spawnSync(process.execPath, ['scripts/check-dependency-policy.mjs', mutation], { cwd: root, encoding: 'utf8' });
  if (result.status === 0 || !result.stderr.includes('outdated npm dependency has no exception')) throw new Error('dependency policy accepted an unexplained old-version mutation');
  process.stdout.write('dependency policy: unexplained old-version mutation rejected\n');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
