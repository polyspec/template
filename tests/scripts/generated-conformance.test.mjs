// Tests that the four generated conformance runners print the result of each case with its elapsed
// time, and that the bounded steps they use stop a command or a worker at its deadline.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inWorker, runBounded } from '../runner/bounded.mjs';
import { slowCommandPath } from './slow-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// A runner compiles the case and, for Go and Rust, a test binary.
const COMPILES = { timeout: 300_000 };

function generated(language, env = process.env) {
  const run = spawnSync(process.execPath, [path.join(ROOT, `tests/runner/conformance-generated-${language}.mjs`), '--case', 'echo/path'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  return run.stdout;
}

test('the TypeScript runner prints the tsc step and each render with its elapsed time', COMPILES, () => {
  const stdout = generated('ts');
  assert.match(stdout, /▶ tsc \(1 files\)\n[^]*✔ tsc \(1 files\) \(\d+\.\ds\)\n/);
  assert.match(stdout, /▶ echo\/path › render\n[^]*✔ echo\/path › render \(\d+\.\ds\)\n/);
  assert.match(stdout, /1\/1 TypeScript generated conformance cases passed/);
});

test('the tsc step has no deadline and is judged by the exit code of tsc', COMPILES, () => {
  // npx waits 1.5 s before it runs tsc, so tsc ends later than a small limit would allow.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-tsc-'));
  try {
    const stdout = generated('ts', { ...process.env, PATH: slowCommandPath(directory, 'npx', 1.5) });
    assert.match(stdout, /▶ tsc \(1 files\)\n[^]*✔ tsc \(1 files\) \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/);
    assert.match(stdout, /1\/1 TypeScript generated conformance cases passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the Go runner prints each case test with its elapsed time', COMPILES, () => {
  const stdout = generated('go');
  assert.match(stdout, /▶ \S+\/case_echo_path › TestGeneratedConformance\n[^]*✔ \S+\/case_echo_path › TestGeneratedConformance \(\d+\.\ds\)\n/);
  assert.match(stdout, /✔ go .*: 1 passed, 0 failed, 0 timed out, 0 skipped/);
});

test('the Rust runner names each test after its case and prints it with its elapsed time', COMPILES, () => {
  const stdout = generated('rust');
  assert.match(stdout, /▶ tests\/generated_conformance_check\.rs › case_echo_path\n[^]*✔ tests\/generated_conformance_check\.rs › case_echo_path \(\d+\.\ds\)\n/);
  assert.match(stdout, /✔ cargo .*: 1 passed, 0 failed, 0 timed out, 0 skipped/);
});

test('the PHP runner prints each case with its elapsed time', COMPILES, () => {
  const stdout = generated('php');
  assert.match(stdout, /▶ echo\/path\n[^]*✔ echo\/path \(\d+\.\ds\)\n/);
  assert.match(stdout, /1\/1 PHP generated conformance cases passed/);
});

test('a command that outlives its deadline is killed with its process group', async () => {
  const started = Date.now();
  // The child starts a grandchild in the same group; both end at the deadline.
  const result = await runBounded(process.execPath, ['-e', "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'inherit' }); setTimeout(() => {}, 600000)"], { cwd: ROOT, timeoutMs: 500 });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 10_000, 'the command was not stopped at its deadline');
  const ended = await runBounded(process.execPath, ['-e', 'process.stdout.write("done")'], { cwd: ROOT, timeoutMs: 10_000 });
  assert.deepEqual(ended, { status: 0, stdout: 'done', stderr: '', timedOut: false });
});

test('a worker that does not post its result by its deadline is terminated', async () => {
  const started = Date.now();
  assert.deepEqual(await inWorker(new URL('data:text/javascript,for (;;) {}'), null, 500), { timedOut: true });
  assert.ok(Date.now() - started < 10_000, 'the worker was not stopped at its deadline');
  assert.deepEqual(await inWorker(new URL("data:text/javascript,import { parentPort } from 'node:worker_threads'; parentPort.postMessage({ html: 'x' });"), null, 10_000), { html: 'x' });
});
