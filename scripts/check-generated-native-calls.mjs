#!/usr/bin/env node
// Compiles and executes one native object/class-call program in every generated backend.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileAst } from '../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../tools/compiler/compiler.mjs';
import { root } from '../tests/runner/drivers.mjs';

const fixture = join(root, 'tests/fixtures/native-object');
const temporary = mkdtempSync(join(root, '.generated-native-calls-'));
const expected = '<article><h1>Order 12</h1><p>ready:12</p><p>done!</p></article>\n';
const run = (command, args, cwd, env = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}${result.stderr}`);
  return result.stdout;
};

try {
  const graph = join(temporary, 'ast');
  compileAst({ root: fixture, output: graph, entry: 'input.tpl', refresh: 'dev', typeManifest: join(fixture, 'types.json') });
  const graphManifest = join(graph, 'manifest.json');

  const tsSource = join(temporary, 'native.ts');
  writeFileSync(tsSource, compileSource(graphManifest, join(fixture, 'types.json'), 'ts'));
  const tsOutput = join(temporary, 'ts');
  mkdirSync(tsOutput);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', tsOutput, tsSource], root);
  const tsRunner = join(temporary, 'native.mjs');
  writeFileSync(tsRunner, `import { GeneratedProgram } from './ts/native.js';\nimport { RuntimeEnvironment } from '@polyspec/template';\nclass Order { label = 'Order 12'; status_label(prefix) { return prefix + ':12'; } }\nconst runtime = new RuntimeEnvironment();\nruntime.registerClass('Order', 'suffix', ([suffix]) => 'done' + suffix);\nconst actual = new GeneratedProgram(runtime).render('input.tpl', { order: new Order() });\nif (actual !== ${JSON.stringify(expected)}) throw new Error('TypeScript generated native output differs');\n`);
  run(process.execPath, [tsRunner], root);

  const goDir = join(root, 'packages/template-go', `.generated-native-${process.pid}`);
  mkdirSync(goDir);
  try {
    const goSource = join(goDir, 'generated.go');
    writeFileSync(goSource, compileSource(graphManifest, join(fixture, 'types.json'), 'go'));
    writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("testing"; template "github.com/polyspec/template"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/value")
type Order struct { Label string }
func (o Order) StatusLabel(prefix string) string { return prefix + ":12" }
func TestGeneratedNativeCalls(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; if err = program.Runtime.RegisterClass("Order", "suffix", func(args []value.Value, _ functions.Context) (any, error) { return "done" + args[0].(string), nil }); err != nil { t.Fatal(err) }; actual, err := program.Render("input.tpl", map[string]any{"order": Order{Label: "Order 12"}}, template.RenderOptions{}); if err != nil { t.Fatal(err) }; if actual != ${JSON.stringify(expected)} { t.Fatalf("generated Go native output differs: %q", actual) } }
`);
    run('go', ['test', '.'], goDir, { GOCACHE: '/tmp/template-go-cache' });
  } finally {
    rmSync(goDir, { recursive: true, force: true });
  }

  const rustSource = join(temporary, 'native.rust');
  writeFileSync(rustSource, compileSource(graphManifest, join(fixture, 'types.json'), 'rust'));
  const rustTest = join(root, 'packages/template-rust/tests/generated_native_object_check.rs');
  writeFileSync(rustTest, `mod generated { include!(${JSON.stringify(rustSource)}); }
use polyspec_template::{OrderedMap, RenderOptions, RenderTarget, RuntimeEnvironment, TemplateObject, Value};
#[derive(Debug)] struct Order;
fn text(value: &Value) -> String { match value { Value::Str(value) | Value::Safe(value) => value.to_string(), _ => panic!("expected text") } }
impl TemplateObject for Order { fn member(&self, key: &str) -> Option<Value> { (key == "label").then(|| Value::text("Order 12")) } fn call(&self, method: &str, args: &[Value]) -> Result<Value, String> { if method != "status_label" { return Err("unknown method".to_string()); } Ok(Value::text(format!("{}:12", text(&args[0])))) } }
#[test] fn generated_native_calls_match() { let mut runtime = RuntimeEnvironment::new(None, std::collections::HashMap::new()); runtime.register_class("Order", "suffix", Box::new(|args, _| Ok(Value::text(format!("done{}", text(&args[0])))))).unwrap(); let mut assign = OrderedMap::new(); assign.insert("order".to_string(), Value::object(Order)); let actual = generated::GeneratedProgram::new(runtime).render_values(RenderTarget::Name("input.tpl"), assign, &RenderOptions::default()).unwrap(); assert_eq!(actual, ${JSON.stringify(expected)}); }
`);
  run(process.env.HOME + '/.cargo/bin/cargo', ['test', '--locked', '--manifest-path', join(root, 'packages/template-rust/Cargo.toml'), '--test', 'generated_native_object_check'], root, { RUSTFLAGS: '-Dwarnings -Adead-code' });
  rmSync(rustTest, { force: true });

  const phpSource = join(temporary, 'native.php');
  writeFileSync(phpSource, compileSource(graphManifest, join(fixture, 'types.json'), 'php'));
  const phpRunner = `require ${JSON.stringify(join(root, 'packages/template-php/vendor/autoload.php'))}; require ${JSON.stringify(phpSource)}; class Order { public string $label = 'Order 12'; public function status_label(string $prefix): string { return $prefix . ':12'; } } $runtime = new Polyspec\\Template\\Render\\RuntimeEnvironment(); $runtime->registerClass('Order', 'suffix', static fn (array $args, array $env): string => 'done' . $args[0]); $actual = (new GeneratedProgram($runtime))->render('input.tpl', ['order' => new Order()]); if ($actual !== ${JSON.stringify(expected)}) throw new RuntimeException('PHP generated native output differs');`;
  run('php', ['-r', phpRunner], root);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

assert.ok(true);
process.stdout.write('generated native calls: TypeScript, Go, Rust and PHP outputs matched\n');
