// Tests that tests/runner/conformance.mjs prints the result of each case in each language when it
// finishes, with its elapsed time, before the summary table.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('each case prints its result line in each language before the summary', () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'tests/runner/conformance.mjs'), '--langs', 'ts', '--case', 'whitespace'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.split('\n');
  const header = lines.findIndex(line => /^case\s+ts\s*$/.test(line));
  assert.ok(header > 0, run.stdout);
  const results = lines.slice(0, header);
  const cases = lines.slice(header + 1).filter(line => /^whitespace\//.test(line)).map(line => line.split(/\s+/)[0]);
  assert.ok(cases.length > 1, run.stdout);
  assert.deepEqual(results.map(line => /^(\S+) \[ts\] pass \(\d+ ms\)$/.exec(line)?.[1]), cases);
});
