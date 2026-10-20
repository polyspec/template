// Tests the benchmark mode of examples/showcase/adapters/python.py (T22.6-17-1), which mirrors the benchmark mode of
// examples/showcase/adapters/php.php: with SHOWCASE_BENCH_ITERATIONS > 0 the adapter prints one JSON report of its
// renders, the output digests of which equal the digest of the normal report of the same scenario and mode. Invalid
// values of SHOWCASE_BENCH_ITERATIONS and SHOWCASE_BENCH_WARMUP fail and name the variable. No benchmark is run here:
// the scenario renders a few times only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { pythonEnvironment, pythonPackageInterpreter } from '../../scripts/python-toolchain.mts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const adapter = join(root, 'examples/showcase/adapters/python.py');
const scenario = join(root, 'examples/site/scenarios/empty-state');
const benchmarkKeys = ['bytes', 'iterations', 'language', 'outputSha256', 'preparedRenderSeconds', 'preparedSha256', 'renderSeconds', 'repeatSha256'];

type Mode = 'ast' | 'generated';

function run(mode: Mode, variables: Record<string, string>) {
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('SHOWCASE_')) inherited[key] = value;
  }
  return spawnSync(pythonPackageInterpreter, [adapter, scenario], {
    cwd: root,
    encoding: 'utf8',
    env: { ...inherited, ...pythonEnvironment(), SHOWCASE_EXECUTION_MODE: mode, ...variables },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lastLine(stdout: string): Record<string, unknown> {
  const last = stdout.trim().split('\n').at(-1);
  assert.ok(last !== undefined, 'the adapter printed no line');
  const report: unknown = JSON.parse(last);
  assert.ok(isRecord(report), 'the last line is a JSON object');
  return report;
}

for (const mode of ['ast', 'generated'] as const) {
  test(`the benchmark mode of the Python adapter reports the renders of ${mode} mode with the digest of its normal report`, () => {
    const normal = run(mode, {});
    assert.equal(normal.status, 0, normal.stderr);
    const expected = lastLine(normal.stdout);

    const measured = run(mode, { SHOWCASE_BENCH_ITERATIONS: '2', SHOWCASE_BENCH_WARMUP: '1' });
    assert.equal(measured.status, 0, measured.stderr);
    const report = lastLine(measured.stdout);

    assert.deepEqual(Object.keys(report).sort(), benchmarkKeys);
    assert.equal(report.language, 'python');
    assert.equal(report.iterations, 2);
    assert.ok(typeof report.renderSeconds === 'number' && report.renderSeconds >= 0);
    assert.ok(typeof report.preparedRenderSeconds === 'number' && report.preparedRenderSeconds >= 0);
    assert.equal(report.bytes, expected.bytes);
    assert.equal(report.outputSha256, expected.firstSha256);
    assert.equal(report.repeatSha256, expected.firstSha256);
    assert.equal(report.preparedSha256, expected.firstSha256);
  });
}

test('SHOWCASE_BENCH_ITERATIONS of 0 or unset gives the normal report', () => {
  const normal = run('ast', {});
  assert.equal(normal.status, 0, normal.stderr);
  const zero = run('ast', { SHOWCASE_BENCH_ITERATIONS: '0' });
  assert.equal(zero.status, 0, zero.stderr);
  assert.equal(zero.stdout, normal.stdout);
});

for (const value of ['abc', '-1', '1.5']) {
  test(`SHOWCASE_BENCH_ITERATIONS=${value} fails and names the variable`, () => {
    const result = run('ast', { SHOWCASE_BENCH_ITERATIONS: value });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('SHOWCASE_BENCH_ITERATIONS'), result.stderr);
  });
}

for (const value of ['abc', '-1']) {
  test(`SHOWCASE_BENCH_WARMUP=${value} fails and names the variable`, () => {
    const result = run('ast', { SHOWCASE_BENCH_ITERATIONS: '2', SHOWCASE_BENCH_WARMUP: value });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('SHOWCASE_BENCH_WARMUP'), result.stderr);
  });
}
