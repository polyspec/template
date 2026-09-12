#!/usr/bin/env node
// Measures the same showcase request through the AST and generated renderers.
// Each sample includes process startup and artifact/source loading, then the
// adapter performs its fixed render/repeat/recovery contract.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const scenario = join(root, 'examples/site/scenarios/scope-precedence');
const samples = Number(process.env.SHOWCASE_BENCH_SAMPLES ?? 7);
const bin = join('/tmp', `polyspec-showcase-bench-${process.pid}`);
mkdirSync(bin, { recursive: true });
const cargo = existsSync(join(process.env.HOME ?? '', '.cargo/bin/cargo')) ? join(process.env.HOME ?? '', '.cargo/bin/cargo') : 'cargo';

function build(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, PATH: `${process.env.HOME ?? ''}/.cargo/bin:${process.env.PATH}` } });
  if (result.status !== 0) throw new Error(`${command} build failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
}
build('go', ['build', '-o', join(bin, 'showcase-go'), '.'], join(root, 'tools/showcase/adapters/go'));
build(cargo, ['build', '--release', '--locked', '--manifest-path', join(root, 'tools/showcase/adapters/rust/Cargo.toml')]);
const rust = join(root, 'tools/showcase/adapters/rust/target/release/showcase-adapter-rust');
const commands = {
  typescript: ['node', ['--experimental-strip-types', join(root, 'tools/showcase/adapters/typescript.ts'), scenario]],
  javascript: ['node', [join(root, 'tools/showcase/adapters/javascript.mjs'), scenario]],
  go: [join(bin, 'showcase-go'), [scenario]],
  rust: [rust, [scenario]],
  php: ['php', [join(root, 'tools/showcase/adapters/php.php'), scenario]],
};
const expected = readFileSync(join(scenario, 'expected.html'), 'utf8');
const expectedHash = createHash('sha256').update(expected).digest('hex');
const rows = [];
for (const [language, [command, args]] of Object.entries(commands)) {
  for (const mode of ['ast', 'generated']) {
    const times = [];
    let hash = null;
    for (let sample = 0; sample < samples; sample++) {
      const started = process.hrtime.bigint();
      const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...(mode === 'generated' ? { SHOWCASE_EXECUTION_MODE: 'generated' } : {}) }, maxBuffer: 16 * 1024 * 1024 });
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      if (result.status !== 0) throw new Error(`${language}/${mode} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
      const payload = JSON.parse(result.stdout.trim());
      hash = payload.firstSha256;
      if (hash !== expectedHash || payload.secondSha256 !== expectedHash || payload.recoveredSha256 !== expectedHash) throw new Error(`${language}/${mode} output hash mismatch`);
      times.push(elapsed);
    }
    times.sort((a, b) => a - b);
    rows.push({ language, mode, samples, median_ms: times[Math.floor(times.length / 2)], min_ms: times[0], output_bytes: expected.length, output_sha256: expectedHash });
  }
}
process.stdout.write(JSON.stringify({ scenario: 'scope-precedence', condition: 'fresh process, same input, same output contract', results: rows }, null, 2) + '\n');
rmSync(bin, { recursive: true, force: true });
