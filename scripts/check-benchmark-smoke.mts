#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchmarkResultDocument } from './benchmark-result.mts';
import { validateBenchmark } from './check-benchmark-results.mts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const result = spawnSync(process.execPath, ['examples/showcase/benchmark-modes.mts'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, BENCH_SAMPLES: '3', BENCH_ITERATIONS: '100', BENCH_WARMUP: '5' },
});
if (result.status !== 0) throw new Error(`benchmark smoke failed\n${result.stdout}${result.stderr}`);
const benchmark = benchmarkResultDocument.parse(result.stdout, 'the output of examples/showcase/benchmark-modes.mts');
validateBenchmark(benchmark);
process.stdout.write(`benchmark smoke: ${benchmark.results.length} fresh equal-output rows passed\n`);
