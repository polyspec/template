// Tests that the long-running steps of the checks, the build of a driver and the commands of the
// package install checks, have no time limit: each prints its start and its result with its elapsed time
// and is judged by its exit status.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Runs `source` as an ES module in a new process from the repository root.
function module(source, env = process.env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: ROOT, env, encoding: 'utf8' });
}

test('a driver build that runs longer than a small limit passes by its exit code', () => {
  const drivers = JSON.stringify(path.join(ROOT, 'tests/runner/drivers.mjs'));
  const slow = module(`import { build } from ${drivers}; build('slow', process.execPath, ['-e', 'setTimeout(() => console.log("built"), 1500)'], process.cwd());`);
  assert.equal(slow.status, 0, slow.stderr);
  assert.match(slow.stderr, /^▶ build slow: \S+ -e .*\nbuilt\n✔ build slow: \S+ -e .* \(1\.\ds\)\n$/);
  assert.equal(slow.stdout, '');
  const failing = module(`import { build } from ${drivers}; build('failing', process.execPath, ['-e', 'process.exit(3)'], process.cwd());`);
  assert.notEqual(failing.status, 0);
  assert.match(failing.stderr, /✖ build failing: \S+ -e process\.exit\(3\) exited with 3 \(\d\.\ds\)\n/);
});
