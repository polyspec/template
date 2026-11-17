// Tests that tests/runner/delimiter-matrix.mts prints the result of each delimiter pair in each
// language when it finishes, with its elapsed time, while the matrix runs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RESULT = /^("[^\n]*"|quoted \d+ "[^\n]*") \[ts\] (?:pass|fail) \(\d+ ms\)$/;

// The test judges by the order of two events of the child, its third result line and its exit, and has no time limit (HR-89).
test('each delimiter pair prints its result line in each language as it finishes', async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'tests/runner/delimiter-matrix.mts')], { cwd: ROOT, env: { ...process.env, DELIMITER_MATRIX_LANGS: 'ts' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  // The matrix runs 900 pairs; the test reads the first three result lines and stops it. The lines come before the exit.
  const outcome = await new Promise(resolve => {
    child.stdout.setEncoding('utf8').on('data', data => {
      stdout += data;
      if (stdout.split('\n').length > 3) resolve('printed');
    });
    child.on('close', () => resolve('closed'));
  });
  child.kill('SIGKILL');
  assert.equal(outcome, 'printed', `the matrix exited before three result lines: ${JSON.stringify(stdout)}`);
  const lines = stdout.split('\n').slice(0, 3);
  for (const line of lines) assert.match(line, RESULT);
  assert.deepEqual(lines.map(line => RESULT.exec(line)?.[1]), ['"!!"', '"!\\""', '"!#"']);
});
