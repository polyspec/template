// Tests the VS Code of the integration test (T20.1-4): the integration run reads only the copy that the VS Code installer
// of kit (@polyspec/kit/install-vscode, T23.4) installs and fails with `run make install-vscode` without it, before it
// downloads. kit tests the installer itself.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { vscodeCopy } from '@polyspec/kit/install-vscode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION = path.join(ROOT, 'packages/vscode');

function directory(t) {
  const created = mkdtempSync(path.join(tmpdir(), 'template-install-vscode-'));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
}

test('the integration run without an installed copy fails with run make install-vscode and downloads nothing', (t) => {
  const tools = directory(t);
  const run = spawnSync(process.execPath, ['tests/integration/run.mjs', '--vscode', tools], { cwd: EXTENSION, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, new RegExp(`VS Code ${vscodeCopy(EXTENSION, tools).version} is not installed in .*; run make install-vscode$`, 'm'));
  assert.deepEqual(readdirSync(tools), [], 'the run wrote into the tools directory');
});
