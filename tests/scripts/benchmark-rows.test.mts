// The benchmark check expects one row for every language and mode that the benchmark measures (T26.7-86).
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BenchmarkResult, BenchmarkRow } from '../../scripts/benchmark-result.mts';
import { validateBenchmark } from '../../scripts/check-benchmark-results.mts';

const metric = { median: 1, p95: 2 };
const row = (language: string, mode: string): BenchmarkRow => ({
  language, mode, samples: 3, iterations: 1, artifact_bytes: 10, output_sha256: 'a'.repeat(64), output_bytes: 5,
  compile_ms: metric, cold_process_ms: metric, cold_rss_mib: metric, render_ms: metric, prepared_render_ms: metric,
  persistent_process_ms_per_render: metric, persistent_rss_mib: metric,
});

test('the five measured languages in both modes are a valid result', () => {
  const languages = ['typescript', 'go', 'rust', 'php', 'python'];
  const result: BenchmarkResult = { schema: 1, results: languages.flatMap(language => [row(language, 'ast'), row(language, 'generated')]) };
  assert.doesNotThrow(() => validateBenchmark(result));
  assert.throws(() => validateBenchmark({ schema: 1, results: result.results.slice(0, -1) }), /benchmark rows are missing: python\/generated/);
});
