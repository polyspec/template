// Tests the VS Code of the integration test (T20.1-4): scripts/install-vscode.mjs publishes a downloaded copy into the
// tools directory by a rename, leaves no directory of its download and does nothing when the copy is present, and the
// integration run reads only the installed copy and fails with `run make install-vscode` without it, before it downloads.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { installVSCode, installedExecutable, vscodeCopy } from '../../scripts/install-vscode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function directory(t) {
  const created = mkdtempSync(path.join(tmpdir(), 'template-install-vscode-'));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
}

// A download of @vscode/test-electron's layout: the copy and, after its last file, is-complete.
function fakeDownload(calls) {
  return async ({ version, platform, cachePath }) => {
    calls.push(cachePath);
    const copy = path.join(cachePath, `vscode-${platform}-${version}`);
    mkdirSync(copy, { recursive: true });
    writeFileSync(path.join(copy, 'product.json'), '{}');
    writeFileSync(path.join(copy, 'is-complete'), '');
  };
}

test('an install publishes the downloaded copy by a rename and a second install downloads nothing', async (t) => {
  const tools = directory(t);
  const calls = [];
  const installed = await installVSCode(tools, fakeDownload(calls));
  assert.equal(installed, vscodeCopy(tools).directory);
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(`${tools.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.next-\\d+$`));
  assert.deepEqual(readdirSync(tools), [path.basename(installed)], 'the install left the directory of its download');
  assert.ok(existsSync(path.join(installed, 'product.json')));
  await installVSCode(tools, fakeDownload(calls));
  assert.equal(calls.length, 1, 'an install of a present copy downloaded again');
});

test('an incomplete download publishes nothing and names its directory', async (t) => {
  const tools = directory(t);
  const incomplete = async ({ version, platform, cachePath }) => {
    mkdirSync(path.join(cachePath, `vscode-${platform}-${version}`), { recursive: true });
  };
  await assert.rejects(installVSCode(tools, incomplete), /left no complete copy in .*\.next-\d+\/vscode-/);
  assert.deepEqual(readdirSync(tools), []);
  assert.throws(() => installedExecutable(tools), /is not installed in .*; run make install-vscode$/);
});

test('the integration run without an installed copy fails with run make install-vscode and downloads nothing', (t) => {
  const tools = directory(t);
  const run = spawnSync(process.execPath, ['tests/integration/run.mjs', '--vscode', tools], { cwd: path.join(ROOT, 'packages/template-vscode'), encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, new RegExp(`VS Code ${vscodeCopy(tools).version} is not installed in .*; run make install-vscode$`, 'm'));
  assert.deepEqual(readdirSync(tools), [], 'the run wrote into the tools directory');
});
