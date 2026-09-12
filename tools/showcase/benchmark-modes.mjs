#!/usr/bin/env node
// Measures production AST and generated artifacts under one output contract.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileAst } from '../compiler/ast-artifact.mjs';
import { compileSource } from '../compiler/compiler.mjs';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const scenario = join(root, 'examples/site/scenarios/scope-precedence');
const sampleCount = Number(process.env.BENCH_SAMPLES ?? 21);
const iterations = Number(process.env.BENCH_ITERATIONS ?? 1000);
const warmup = Number(process.env.BENCH_WARMUP ?? 20);
if (!Number.isInteger(sampleCount) || sampleCount < 3) throw new Error('BENCH_SAMPLES must be an integer of at least 3');
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('BENCH_ITERATIONS must be a positive integer');
if (!Number.isInteger(warmup) || warmup < 0) throw new Error('BENCH_WARMUP must be a non-negative integer');

const temporary = mkdtempSync(join(tmpdir(), 'polyspec-benchmark-'));
const cargo = existsSync(join(process.env.HOME ?? '', '.cargo/bin/cargo')) ? join(process.env.HOME ?? '', '.cargo/bin/cargo') : 'cargo';
const expected = readFileSync(join(scenario, 'expected.html'), 'utf8');
const expectedHash = createHash('sha256').update(expected).digest('hex');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: `${process.env.HOME ?? ''}/.cargo/bin:${process.env.PATH}` },
  });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summary(values) {
  return { median: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

function directoryBytes(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    total += entry.isDirectory() ? directoryBytes(child) : statSync(child).size;
  }
  return total;
}

function generatedPath(language) {
  if (language === 'go') return join(root, 'tools/showcase/adapters/go/generated/scope-precedence/generated.go');
  const extension = language === 'typescript' ? 'ts' : language;
  return join(root, `tools/showcase/adapters/generated/typed/scope-precedence.${extension}`);
}

function compileSamples(language, mode) {
  const times = [];
  const sizes = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const output = join(temporary, `compile-${language}-${mode}-${sample}`);
    const started = process.hrtime.bigint();
    compileAst({ root: scenario, output, entry: 'layout.tpl', refresh: 'dev', typeManifest: join(scenario, 'types.json') });
    if (mode === 'generated') {
      const target = language === 'typescript' ? 'ts' : language;
      const source = compileSource(join(output, 'manifest.json'), join(scenario, 'types.json'), target);
      sizes.push(Buffer.byteLength(source));
    } else {
      sizes.push(directoryBytes(output));
    }
    times.push(Number(process.hrtime.bigint() - started) / 1e6);
    rmSync(output, { recursive: true, force: true });
  }
  return { compile_ms: summary(times), artifact_bytes: percentile(sizes, 0.5) };
}

function timed(command, args, mode, count, warm) {
  const started = process.hrtime.bigint();
  const timeArguments = process.platform === 'darwin' ? ['-l'] : ['-v'];
  const result = spawnSync('/usr/bin/time', [...timeArguments, command, ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: `${process.env.HOME ?? ''}/.cargo/bin:${process.env.PATH}`,
      SHOWCASE_EXECUTION_MODE: mode === 'generated' ? 'generated' : 'ast',
      SHOWCASE_BENCH_ITERATIONS: String(count),
      SHOWCASE_BENCH_WARMUP: String(warm),
    },
  });
  const processMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status !== 0) throw new Error(`${command} benchmark failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  const payload = JSON.parse(result.stdout.trim().split('\n').at(-1));
  const rss = process.platform === 'darwin'
    ? Number(result.stderr.match(/(\d+)\s+maximum resident set size/)?.[1]) / 1024 / 1024
    : Number(result.stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/)?.[1]) / 1024;
  if (!Number.isFinite(rss)) throw new Error(`${command} benchmark did not report peak RSS`);
  if (payload.bytes !== Buffer.byteLength(expected) || payload.outputSha256 !== expectedHash || payload.repeatSha256 !== expectedHash || payload.preparedSha256 !== expectedHash) {
    throw new Error(`${payload.language}/${mode} output contract mismatch`);
  }
  if (payload.iterations !== count || !Number.isFinite(payload.renderSeconds) || !Number.isFinite(payload.preparedRenderSeconds)) throw new Error(`${payload.language}/${mode} measurement payload is invalid`);
  return {
    processMs, rssMiB: rss,
    renderMs: payload.renderSeconds * 1000 / count,
    preparedRenderMs: payload.preparedRenderSeconds * 1000 / count,
  };
}

function measure(language, command, args, mode) {
  const cold = [];
  const persistent = [];
  for (let sample = 0; sample < sampleCount; sample += 1) cold.push(timed(command, args, mode, 1, 0));
  for (let sample = 0; sample < sampleCount; sample += 1) persistent.push(timed(command, args, mode, iterations, warmup));
  const compiled = compileSamples(language, mode);
  const artifact = generatedPath(language);
  return {
    language, mode, samples: sampleCount, iterations, warmup,
    compile_ms: compiled.compile_ms,
    artifact_bytes: mode === 'generated' ? statSync(artifact).size + statSync(`${artifact}.manifest.json`).size : compiled.artifact_bytes,
    cold_process_ms: summary(cold.map(item => item.processMs)),
    cold_rss_mib: summary(cold.map(item => item.rssMiB)),
    render_ms: summary(persistent.map(item => item.renderMs)),
    prepared_render_ms: summary(persistent.map(item => item.preparedRenderMs)),
    persistent_process_ms_per_render: summary(persistent.map(item => item.processMs / iterations)),
    persistent_rss_mib: summary(persistent.map(item => item.rssMiB)),
    output_bytes: Buffer.byteLength(expected), output_sha256: expectedHash,
  };
}

try {
  mkdirSync(join(temporary, 'bin'), { recursive: true });
  const goBinary = join(temporary, 'bin/showcase-go');
  run('go', ['build', '-o', goBinary, '.'], join(root, 'tools/showcase/adapters/go'));
  run(cargo, ['build', '--release', '--locked', '--manifest-path', join(root, 'tools/showcase/adapters/rust/Cargo.toml')]);
  const commands = {
    typescript: ['node', ['--experimental-strip-types', join(root, 'tools/showcase/adapters/typescript.ts'), scenario]],
    go: [goBinary, [scenario]],
    rust: [join(root, 'tools/showcase/adapters/rust/target/release/showcase-adapter-rust'), [scenario]],
    php: ['php', [join(root, 'tools/showcase/adapters/php.php'), scenario]],
  };
  const results = [];
  for (const [language, [command, args]] of Object.entries(commands)) {
    for (const mode of ['ast', 'generated']) results.push(measure(language, command, args, mode));
  }
  process.stdout.write(JSON.stringify({
    schema: 1,
    scenario: basename(scenario),
    condition: 'independent processes, production artifacts, page cache disabled, exact UTF-8 output contract',
    results,
  }, null, 2) + '\n');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
