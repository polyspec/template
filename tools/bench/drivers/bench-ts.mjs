#!/usr/bin/env node
// Benchmark driver for the TypeScript implementation.
// Usage: node bench-ts.mjs FIXTURE_DIR ITERS WARMUP [TARGET] [LEGACY_WRAPPERS]
// Parses the templates once, renders WARMUP times, then measures ITERS renders.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { Engine, MapLoader, parseJsonBytes } = await import(join(root, 'packages', 'template-ts', 'dist', 'index.mjs'));

const [fixtureArg, itersArg, warmupArg, targetArg = 'input.tpl', legacyWrappersArg = 'false'] = process.argv.slice(2);
if (!fixtureArg || !itersArg || !warmupArg) {
  process.stderr.write('usage: bench-ts.mjs FIXTURE_DIR ITERS WARMUP\n');
  process.exit(1);
}
const fixture = resolve(fixtureArg);
const iters = Number(itersArg);
const warmup = Number(warmupArg);
const target = targetArg;

function collectTemplates(dir, prefix, into) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTemplates(path, `${prefix}${entry.name}/`, into);
    else if (entry.name.endsWith('.tpl')) into[`${prefix}${entry.name}`] = readFileSync(path, 'utf8');
  }
  return into;
}

function readJson(name) {
  const path = join(fixture, name);
  return existsSync(path) ? parseJsonBytes(new Uint8Array(readFileSync(path))) : null;
}

function toPlain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [key, toPlain(item)]));
  if (Array.isArray(value)) return value.map(toPlain);
  return value;
}

const engine = new Engine({ loader: new MapLoader(collectTemplates(fixture, '', {})), legacyWrappers: legacyWrappersArg === 'true' });
const assign = readJson('data.json') ?? {};
const options = {};
const define = readJson('define.json');
const env = readJson('env.json');
if (define) options.define = toPlain(define);
if (env) options.env = toPlain(env);

// The first render parses every template and fills the engine cache.
const prepared = engine.prepare(target, assign, options);
const output = prepared.render();
for (let i = 0; i < warmup; i++) prepared.render();

const start = process.hrtime.bigint();
for (let i = 0; i < iters; i++) prepared.render();
const seconds = Number(process.hrtime.bigint() - start) / 1e9;
const repeated = prepared.render();

process.stdout.write(JSON.stringify({
  lang: 'ts',
  fixture: basename(fixture),
  iters,
  seconds,
  output_sha256: createHash('sha256').update(output, 'utf8').digest('hex'),
  repeat_sha256: createHash('sha256').update(repeated, 'utf8').digest('hex'),
}) + '\n');
