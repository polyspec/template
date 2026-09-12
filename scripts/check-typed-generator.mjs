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
const scopeExpected = readFileSync(resolve(root, 'examples/site/scenarios/scope-precedence/expected.html'), 'utf8');
const emptyExpected = readFileSync(resolve(root, 'examples/site/scenarios/empty-state/expected.html'), 'utf8');
const htmlExpected = readFileSync(resolve(root, 'examples/site/scenarios/html-slot/expected.html'), 'utf8');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, encoding: 'utf8', env: { ...process.env, ...options.env } });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`${command} exited with ${result.status}`);
  }
}

try {
  run(process.execPath, [resolve(root, 'tools/compiler/generate-typed.mjs'), '--check', '--graph', resolve(root, 'examples/site/scenarios/react-boundary/compiled/typescript/manifest.json'), '--manifest', resolve(root, 'examples/site/scenarios/react-boundary/types.json'), '--lang', 'ts', '--output', resolve(generated, 'react-boundary.ts')]);
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', resolve(generated, 'react-boundary.ts')]);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', temporary, resolve(generated, 'react-boundary.ts')]);
  writeFileSync(resolve(temporary, 'typescript-check.mjs'), `import { render } from './react-boundary.js';\nconst assign = { title: 'Server rendered shell', island_label: 'Interactive island' };\nconst actual = render(assign, { content: { data: {} } });\nif (actual !== ${JSON.stringify(expected)}) throw new Error('TypeScript generated output differs');\n`);
  run('node', [resolve(temporary, 'typescript-check.mjs')]);
  copyFileSync(resolve(generated, 'react-boundary.go'), resolve(temporary, 'generated.go'));
  writeFileSync(resolve(temporary, 'generated_test.go'), `package generated\nimport "testing"\nfunc pointer[T any](value T) *T { return &value }\nfunc TestGeneratedParity(t *testing.T) { assign := Assign{Title: pointer("Server rendered shell"), Island_label: pointer("Interactive island")}; definitions := Definitions{Content: &Definition[DefinitionData_content_tpl]{Data: &DefinitionData_content_tpl{}}}; actual := Render(assign, definitions); if actual != ${JSON.stringify(expected)} { t.Fatalf("generated output differs: %q", actual) } }\n`);
  run('go', ['test', '.'], { cwd: temporary, env: { GO111MODULE: 'off' } });
  run('php', ['-l', resolve(generated, 'react-boundary.php')]);
  run('php', ['-r', `require ${JSON.stringify(resolve(generated, 'react-boundary.php'))}; $assign = new Assign(title: 'Server rendered shell', island_label: 'Interactive island'); $definitions = new Definitions(content: new Definition(data: new DefinitionData_content_tpl())); $actual = render($assign, $definitions); if ($actual !== ${JSON.stringify(expected)}) { throw new RuntimeException('PHP generated output differs'); }`]);
  const rustc = process.env.RUSTC ?? resolve(homedir(), '.cargo/bin/rustc');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', resolve(generated, 'react-boundary.rust'), '--out-dir', temporary]);
  writeFileSync(resolve(temporary, 'rust-check.rs'), `mod generated { include!(${JSON.stringify(resolve(generated, 'react-boundary.rust'))}); pub fn parity() -> String { let assign = Assign { title: Some("Server rendered shell".to_string()), island_label: Some("Interactive island".to_string()), ..Default::default() }; let definitions = Definitions { content: Some(Definition { html: None, data: Some(DefinitionData_content_tpl::default()) }), ..Default::default() }; render(&assign, &definitions) } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(expected)}); }\n`);
  run(rustc, ['--edition', '2024', resolve(temporary, 'rust-check.rs'), '-o', resolve(temporary, 'rust-check')]);
  run(resolve(temporary, 'rust-check'), []);

  const coverageTs = resolve(generated, 'compiler-coverage.ts');
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', coverageTs]);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', temporary, coverageTs]);
  writeFileSync(resolve(temporary, 'typescript-coverage-check.mjs'), `import { render } from './compiler-coverage.js';\nconst assign = { flag: true, dangerous: '&<>"\\'', empty_list: [], empty_map: new Map(), page: { title: 'Guide' }, numbers: [10, 20], lookup: new Map([['x', 'X']]), rows: [{ name: 'A' }, { name: 'B' }] };\nconst actual = render(assign, { content: { data: { label: 'define' } } });\nif (actual !== ${JSON.stringify(coverageExpected)}) throw new Error('TypeScript compiler coverage differs');\n`);
  run('node', [resolve(temporary, 'typescript-coverage-check.mjs')]);

  const goCoverage = resolve(temporary, 'go-coverage');
  mkdirSync(goCoverage);
  copyFileSync(resolve(generated, 'compiler-coverage.go'), resolve(goCoverage, 'generated.go'));
  writeFileSync(resolve(goCoverage, 'generated_test.go'), `package generated\nimport "testing"\nfunc pointer[T any](value T) *T { return &value }\nfunc TestCompilerCoverage(t *testing.T) { lookup := NewOrderedMap[string, string](); lookup.Set("x", "X"); assign := Assign{Flag: true, Dangerous: "&<>\\\"'", Empty_list: []string{}, Empty_map: NewOrderedMap[string, string](), Page: Page{Title: "Guide"}, Numbers: []float64{10, 20}, Lookup: lookup, Rows: []Row{{Name: "A"}, {Name: "B"}}}; definitions := Definitions{Content: &Definition[DefinitionData_card_tpl]{Data: &DefinitionData_card_tpl{Label: pointer("define")}}}; actual := Render(assign, definitions); if actual != ${JSON.stringify(coverageExpected)} { t.Fatalf("compiler coverage differs: %q", actual) } }\n`);
  run('go', ['test', '.'], { cwd: goCoverage, env: { GO111MODULE: 'off' } });

  const coveragePhp = resolve(generated, 'compiler-coverage.php');
  run('php', ['-l', coveragePhp]);
  run('php', ['-r', `require ${JSON.stringify(coveragePhp)}; $assign = new Assign(flag: true, dangerous: "&<>\\\"'", empty_list: [], empty_map: [], page: new Page(title: 'Guide'), numbers: [10.0, 20.0], lookup: ['x' => 'X'], rows: [new Row(name: 'A'), new Row(name: 'B')]); $definitions = new Definitions(content: new Definition(data: new DefinitionData_card_tpl(has_label: true, label: 'define'))); $actual = render($assign, $definitions); if ($actual !== ${JSON.stringify(coverageExpected)}) throw new RuntimeException('PHP compiler coverage differs');`]);

  const coverageRust = resolve(generated, 'compiler-coverage.rust');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', coverageRust, '--out-dir', temporary]);
  writeFileSync(resolve(temporary, 'rust-coverage-check.rs'), `mod generated { include!(${JSON.stringify(coverageRust)}); pub fn parity() -> String { let mut lookup = OrderedMap::new(); lookup.set("x".to_string(), "X".to_string()); let assign = Assign { flag: true, dangerous: "&<>\\\"'".to_string(), empty_list: vec![], empty_map: OrderedMap::new(), page: Page { title: "Guide".to_string() }, numbers: vec![10.0, 20.0], lookup, rows: vec![Row { name: "A".to_string() }, Row { name: "B".to_string() }] }; let definitions = Definitions { content: Some(Definition { html: None, data: Some(DefinitionData_card_tpl { label: Some("define".to_string()) }) }), ..Default::default() }; render(&assign, &definitions) } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(coverageExpected)}); }\n`);
  run(rustc, ['--edition', '2024', resolve(temporary, 'rust-coverage-check.rs'), '-o', resolve(temporary, 'rust-coverage-check')]);
  run(resolve(temporary, 'rust-coverage-check'), []);

  const scopeTs = resolve(generated, 'scope-precedence.ts');
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', scopeTs]);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', temporary, scopeTs]);
  writeFileSync(resolve(temporary, 'typescript-scope-check.mjs'), `import { render } from './scope-precedence.js';\nconst assign = { page: { title: 'from assign' }, root_label: 'root assign', defined_label: 'root value that is replaced' };\nconst definitions = { content: { data: { title: 'from define data', defined_label: 'definition data' } } };\nconst actual = render(assign, definitions);\nif (actual !== ${JSON.stringify(scopeExpected)}) throw new Error('TypeScript scope precedence differs');\n`);
  run('node', [resolve(temporary, 'typescript-scope-check.mjs')]);

  const goScope = resolve(temporary, 'go-scope');
  mkdirSync(goScope);
  copyFileSync(resolve(generated, 'scope-precedence.go'), resolve(goScope, 'generated.go'));
  writeFileSync(resolve(goScope, 'generated_test.go'), `package generated\nimport "testing"\nfunc pointer[T any](value T) *T { return &value }\nfunc TestScopePrecedence(t *testing.T) { assign := Assign{Page: Page{Title: "from assign"}, Root_label: "root assign", Defined_label: "root value that is replaced"}; data := DefinitionData_content_tpl{Title: pointer("from define data"), Defined_label: pointer("definition data")}; actual := Render(assign, Definitions{Content: &Definition[DefinitionData_content_tpl]{Data: &data}}); if actual != ${JSON.stringify(scopeExpected)} { t.Fatalf("scope precedence differs: %q", actual) } }\n`);
  run('go', ['test', '.'], { cwd: goScope, env: { GO111MODULE: 'off' } });

  const scopePhp = resolve(generated, 'scope-precedence.php');
  run('php', ['-l', scopePhp]);
  run('php', ['-r', `require ${JSON.stringify(scopePhp)}; $assign = new Assign(page: new Page(title: 'from assign'), root_label: 'root assign', defined_label: 'root value that is replaced'); $data = new DefinitionData_content_tpl(has_title: true, title: 'from define data', has_defined_label: true, defined_label: 'definition data'); $actual = render($assign, new Definitions(content: new Definition(data: $data))); if ($actual !== ${JSON.stringify(scopeExpected)}) throw new RuntimeException('PHP scope precedence differs');`]);

  const scopeRust = resolve(generated, 'scope-precedence.rust');
  run(rustc, ['--crate-type', 'lib', '--edition', '2024', scopeRust, '--out-dir', temporary]);
  writeFileSync(resolve(temporary, 'rust-scope-check.rs'), `mod generated { include!(${JSON.stringify(scopeRust)}); pub fn parity() -> String { let assign = Assign { page: Page { title: "from assign".to_string() }, root_label: "root assign".to_string(), defined_label: "root value that is replaced".to_string() }; let data = DefinitionData_content_tpl { title: Some("from define data".to_string()), defined_label: Some("definition data".to_string()), ..Default::default() }; render(&assign, &Definitions { content: Some(Definition { html: None, data: Some(data) }), ..Default::default() }) } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(scopeExpected)}); }\n`);
  run(rustc, ['--edition', '2024', resolve(temporary, 'rust-scope-check.rs'), '-o', resolve(temporary, 'rust-scope-check')]);
  run(resolve(temporary, 'rust-scope-check'), []);

  for (const scenario of ['empty-state', 'html-slot']) {
    const source = resolve(generated, `${scenario}.ts`);
    run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', source]);
    run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', temporary, source]);
  }
  writeFileSync(resolve(temporary, 'typescript-small-check.mjs'), `import { render as renderEmpty } from './empty-state.js';\nimport { render as renderHtml } from './html-slot.js';\nif (renderEmpty({ page: 'empty' }, {}) !== ${JSON.stringify(emptyExpected)}) throw new Error('TypeScript empty state differs');\nif (renderHtml({ heading: '<server slot>' }, { content: { html: '<p class="server">pre-rendered &amp; safe</p>\\n' } }) !== ${JSON.stringify(htmlExpected)}) throw new Error('TypeScript HTML slot differs');\n`);
  run('node', [resolve(temporary, 'typescript-small-check.mjs')]);

  for (const [scenario, test] of [
    ['empty-state', `actual := Render(Assign{Page: "empty"}, Definitions{}); if actual != ${JSON.stringify(emptyExpected)} { t.Fatalf("empty state differs: %q", actual) }`],
    ['html-slot', `html := "<p class=\\"server\\">pre-rendered &amp; safe</p>\\n"; actual := Render(Assign{Heading: "<server slot>"}, Definitions{Content: &Definition[struct{}]{HTML: &html}}); if actual != ${JSON.stringify(htmlExpected)} { t.Fatalf("HTML slot differs: %q", actual) }`],
  ]) {
    const directory = resolve(temporary, `go-${scenario}`);
    mkdirSync(directory);
    copyFileSync(resolve(generated, `${scenario}.go`), resolve(directory, 'generated.go'));
    writeFileSync(resolve(directory, 'generated_test.go'), `package generated\nimport "testing"\nfunc TestGenerated(t *testing.T) { ${test} }\n`);
    run('go', ['test', '.'], { cwd: directory, env: { GO111MODULE: 'off' } });
  }

  const emptyPhp = resolve(generated, 'empty-state.php');
  const htmlPhp = resolve(generated, 'html-slot.php');
  run('php', ['-l', emptyPhp]);
  run('php', ['-r', `require ${JSON.stringify(emptyPhp)}; if (render(new Assign(page: 'empty'), new Definitions()) !== ${JSON.stringify(emptyExpected)}) throw new RuntimeException('PHP empty state differs');`]);
  run('php', ['-l', htmlPhp]);
  run('php', ['-r', `require ${JSON.stringify(htmlPhp)}; $html = '<p class="server">pre-rendered &amp; safe</p>' . "\\n"; if (render(new Assign(heading: '<server slot>'), new Definitions(content: new Definition(html: $html))) !== ${JSON.stringify(htmlExpected)}) throw new RuntimeException('PHP HTML slot differs');`]);

  for (const [scenario, body, expectedOutput] of [
    ['empty-state', `render(&Assign { page: "empty".to_string() }, &Definitions::default())`, emptyExpected],
    ['html-slot', `render(&Assign { heading: "<server slot>".to_string() }, &Definitions { content: Some(Definition { html: Some("<p class=\\"server\\">pre-rendered &amp; safe</p>\\n".to_string()), data: None }), ..Default::default() })`, htmlExpected],
  ]) {
    const source = resolve(generated, `${scenario}.rust`);
    run(rustc, ['--crate-type', 'lib', '--edition', '2024', source, '--out-dir', temporary]);
    const checkFile = resolve(temporary, `rust-${scenario}-check.rs`);
    writeFileSync(checkFile, `mod generated { include!(${JSON.stringify(source)}); pub fn parity() -> String { ${body} } }\nfn main() { assert_eq!(generated::parity(), ${JSON.stringify(expectedOutput)}); }\n`);
    const binary = resolve(temporary, `rust-${scenario}-check`);
    run(rustc, ['--edition', '2024', checkFile, '-o', binary]);
    run(binary, []);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('typed generator: TypeScript, Go, Rust and PHP compile and render all five showcase scenarios identically\n');
