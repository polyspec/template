#!/usr/bin/env node
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const generated = resolve(root, 'tools/showcase/adapters/generated/typed');
const temporary = mkdtempSync(join(tmpdir(), 'polyspec-typed-generator-'));
const expected = readFileSync(resolve(root, 'examples/site/scenarios/react-boundary/expected.html'), 'utf8');
const coverageExpected = readFileSync(resolve(root, 'examples/site/scenarios/compiler-coverage/expected.html'), 'utf8');

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
  writeFileSync(resolve(temporary, 'typescript-check.mjs'), `import { render } from './react-layout.js';\nconst assign = { title: 'Server rendered shell', island_label: 'Interactive island' };\nconst actual = render(assign, { content: { data: {} } });\nif (actual !== ${JSON.stringify(expected)}) throw new Error('TypeScript generated output differs');\n`);
  run('node', [resolve(temporary, 'typescript-check.mjs')]);
  copyFileSync(resolve(generated, 'react-layout.go'), resolve(temporary, 'generated.go'));
  writeFileSync(resolve(temporary, 'generated_test.go'), `package generated\nimport "testing"\nfunc pointer[T any](value T) *T { return &value }\nfunc TestGeneratedParity(t *testing.T) { assign := Assign{Title: pointer("Server rendered shell"), Island_label: pointer("Interactive island")}; definitions := Definitions{Content: &Definition[Input_content_tpl]{Data: &Input_content_tpl{}}}; actual := Render(assign, definitions); if actual != ${JSON.stringify(expected)} { t.Fatalf("generated output differs: %q", actual) } }\n`);
  run('go', ['test', '.'], { cwd: temporary, env: { GO111MODULE: 'off' } });
  run('php', ['-l', resolve(generated, 'react-layout.php')]);
  run('php', ['-r', `require ${JSON.stringify(resolve(generated, 'react-layout.php'))}; $assign = new Assign(title: 'Server rendered shell', island_label: 'Interactive island'); $definitions = new Definitions(content: new Definition(data: new Input_content_tpl())); $actual = render($assign, $definitions); if ($actual !== ${JSON.stringify(expected)}) { throw new RuntimeException('PHP generated output differs'); }`]);
  const rustc = process.env.RUSTC ?? resolve(homedir(), '.cargo/bin/rustc');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', resolve(generated, 'react-layout.rust'), '--out-dir', temporary]);
  writeFileSync(resolve(temporary, 'rust-check.rs'), `mod generated { include!(${JSON.stringify(resolve(generated, 'react-layout.rust'))}); pub fn parity() -> String { let assign = Assign { title: Some("Server rendered shell".to_string()), island_label: Some("Interactive island".to_string()), ..Default::default() }; let definitions = Definitions { content: Some(Definition { html: None, data: Some(Input_content_tpl::default()) }), ..Default::default() }; render(&assign, &definitions) } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(expected)}); }\n`);
  run(rustc, ['--edition', '2024', resolve(temporary, 'rust-check.rs'), '-o', resolve(temporary, 'rust-check')]);
  run(resolve(temporary, 'rust-check'), []);

  const coverageTs = resolve(generated, 'compiler-coverage.ts');
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', coverageTs]);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', temporary, coverageTs]);
  writeFileSync(resolve(temporary, 'typescript-coverage-check.mjs'), `import { render } from './compiler-coverage.js';\nconst assign = { flag: true, page: { title: 'Guide' }, numbers: [10, 20], lookup: new Map([['x', 'X']]), rows: [{ name: 'A' }, { name: 'B' }] };\nconst actual = render(assign, { content: { data: { label: 'define' } } });\nif (actual !== ${JSON.stringify(coverageExpected)}) throw new Error('TypeScript compiler coverage differs');\n`);
  run('node', [resolve(temporary, 'typescript-coverage-check.mjs')]);

  const goCoverage = resolve(temporary, 'go-coverage');
  mkdirSync(goCoverage);
  copyFileSync(resolve(generated, 'compiler-coverage.go'), resolve(goCoverage, 'generated.go'));
  writeFileSync(resolve(goCoverage, 'generated_test.go'), `package generated\nimport "testing"\nfunc TestCompilerCoverage(t *testing.T) { lookup := NewOrderedMap[string, string](); lookup.Set("x", "X"); assign := Assign{Flag: true, Page: Page{Title: "Guide"}, Numbers: []float64{10, 20}, Lookup: lookup, Rows: []Row{{Name: "A"}, {Name: "B"}}}; definitions := Definitions{Content: &Definition[Input_card_tpl]{Data: &Input_card_tpl{Label: "define"}}}; actual := Render(assign, definitions); if actual != ${JSON.stringify(coverageExpected)} { t.Fatalf("compiler coverage differs: %q", actual) } }\n`);
  run('go', ['test', '.'], { cwd: goCoverage, env: { GO111MODULE: 'off' } });

  const coveragePhp = resolve(generated, 'compiler-coverage.php');
  run('php', ['-l', coveragePhp]);
  run('php', ['-r', `require ${JSON.stringify(coveragePhp)}; $assign = new Assign(flag: true, page: new Page(title: 'Guide'), numbers: [10.0, 20.0], lookup: ['x' => 'X'], rows: [new Row(name: 'A'), new Row(name: 'B')]); $definitions = new Definitions(content: new Definition(data: new Input_card_tpl(label: 'define'))); $actual = render($assign, $definitions); if ($actual !== ${JSON.stringify(coverageExpected)}) throw new RuntimeException('PHP compiler coverage differs');`]);

  const coverageRust = resolve(generated, 'compiler-coverage.rust');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', coverageRust, '--out-dir', temporary]);
  writeFileSync(resolve(temporary, 'rust-coverage-check.rs'), `mod generated { include!(${JSON.stringify(coverageRust)}); pub fn parity() -> String { let mut lookup = OrderedMap::new(); lookup.set("x".to_string(), "X".to_string()); let assign = Assign { flag: true, page: Page { title: "Guide".to_string() }, numbers: vec![10.0, 20.0], lookup, rows: vec![Row { name: "A".to_string() }, Row { name: "B".to_string() }] }; let definitions = Definitions { content: Some(Definition { html: None, data: Some(Input_card_tpl { label: "define".to_string() }) }), ..Default::default() }; render(&assign, &definitions) } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(coverageExpected)}); }\n`);
  run(rustc, ['--edition', '2024', resolve(temporary, 'rust-coverage-check.rs'), '-o', resolve(temporary, 'rust-coverage-check')]);
  run(resolve(temporary, 'rust-coverage-check'), []);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('typed generator: TypeScript, Go, Rust and PHP compile and render identical React and full compiler-coverage bytes\n');
