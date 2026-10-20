// Tests the vitest collection of the root (T26.7-46): vitest lists no test file under var/, where the mise state keeps
// copies of the template, and it lists packages/ts/tests/smoke.test.ts exactly once.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SMOKE = 'packages/ts/tests/smoke.test.ts';

test('vitest collects no test file under var/ and runs the smoke test once', { timeout: 120000 }, () => {
  const vitest = path.join(ROOT, 'node_modules/vitest/vitest.mjs');
  const run = spawnSync(process.execPath, [vitest, 'list', '--filesOnly'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, `vitest list failed: ${run.stderr}`);

  const listed = run.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => path.relative(ROOT, path.resolve(ROOT, line)).split(path.sep).join('/'));

  const offending = listed.filter((file) => file.startsWith('var/'));
  assert.deepEqual(
    offending,
    [],
    `vitest collects ${offending.length} file(s) under var/, first: ${offending.slice(0, 3).join(', ')}`,
  );
  assert.equal(
    listed.filter((file) => file === SMOKE).length,
    1,
    `${SMOKE} must be listed exactly once`,
  );
});
