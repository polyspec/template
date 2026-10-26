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
