// Tests that the four generated conformance runners print the result of each case with its elapsed
// time, and that the steps they use resolve the result of a command or a worker, without a time limit (T28.146).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { inWorker, runStep } from '../runner/bounded.mts';
import { slowCommandPath } from './slow-command.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The runners compile with the build of legacy/packages/ts and run PHP with the Composer packages of the root composer.json. The test
// builds and installs them itself, which does nothing when their inputs are unchanged (T19.6).
before(() => {
  const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-package.mts'), '--package', 'ts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, `the build of ts failed:\n${build.stdout}${build.stderr}`);
  const composer = spawnSync(process.execPath, [path.join(ROOT, 'scripts/composer-install.mts'), '.'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(composer.status, 0, `${composer.stdout}${composer.stderr}`);
});

function generated(language: string, env: NodeJS.ProcessEnv = process.env) {
  const run = spawnSync(process.execPath, [path.join(ROOT, `tests/runner/conformance-generated-${language}.mts`), '--case', 'echo/path'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  return run.stdout;
}

test('the TypeScript runner prints the tsc step and each render with its elapsed time', () => {
  const stdout = generated('ts');
  assert.match(stdout, /▶ tsc \(1 files\)\n[^]*✔ tsc \(1 files\) \(\d+\.\ds\)\n/);
  assert.match(stdout, /▶ echo\/path › render\n[^]*✔ echo\/path › render \(\d+\.\ds\)\n/);
  assert.match(stdout, /1\/1 TypeScript generated conformance cases passed/);
});

test('the tsc step has no deadline and is judged by the exit code of tsc', () => {
  // Every node started by name, tsc included, waits 1.5 s, so tsc ends later than a small limit would allow.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-tsc-'));
  try {
    const stdout = generated('ts', { ...process.env, PATH: slowCommandPath(directory, 'node', 1.5) });
    assert.match(stdout, /▶ tsc \(1 files\)\n[^]*✔ tsc \(1 files\) \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/);
    assert.match(stdout, /1\/1 TypeScript generated conformance cases passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the Go runner prints each case test with its elapsed time', () => {
  const stdout = generated('go');
  assert.match(stdout, /▶ \S+\/case_echo_path › TestGeneratedConformance\n[^]*✔ \S+\/case_echo_path › TestGeneratedConformance \(\d+\.\ds\)\n/);
  assert.match(stdout, /✔ go .*: 1 passed, 0 failed, 0 skipped/);
});

test('the Rust runner names each test after its case and prints it with its elapsed time', () => {
  const stdout = generated('rust');
  assert.match(stdout, /▶ tests\/generated_conformance_check\.rs › case_echo_path\n[^]*✔ tests\/generated_conformance_check\.rs › case_echo_path \(\d+\.\ds\)\n/);
  assert.match(stdout, /✔ cargo .*: 1 passed, 0 failed, 0 skipped/);
});

test('the PHP runner prints each case with its elapsed time', () => {
  const stdout = generated('php');
  assert.match(stdout, /▶ echo\/path\n[^]*✔ echo\/path \(\d+\.\ds\)\n/);
  assert.match(stdout, /1\/1 PHP generated conformance cases passed/);
});

test('a step resolves the output of its command and a worker the message it posts', async () => {
  const ended = await runStep(process.execPath, ['-e', 'process.stdout.write("done")'], { cwd: ROOT });
  assert.deepEqual(ended, { status: 0, stdout: 'done', stderr: '' });
  assert.deepEqual(await inWorker(new URL("data:text/javascript,import { parentPort } from 'node:worker_threads'; parentPort.postMessage({ html: 'x' });"), null), { html: 'x' });
});
