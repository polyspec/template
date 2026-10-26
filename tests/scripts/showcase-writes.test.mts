// make showcase measures the benchmark into var/ and leaves the committed benchmark and its documents to make bench (T26.7-87).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('make showcase writes no tracked benchmark file', () => {
  const run = spawnSync('make', ['--no-print-directory', '-n', 'showcase'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: '' } });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.split('\n');
  const measure = lines.find(line => line.includes('benchmark-modes.mts'));
  assert.ok(measure, 'make showcase runs the benchmark');
  assert.ok(measure.includes('--output var/showcase/mode-benchmark.json'), measure);
  assert.ok(lines.some(line => line.includes('check-benchmark-results.mts var/showcase/mode-benchmark.json')));
  assert.equal(lines.some(line => line.includes('update-benchmark-docs.mts')), false);
});

test('make bench installs the Python package before measuring its adapter', () => {
  const run = spawnSync('make', ['--no-print-directory', '-n', '-W', 'packages/python/pyproject.toml', 'bench'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: '' } });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.split('\n');
  const install = lines.findIndex(line => line.includes('pip install') && line.includes('packages/python/pylock.toml'));
  const measure = lines.findIndex(line => line.includes('benchmark-modes.mts'));
  assert.ok(install >= 0 && measure > install, 'bench must install the Python package before the measurement');
});

test('script tests prepare the generated adapter contracts and showcase programs before discovery', { timeout: 5000 }, () => {
  const run = spawnSync('make', ['--no-print-directory', '-n', 'template-test-scripts'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  const testAt = run.stdout.indexOf('node -- tests/scripts/');
  assert.ok(testAt >= 0, 'the script-unit command is present');
  for (const generator of ['scripts/generate-showcase-contract.mts', 'examples/showcase/compile-generated.mts', 'scripts/generate-compiler-interface.mts']) {
    const at = run.stdout.indexOf(generator);
    assert.ok(at >= 0 && at < testAt, `${generator} must prepare clean-checkout fixtures before script tests`);
  }
});
