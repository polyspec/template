#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const benchmark = JSON.parse(readFileSync(join(root, 'examples/site/data/mode-benchmark.json'), 'utf8'));
const check = process.argv.includes('--check');
const start = '<!-- benchmark-results:start -->';
const end = '<!-- benchmark-results:end -->';

function table(korean) {
  const header = korean
    ? '| 언어 | 모드 | Cold process | 전체 render | Prepared render | Persistent RSS |'
    : '| Language | Mode | Cold process | Full render | Prepared render | Persistent RSS |';
  const rows = benchmark.results.map(row => `| ${row.language === 'typescript' ? 'TypeScript' : row.language[0].toUpperCase() + row.language.slice(1)} | ${row.mode === 'generated' ? 'generated' : 'AST'} | ${row.cold_process_ms.median.toFixed(2)} ms | ${row.render_ms.median.toFixed(4)} ms | ${row.prepared_render_ms.median.toFixed(4)} ms | ${row.persistent_rss_mib.median.toFixed(2)} MiB |`);
  return [start, header, '| --- | --- | ---: | ---: | ---: | ---: |', ...rows, end].join('\n');
}

for (const [name, korean] of [['benchmark.md', false], ['benchmark.ko.md', true]]) {
  const path = join(root, 'docs/operations', name);
  const source = readFileSync(path, 'utf8');
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(source)) throw new Error(`${name} has no generated benchmark region`);
  const next = source.replace(pattern, table(korean));
  if (check && next !== source) throw new Error(`${name} benchmark table is stale`);
  if (!check) writeFileSync(path, next);
}
process.stdout.write(`${check ? 'checked' : 'updated'} benchmark document tables\n`);
