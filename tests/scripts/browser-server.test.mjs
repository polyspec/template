// Tests that the browser test starts its static server as a step without a time limit: a server
// that starts later than a small limit would allow is used once it reports that it listens.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { slowCommandPath } from './slow-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The test runs every browser case against the package build that `make test-scripts` made before it.
// It runs tests/browser/run.mjs and not `make test-browser`, whose package build empties dist while the
// other tests of the run read it.
test('the browser test waits for a server that starts slowly and runs the browser cases', { timeout: 120_000 }, () => {
  // Every node process started by name, the server included, waits 1.5 s before it starts.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-server-'));
  const declarations = path.join(ROOT, 'packages/template-ts/dist/index.d.ts');
  const before = statSync(declarations);
  try {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'tests/browser/run.mjs')], { cwd: ROOT, env: { ...process.env, PATH: slowCommandPath(directory, 'node', 1.5) }, encoding: 'utf8' });
    const output = `${run.stdout}${run.stderr}`;
    assert.equal(run.status, 0, output);
    assert.match(output, /\[server\] listening on http:\/\/127\.0\.0\.1:\d+\n/);
    assert.match(output, /✔ start the static server \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/);
    assert.match(output, /\d+ passed/);
    // The package build that the other tests read stays the same file.
    const after = statSync(declarations);
    assert.deepEqual([after.ino, after.mtimeMs], [before.ino, before.mtimeMs]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
