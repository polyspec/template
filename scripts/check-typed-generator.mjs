#!/usr/bin/env node
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const generated = resolve(root, 'tools/showcase/adapters/generated/typed');
const temporary = mkdtempSync(join(tmpdir(), 'polyspec-typed-generator-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, encoding: 'utf8', env: { ...process.env, ...options.env } });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`${command} exited with ${result.status}`);
  }
}

try {
  run(process.execPath, [resolve(root, 'tools/compiler/generate-typed.mjs'), '--check', '--ast', resolve(root, 'examples/site/scenarios/react-boundary/compiled/typescript/layout.tpl.ast.json'), '--manifest', resolve(root, 'tools/compiler/type-manifest.json'), '--lang', 'ts', '--output', resolve(generated, 'react-layout.ts')]);
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', resolve(generated, 'react-layout.ts')]);
  copyFileSync(resolve(generated, 'react-layout.go'), resolve(temporary, 'generated.go'));
  run('go', ['test', '.'], { cwd: temporary, env: { GO111MODULE: 'off' } });
  run('php', ['-l', resolve(generated, 'react-layout.php')]);
  const rustc = process.env.RUSTC ?? resolve(homedir(), '.cargo/bin/rustc');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', resolve(generated, 'react-layout.rust'), '--out-dir', temporary]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('typed generator: TypeScript, Go, Rust and PHP outputs compile\n');
