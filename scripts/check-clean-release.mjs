#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const parent = mkdtempSync(join(tmpdir(), 'template-release-'));
const checkout = join(parent, 'checkout');
let attached = false;

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stdout ?? ''}${result.stderr ?? ''}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}${detail}`);
  }
  return result.stdout ?? '';
}

try {
  const status = run('git', ['status', '--porcelain', '--untracked-files=all'], root, true);
  if (status.trim()) throw new Error('release-check requires a clean source worktree');

  run('git', ['worktree', 'add', '--detach', checkout, 'HEAD']);
  attached = true;
  run('npm', ['ci'], checkout);
  run('npx', ['playwright', 'install', 'chromium'], checkout);
  run('make', ['release-test-matrix'], checkout);
  process.stdout.write('release: isolated clean checkout passed\n');
} finally {
  if (attached) spawnSync('git', ['worktree', 'remove', '--force', checkout], { cwd: root, stdio: 'inherit' });
  rmSync(parent, { recursive: true, force: true });
}
