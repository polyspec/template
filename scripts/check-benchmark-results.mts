#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const path = process.argv[2] ?? join(root, 'examples/site/data/mode-benchmark.json');

type Metric = 'compile_ms' | 'cold_process_ms' | 'cold_rss_mib' | 'render_ms' | 'prepared_render_ms' | 'persistent_process_ms_per_render' | 'persistent_rss_mib';
const METRICS: Metric[] = ['compile_ms', 'cold_process_ms', 'cold_rss_mib', 'render_ms', 'prepared_render_ms', 'persistent_process_ms_per_render', 'persistent_rss_mib'];

/** One row of examples/site/data/mode-benchmark.json: a language in a mode with its metrics. */
export type BenchmarkRow = Partial<Record<Metric, { median: number; p95: number }>> & {
  language: string;
  mode: string;
  samples: number;
  iterations: number;
  artifact_bytes: number;
  output_sha256: string;
  output_bytes: number;
};

/** The benchmark result that benchmark-modes.mjs writes. */
export interface BenchmarkResult {
  schema: number;
  results: BenchmarkRow[];
}

export function validateBenchmark(result: BenchmarkResult): void {
  if (result?.schema !== 1 || !Array.isArray(result.results)) throw new Error('benchmark result schema is invalid');
  const expected = new Set(['typescript/ast', 'typescript/generated', 'go/ast', 'go/generated', 'rust/ast', 'rust/generated', 'php/ast', 'php/generated']);
  let hash: string | null = null;
  let bytes: number | null = null;
  for (const row of result.results) {
    const key = `${row.language}/${row.mode}`;
    if (!expected.delete(key)) throw new Error(`benchmark row is missing or duplicated: ${key}`);
    if (!Number.isInteger(row.samples) || row.samples < 3 || !Number.isInteger(row.iterations) || row.iterations < 1) throw new Error(`${key} sample contract is invalid`);
    for (const field of METRICS) {
      const metric = row[field];
      if (metric === undefined || !Number.isFinite(metric.median) || !Number.isFinite(metric.p95) || metric.median < 0 || metric.p95 < metric.median) throw new Error(`${key} ${field} is invalid`);
    }
    if (!Number.isInteger(row.artifact_bytes) || row.artifact_bytes < 1) throw new Error(`${key} artifact size is invalid`);
    hash ??= row.output_sha256;
    bytes ??= row.output_bytes;
    if (row.output_sha256 !== hash || row.output_bytes !== bytes) throw new Error(`${key} output contract differs`);
  }
  if (expected.size) throw new Error(`benchmark rows are missing: ${[...expected].join(', ')}`);
  if (typeof hash !== 'string' || hash.length !== 64 || typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1) throw new Error('benchmark output identity is invalid');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = JSON.parse(readFileSync(path, 'utf8')) as BenchmarkResult;
  validateBenchmark(result);
  const mutation = structuredClone(result);
  const mutated = mutation.results[0];
  if (!mutated) throw new Error(`${path} holds no benchmark row to change`);
  mutated.output_sha256 = '0'.repeat(64);
  let rejected = false;
  try { validateBenchmark(mutation); } catch { rejected = true; }
  if (!rejected) throw new Error('benchmark mutation was not rejected');
  process.stdout.write(`benchmark: ${result.results.length} equal-output rows and mutation rejection passed\n`);
}
