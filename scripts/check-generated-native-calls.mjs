#!/usr/bin/env node
// Compiles and executes one native object/class-call program in every generated backend.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileAst } from '../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../tools/compiler/compiler.mjs';
import { goString, phpString, rustString } from '../tools/compiler/backend-support.mjs';
import { root } from '../tests/runner/drivers.mjs';

const fixture = join(root, 'tests/fixtures/native-object');
const temporary = mkdtempSync(join(root, '.generated-native-calls-'));
const expected = '<article><h1>Order 12</h1><p>ready:12</p><p>done!</p></article>\n';
// VAL-18: the object reaches an included template, a block argument and definition data unchanged.
const passing = { 'include.tpl': 'Order 12|p:12\n', 'block.tpl': 'Order 12|p:12\n', 'define.tpl': 'Order 12|p:12\n' };
const errorCases = {
  'unknown-member.tpl': 'E_RUNTIME_UNKNOWN_FUNCTION',
  'unknown-class.tpl': 'E_RUNTIME_UNKNOWN_FUNCTION',
  'throw-member.tpl': 'E_RUNTIME_HOST_FUNCTION',
  'throw-class.tpl': 'E_RUNTIME_HOST_FUNCTION',
  'member-type.tpl': 'E_RUNTIME_HOST_FUNCTION',
  'member-arity.tpl': 'E_RUNTIME_HOST_FUNCTION',
};
const phpNamespace = 'Polyspec\\Generated\\NativeCheck';
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
  writeFileSync(tsRunner, `import { GeneratedProgram } from './ts/native.js';
import { RuntimeEnvironment } from '@polyspec/template';
class Order {
  label = 'Order 12';
  status_label(prefix) { if (arguments.length !== 1 || typeof prefix !== 'string') throw new Error('invalid status_label'); return prefix + ':12'; }
  fail() { throw new Error('failed member'); }
}
const runtime = new RuntimeEnvironment();
runtime.registerClass('Order', 'suffix', ([suffix]) => 'done' + suffix);
runtime.registerClass('Order', 'fail', () => { throw new Error('failed class'); });
const program = new GeneratedProgram(runtime);
const order = new Order();
const actual = program.render('input.tpl', { order });
if (actual !== ${JSON.stringify(expected)}) throw new Error('TypeScript generated native output differs');
const define = { card: { template: 'part.tpl', data: { o: order } } };
for (const [target, output] of Object.entries(${JSON.stringify(passing)})) {
  const rendered = program.render(target, { order }, { define });
  if (rendered !== output) throw new Error('TypeScript generated ' + target + ' differs: ' + JSON.stringify(rendered));
}
function code(target) { try { program.render(target, { order: new Order() }); return 'OK'; } catch (error) { return error.code ?? 'UNKNOWN'; } }
const observed = Object.fromEntries(Object.entries(${JSON.stringify(errorCases)}).map(([target, expectedCode]) => [target, code(target) === expectedCode]));
if (Object.values(observed).some(value => !value)) throw new Error('TypeScript native error matrix differs: ' + JSON.stringify(observed));
`);
  run(process.execPath, [tsRunner], root);

  const goDir = join(root, 'packages/template-go', `.generated-native-${process.pid}`);
  mkdirSync(goDir);
  try {
    const goSource = join(goDir, 'generated.go');
    writeFileSync(goSource, compileSource(graphManifest, join(fixture, 'types.json'), 'go'));
    const goPassing = Object.entries(passing).map(([target, output]) => `${goString(target)}: ${goString(output)}`).join(', ');
    writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("testing"; "fmt"; "strings"; template "github.com/polyspec/template"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/value")
type Order struct { Label string }
func (o Order) StatusLabel(prefix string) (string, error) { return prefix + ":12", nil }
func (o Order) Fail(prefix string) (string, error) { return "", fmt.Errorf("failed member") }
func TestGeneratedNativeCalls(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; if err = program.Runtime.RegisterClass("Order", "suffix", func(args []value.Value, _ functions.Context) (any, error) { return "done" + args[0].(string), nil }); err != nil { t.Fatal(err) }; if err = program.Runtime.RegisterClass("Order", "fail", func(args []value.Value, _ functions.Context) (any, error) { return nil, fmt.Errorf("failed class") }); err != nil { t.Fatal(err) }; order := Order{Label: "Order 12"}; assign := map[string]any{"order": order}; actual, err := program.Render("input.tpl", assign, template.RenderOptions{}); if err != nil { t.Fatal(err) }; if actual != ${goString(expected)} { t.Fatalf("generated Go native output differs: %q", actual) }; options := template.RenderOptions{Define: map[string]template.DefineInput{"card": {Template: "part.tpl", Data: map[string]any{"o": order}}}}; for target, output := range map[string]string{${goPassing}} { rendered, err := program.Render(target, assign, options); if err != nil || rendered != output { t.Fatalf("generated Go %s = %q %v", target, rendered, err) } }; expectedCodes := map[string]string{${Object.entries(errorCases).map(([name, code]) => `${goString(name)}: ${goString(code)}`).join(', ')}}; for target, expectedCode := range expectedCodes { _, renderErr := program.Render(target, assign, template.RenderOptions{}); if renderErr == nil || !strings.HasPrefix(renderErr.Error(), expectedCode+":") { t.Fatalf("Go native error %s = %v, want %s", target, renderErr, expectedCode) } } }
`);
    run('go', ['test', '.'], goDir, { GOCACHE: '/tmp/template-go-cache' });
  } finally {
    rmSync(goDir, { recursive: true, force: true });
  }

  const rustSource = join(temporary, 'native.rust');
  writeFileSync(rustSource, compileSource(graphManifest, join(fixture, 'types.json'), 'rust'));
  const rustTest = join(root, 'packages/template-rust/tests/generated_native_object_check.rs');
  const rustPassing = Object.entries(passing).map(([target, output]) => `(${rustString(target)}, ${rustString(output)})`).join(', ');
  writeFileSync(rustTest, `mod generated { include!(${rustString(rustSource)}); }
use polyspec_template::{DefineInput, ErrorCode, HostError, OrderedMap, RenderOptions, RenderTarget, RuntimeEnvironment, TemplateObject, Value};
#[derive(Debug)] struct Order;
fn text(value: &Value) -> String { match value { Value::Str(value) | Value::Safe(value) => value.to_string(), _ => panic!("expected text") } }
impl TemplateObject for Order { fn member(&self, key: &str) -> Result<Option<Value>, HostError> { Ok((key == "label").then(|| Value::text("Order 12"))) } fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, HostError>> { if method == "fail" { return Some(Err("failed member".into())); } if method != "status_label" { return None; } if args.len() != 1 { return Some(Err("invalid status_label".into())); } let prefix = args.first().and_then(Value::as_text).ok_or_else(|| HostError::from("invalid status_label")); Some(prefix.map(|prefix| Value::text(format!("{prefix}:12")))) } }
fn root(order: &Value) -> OrderedMap { let mut root = OrderedMap::new(); root.insert("order".to_string(), order.clone()); root }
#[test] fn generated_native_calls_match() { let mut runtime = RuntimeEnvironment::new(None, std::collections::HashMap::new()); runtime.register_class("Order", "suffix", Box::new(|args, _| Ok(Value::text(format!("done{}", text(&args[0])))))).unwrap(); runtime.register_class("Order", "fail", Box::new(|_, _| Err("failed class".into()))).unwrap(); let program = generated::GeneratedProgram::new(runtime); let order = Value::object(Order); let actual = program.render_values(RenderTarget::Name("input.tpl"), root(&order), &RenderOptions::default()).unwrap(); assert_eq!(actual, ${rustString(expected)}); let mut data = OrderedMap::new(); data.insert("o".to_string(), order.clone()); let mut options = RenderOptions::default(); options.define.insert("card".to_string(), DefineInput { template: Some("part.tpl".to_string()), data: Some(Value::map(data)), html: None }); for (target, output) in [${rustPassing}] { assert_eq!(program.render_values(RenderTarget::Name(target), root(&order), &options).unwrap(), output, "Rust generated {target}"); } let expected_codes = [${Object.entries(errorCases).map(([name, code]) => `(${rustString(name)}, ErrorCode::${code})`).join(', ')}]; for (target, expected) in expected_codes { let error = program.render_values(RenderTarget::Name(target), root(&order), &RenderOptions::default()).unwrap_err(); assert_eq!(error.code, expected, "Rust native error for {target}"); } }
`);
  try {
    run(process.env.HOME + '/.cargo/bin/cargo', ['test', '--locked', '--manifest-path', join(root, 'packages/template-rust/Cargo.toml'), '--test', 'generated_native_object_check'], root, { RUSTFLAGS: '-Dwarnings -Adead-code' });
  } finally {
    rmSync(rustTest, { force: true });
  }

  // The PHP target requires a namespace chosen by the caller of the compiler (docs/spec/compiler.md).
  for (const invalid of [undefined, '', '\\Leading', 'Trailing\\', 'Two\\\\Separators', '1Digit']) {
    assert.throws(() => compileSource(graphManifest, join(fixture, 'types.json'), 'php', invalid === undefined ? {} : { phpNamespace: invalid }), /requires a namespace/);
  }
  const phpSource = join(temporary, 'native.php');
  writeFileSync(phpSource, compileSource(graphManifest, join(fixture, 'types.json'), 'php', { phpNamespace }));
  const secondNamespace = 'Polyspec\\Generated\\NativeCheckSecond';
  const secondSource = join(temporary, 'native-second.php');
  writeFileSync(secondSource, compileSource(graphManifest, join(fixture, 'types.json'), 'php', { phpNamespace: secondNamespace }));
  const phpPassing = Object.entries(passing).map(([target, output]) => `${phpString(target)} => ${phpString(output)}`).join(', ');
  // Global host classes with the generated names and a second program in one process do not collide.
  const phpRunner = `require ${phpString(join(root, 'packages/template-php/vendor/autoload.php'))}; final class GeneratedProgram {} final class Assign {} function render_template(): void {} require ${phpString(phpSource)}; require ${phpString(secondSource)}; class Order { public string $label = 'Order 12'; public function status_label(mixed $prefix): string { if (!is_string($prefix)) throw new RuntimeException('invalid status_label'); return $prefix . ':12'; } public function fail(mixed $prefix): string { throw new RuntimeException('failed member'); } } $runtime = new Polyspec\\Template\\Render\\RuntimeEnvironment(); $runtime->registerClass('Order', 'suffix', static fn (array $args, array $env): string => 'done' . $args[0]); $runtime->registerClass('Order', 'fail', static function (array $args, array $env): string { throw new RuntimeException('failed class'); }); $program = new \\${phpNamespace}\\GeneratedProgram($runtime); $order = new Order(); $actual = $program->render('input.tpl', ['order' => $order]); if ($actual !== ${phpString(expected)}) throw new RuntimeException('PHP generated native output differs'); $second = (new \\${secondNamespace}\\GeneratedProgram($runtime))->render('input.tpl', ['order' => $order]); if ($second !== ${phpString(expected)}) throw new RuntimeException('second PHP generated program output differs'); $define = ['card' => ['template' => 'part.tpl', 'data' => ['o' => $order]]]; foreach ([${phpPassing}] as $target => $output) { $rendered = $program->render($target, ['order' => $order], ['define' => $define]); if ($rendered !== $output) throw new RuntimeException('PHP generated ' . $target . ' differs: ' . $rendered); } $expectedCodes = json_decode(${phpString(JSON.stringify(errorCases))}, true); foreach ($expectedCodes as $target => $expectedCode) { try { $program->render($target, ['order' => new Order()]); throw new RuntimeException('PHP native error did not fail: ' . $target); } catch (Polyspec\\Template\\TemplateError $error) { if ($error->errorCode !== $expectedCode) throw new RuntimeException('PHP native error ' . $target . ' = ' . $error->errorCode . ', want ' . $expectedCode); } }`;
  run('php', ['-r', phpRunner], root);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

assert.ok(true);
process.stdout.write('generated native calls: TypeScript, Go, Rust and PHP outputs matched\n');
