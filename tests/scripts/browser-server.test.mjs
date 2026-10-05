// Tests that the browser test starts its static server as a step without a time limit: a server that starts later than
// a small limit would allow is used once it reports that it listens (T17.11). The slow server is a wrapper that
// tests/browser/run.mjs receives as its server command, so the test does not depend on the order of PATH, and the
// wrapper records that it ran (T20.2). run.mjs runs no build step: it tests the package build that exists.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the browser test waits for a server that starts slowly and runs the browser cases', { timeout: 120_000 }, (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-server-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const ran = path.join(directory, 'ran');
  // The server command records that it ran, waits 1.5 s and then runs the server with this Node.js.
  const wrapper = path.join(directory, 'slow-server');
  writeFileSync(wrapper, `#!/bin/sh\necho "$@" > "${ran}"\nsleep 1.5\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
  const run = spawnSync(process.execPath, [path.join(ROOT, 'tests/browser/run.mjs'), '--server-command', wrapper], { cwd: ROOT, encoding: 'utf8' });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.ok(existsSync(ran), `the slow server command ${wrapper} was not run:\n${output}`);
  assert.equal(readFileSync(ran, 'utf8').trim(), path.join(ROOT, 'tests/browser/server.mjs'));
  assert.match(output, /\[server\] listening on http:\/\/127\.0\.0\.1:\d+\n/);
  assert.match(output, /✔ start the static server \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/);
  assert.match(output, /\d+ passed/);
  // Another test may publish a new package build meanwhile (T18.8-2); this run builds nothing itself.
  assert.doesNotMatch(output, /build-package:|tsup|Build start|make\[|npm (ci|install)/, 'run.mjs ran a build step');
});
