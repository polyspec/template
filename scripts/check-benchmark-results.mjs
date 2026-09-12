#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const path = process.argv[2] ?? join(root, 'examples/site/data/mode-benchmark.json');

export function validateBenchmark(result) {
  if (result?.schema !== 1 || !Array.isArray(result.results)) throw new Error('benchmark result schema is invalid');
  const expected = new Set(['typescript/ast', 'typescript/generated', 'go/ast', 'go/generated', 'rust/ast', 'rust/generated', 'php/ast', 'php/generated']);
  let hash = null;
  let bytes = null;
  for (const row of result.results) {
    const key = `${row.language}/${row.mode}`;
    if (!expected.delete(key)) throw new Error(`benchmark row is missing or duplicated: ${key}`);
    if (!Number.isInteger(row.samples) || row.samples < 3 || !Number.isInteger(row.iterations) || row.iterations < 1) throw new Error(`${key} sample contract is invalid`);
    for (const field of ['compile_ms', 'cold_process_ms', 'cold_rss_mib', 'render_ms', 'prepared_render_ms', 'persistent_process_ms_per_render', 'persistent_rss_mib']) {
      const metric = row[field];
      if (!Number.isFinite(metric?.median) || !Number.isFinite(metric?.p95) || metric.median < 0 || metric.p95 < metric.median) throw new Error(`${key} ${field} is invalid`);
    }
    if (!Number.isInteger(row.artifact_bytes) || row.artifact_bytes < 1) throw new Error(`${key} artifact size is invalid`);
    hash ??= row.output_sha256;
    bytes ??= row.output_bytes;
    if (row.output_sha256 !== hash || row.output_bytes !== bytes) throw new Error(`${key} output contract differs`);
  }
  if (expected.size) throw new Error(`benchmark rows are missing: ${[...expected].join(', ')}`);
  if (typeof hash !== 'string' || hash.length !== 64 || !Number.isInteger(bytes) || bytes < 1) throw new Error('benchmark output identity is invalid');
}

const result = JSON.parse(readFileSync(path, 'utf8'));
validateBenchmark(result);
const mutation = structuredClone(result);
mutation.results[0].output_sha256 = '0'.repeat(64);
let rejected = false;
try { validateBenchmark(mutation); } catch { rejected = true; }
if (!rejected) throw new Error('benchmark mutation was not rejected');
process.stdout.write(`benchmark: ${result.results.length} equal-output rows and mutation rejection passed\n`);
