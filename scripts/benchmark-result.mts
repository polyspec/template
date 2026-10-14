// The result of the mode benchmark, examples/site/data/mode-benchmark.json, which examples/showcase/benchmark-modes.mts
// writes: described once by its type and its JSON Schema.
import { jsonDocument } from './json-document.mts';

/** The metrics of each row, each a median and a 95th percentile. */
export const METRICS = ['compile_ms', 'cold_process_ms', 'cold_rss_mib', 'render_ms', 'prepared_render_ms', 'persistent_process_ms_per_render', 'persistent_rss_mib'] as const;
export type Metric = (typeof METRICS)[number];

/** One row: a language in a mode with its metrics. */
export type BenchmarkRow = Record<Metric, { median: number; p95: number }> & {
  language: string;
  mode: string;
  samples: number;
  iterations: number;
  artifact_bytes: number;
  output_sha256: string;
  output_bytes: number;
};

/** The benchmark result. */
export interface BenchmarkResult {
  schema: number;
  results: BenchmarkRow[];
}

const metric = { type: 'object', required: ['median', 'p95'], properties: { median: { type: 'number' }, p95: { type: 'number' } } };

export const benchmarkResultDocument = jsonDocument<BenchmarkResult>('mode benchmark result', {
  type: 'object',
  required: ['schema', 'results'],
  properties: {
    schema: { type: 'integer' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['language', 'mode', 'samples', 'iterations', 'artifact_bytes', 'output_sha256', 'output_bytes', ...METRICS],
        properties: {
          language: { type: 'string' },
          mode: { type: 'string' },
          samples: { type: 'number' },
          iterations: { type: 'number' },
          artifact_bytes: { type: 'number' },
          output_sha256: { type: 'string' },
          output_bytes: { type: 'number' },
          ...Object.fromEntries(METRICS.map(name => [name, metric])),
        },
      },
    },
  },
});
