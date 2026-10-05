// Tests that the browser test starts its static server as a step without a time limit: a server
// that starts later than a small limit would allow is used once it reports that it listens.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { slowCommandPath } from './slow-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The test builds the package and runs every browser case.
test('make test-browser waits for a server that starts slowly and runs the browser cases', { timeout: 300_000 }, () => {
  // Every node process started by name, the server included, waits 1.5 s before it starts.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-server-'));
  try {
    const run = spawnSync('make', ['-s', 'test-browser'], { cwd: ROOT, env: { ...process.env, PATH: slowCommandPath(directory, 'node', 1.5) }, encoding: 'utf8' });
    const output = `${run.stdout}${run.stderr}`;
    assert.equal(run.status, 0, output);
    assert.match(output, /\[server\] listening on http:\/\/127\.0\.0\.1:4173\n/);
    assert.match(output, /✔ start the static server \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/);
    assert.match(output, /\d+ passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
