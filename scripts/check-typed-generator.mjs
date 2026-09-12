#!/usr/bin/env node
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const generated = resolve(root, 'tools/showcase/adapters/generated/typed');
const temporary = mkdtempSync(join(tmpdir(), 'polyspec-typed-generator-'));
const expected = readFileSync(resolve(root, 'examples/site/scenarios/react-boundary/expected.html'), 'utf8');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, encoding: 'utf8', env: { ...process.env, ...options.env } });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`${command} exited with ${result.status}`);
  }
}

try {
  run(process.execPath, [resolve(root, 'tools/compiler/generate-typed.mjs'), '--check', '--graph', resolve(root, 'examples/site/scenarios/react-boundary/compiled/typescript/manifest.json'), '--manifest', resolve(root, 'tools/compiler/type-manifest.json'), '--lang', 'ts', '--output', resolve(generated, 'react-layout.ts')]);
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', resolve(generated, 'react-layout.ts')]);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', temporary, resolve(generated, 'react-layout.ts')]);
  writeFileSync(resolve(temporary, 'typescript-check.mjs'), `import { render, renderTemplate } from './react-layout.js';\nconst assign = { title: 'Server rendered shell', island_label: 'Interactive island' };\nconst content = renderTemplate('content.tpl', assign, {});\nconst actual = render(assign, { content });\nif (actual !== ${JSON.stringify(expected)}) throw new Error('TypeScript generated output differs');\n`);
  run('node', [resolve(temporary, 'typescript-check.mjs')]);
  copyFileSync(resolve(generated, 'react-layout.go'), resolve(temporary, 'generated.go'));
  writeFileSync(resolve(temporary, 'generated_test.go'), `package generated\nimport "testing"\nfunc pointer[T any](value T) *T { return &value }\nfunc TestGeneratedParity(t *testing.T) { assign := Assign{Title: pointer("Server rendered shell"), Island_label: pointer("Interactive island")}; content := renderTemplate("content.tpl", assign, map[string]string{}); actual := Render(assign, map[string]string{"content": content}); if actual != ${JSON.stringify(expected)} { t.Fatalf("generated output differs: %q", actual) } }\n`);
  run('go', ['test', '.'], { cwd: temporary, env: { GO111MODULE: 'off' } });
  run('php', ['-l', resolve(generated, 'react-layout.php')]);
  run('php', ['-r', `require ${JSON.stringify(resolve(generated, 'react-layout.php'))}; $assign = new Assign(title: 'Server rendered shell', island_label: 'Interactive island'); $content = render_template('content.tpl', $assign, []); $actual = render($assign, ['content' => $content]); if ($actual !== ${JSON.stringify(expected)}) { throw new RuntimeException('PHP generated output differs'); }`]);
  const rustc = process.env.RUSTC ?? resolve(homedir(), '.cargo/bin/rustc');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', resolve(generated, 'react-layout.rust'), '--out-dir', temporary]);
  writeFileSync(resolve(temporary, 'rust-check.rs'), `mod generated { include!(${JSON.stringify(resolve(generated, 'react-layout.rust'))}); pub fn parity() -> String { let assign = Assign { title: Some("Server rendered shell".to_string()), island_label: Some("Interactive island".to_string()), ..Default::default() }; let mut slots = std::collections::HashMap::new(); let content = render_template("content.tpl", &assign, &slots); slots.insert("content".to_string(), content); render(&assign, &slots) } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(expected)}); }\n`);
  run(rustc, ['--edition', '2024', resolve(temporary, 'rust-check.rs'), '-o', resolve(temporary, 'rust-check')]);
  run(resolve(temporary, 'rust-check'), []);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('typed generator: TypeScript, Go, Rust and PHP outputs compile and render identical React page bytes\n');
