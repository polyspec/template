#!/usr/bin/env node
// Compiles and executes one native object/class-call program in every generated backend.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileAst } from '../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../tools/compiler/compiler.mjs';
import { goString, phpString, rustString } from '../tools/compiler/backend-support.mjs';
import { root } from '../tests/runner/drivers.mjs';
import { goWorkspace, nodeWorkspace, rustWorkspace } from './temporary-workspace.mjs';
import { checkLanguages } from './language-checks.mjs';
import { tsc } from './tools.mjs';

const fixture = join(root, 'tests/fixtures/native-object');
// The workspaces of this check are directories of the system temporary directory, never of the checkout (T20.1).
const temporary = nodeWorkspace('generated-native-calls');
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
// VAL-21 and EXP-39: the shared expectations of host argument values and native object equality.
const hostValues = JSON.parse(readFileSync(join(fixture, 'host-values.json'), 'utf8'));
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

  checkLanguages('generated native calls', {
    TypeScript: () => {
      const tsSource = join(temporary, 'native.ts');
      writeFileSync(tsSource, compileSource(graphManifest, join(fixture, 'types.json'), 'ts'));
      const tsOutput = join(temporary, 'ts');
      mkdirSync(tsOutput);
      run('node', [tsc, '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', tsOutput, tsSource], root);
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
const hostValues = ${JSON.stringify(hostValues)};
function describeValue(value, order) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool(' + value + ')';
  if (typeof value === 'number') return 'number(' + value + ')';
  if (typeof value === 'string') return 'string(' + value + ')';
  if (Array.isArray(value)) return 'list(' + value.map(item => describeValue(item, order)).join(',') + ')';
  if (value instanceof Map) return 'map(' + [...value].map(([key, item]) => key + '=' + describeValue(item, order)).join(',') + ')';
  return value === order ? 'object(order)' : 'unexpected';
}
const describeArguments = (args, order) => args.map(item => describeValue(item, order)).join(',');
class ValueOrder { describe(...args) { return describeArguments(args, this); } }
function renderHostValue(target) {
  const valueOrder = new ValueOrder();
  const valuesRuntime = new RuntimeEnvironment();
  valuesRuntime.register('describe', args => describeArguments(args, valueOrder));
  valuesRuntime.register('mutate', ([list, map, items]) => { list[0] = 'changed'; map.set('k', 'changed'); items.push('added'); return null; });
  valuesRuntime.register('pick', ([value]) => value);
  valuesRuntime.registerClass('Order', 'describe', args => describeArguments(args, valueOrder));
  return new GeneratedProgram(valuesRuntime).render(target, { order: valueOrder, same: valueOrder, other: new ValueOrder(), items: [1] });
}
for (const [target, output] of Object.entries(hostValues.outputs)) { const rendered = renderHostValue(target); if (rendered !== output) throw new Error('TypeScript generated ' + target + ' differs: ' + JSON.stringify(rendered)); }
for (const [target, expectedCode] of Object.entries(hostValues.errors)) { let actualCode = 'OK'; try { renderHostValue(target); } catch (error) { actualCode = error.code; } if (actualCode !== expectedCode) throw new Error('TypeScript generated ' + target + ' = ' + actualCode); }
`);
      run(process.execPath, [tsRunner], root);
    },
    Go: () => {
      const goDir = goWorkspace('generated-native-calls-go');
      try {
        const goSource = join(goDir, 'generated.go');
        writeFileSync(goSource, compileSource(graphManifest, join(fixture, 'types.json'), 'go'));
        const goPassing = Object.entries(passing).map(([target, output]) => `${goString(target)}: ${goString(output)}`).join(', ');
        writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("testing"; "fmt"; "strconv"; "strings"; template "github.com/polyspec/template"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/value")
type Order struct { Label string }
func (o Order) StatusLabel(prefix string) (string, error) { return prefix + ":12", nil }
func (o Order) Fail(prefix string) (string, error) { return "", fmt.Errorf("failed member") }
func TestGeneratedNativeCalls(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; if err = program.Runtime.RegisterClass("Order", "suffix", func(args []value.Value, _ functions.Context) (any, error) { return "done" + args[0].(string), nil }); err != nil { t.Fatal(err) }; if err = program.Runtime.RegisterClass("Order", "fail", func(args []value.Value, _ functions.Context) (any, error) { return nil, fmt.Errorf("failed class") }); err != nil { t.Fatal(err) }; order := Order{Label: "Order 12"}; assign := map[string]any{"order": order}; actual, err := program.Render("input.tpl", assign, template.RenderOptions{}); if err != nil { t.Fatal(err) }; if actual != ${goString(expected)} { t.Fatalf("generated Go native output differs: %q", actual) }; options := template.RenderOptions{Define: map[string]template.DefineInput{"card": {Template: "part.tpl", Data: map[string]any{"o": order}}}}; for target, output := range map[string]string{${goPassing}} { rendered, err := program.Render(target, assign, options); if err != nil || rendered != output { t.Fatalf("generated Go %s = %q %v", target, rendered, err) } }; expectedCodes := map[string]string{${Object.entries(errorCases).map(([name, code]) => `${goString(name)}: ${goString(code)}`).join(', ')}}; for target, expectedCode := range expectedCodes { _, renderErr := program.Render(target, assign, template.RenderOptions{}); if renderErr == nil || !strings.HasPrefix(renderErr.Error(), expectedCode+":") { t.Fatalf("Go native error %s = %v, want %s", target, renderErr, expectedCode) } } }
type ValueOrder struct { Label string }
func (o *ValueOrder) Describe(a, b, c, d, e, f, g, h any) string { return describeArguments([]any{a, b, c, d, e, f, g, h}, o) }
func describeValue(input any, order *ValueOrder) string { switch current := input.(type) { case nil: return "null"; case bool: return "bool(" + strconv.FormatBool(current) + ")"; case float64: return "number(" + strconv.FormatFloat(current, 'f', -1, 64) + ")"; case string: return "string(" + current + ")"; case value.List: parts := []string{}; for _, item := range current { parts = append(parts, describeValue(item, order)) }; return "list(" + strings.Join(parts, ",") + ")"; case *value.OrderedMap: parts := []string{}; for _, key := range current.Keys() { parts = append(parts, key+"="+describeValue(current.MustGet(key), order)) }; return "map(" + strings.Join(parts, ",") + ")"; case *ValueOrder: if current == order { return "object(order)" } }; return "unexpected" }
func describeArguments(args []any, order *ValueOrder) string { parts := []string{}; for _, item := range args { parts = append(parts, describeValue(item, order)) }; return strings.Join(parts, ",") }
func renderHostValue(t *testing.T, target string) (string, error) { order := &ValueOrder{Label: "order"}; program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; describe := func(args []value.Value, _ functions.Context) (any, error) { return describeArguments(args, order), nil }; if err := program.Runtime.Register("describe", describe); err != nil { t.Fatal(err) }; if err := program.Runtime.Register("mutate", func(args []value.Value, _ functions.Context) (any, error) { args[0].(value.List)[0] = "changed"; args[1].(*value.OrderedMap).Set("k", "changed"); args[2].(value.List)[0] = "changed"; return nil, nil }); err != nil { t.Fatal(err) }; if err := program.Runtime.Register("pick", func(args []value.Value, _ functions.Context) (any, error) { return args[0], nil }); err != nil { t.Fatal(err) }; if err := program.Runtime.RegisterClass("Order", "describe", describe); err != nil { t.Fatal(err) }; return program.Render(target, map[string]any{"order": order, "same": order, "other": &ValueOrder{Label: "order"}, "items": []any{1}}, template.RenderOptions{}) }
func TestGeneratedHostValues(t *testing.T) { for target, output := range map[string]string{${Object.entries(hostValues.outputs).map(([name, output]) => `${goString(name)}: ${goString(output)}`).join(', ')}} { actual, err := renderHostValue(t, target); if err != nil || actual != output { t.Fatalf("generated Go %s = %q %v", target, actual, err) } }; for target, code := range map[string]string{${Object.entries(hostValues.errors).map(([name, code]) => `${goString(name)}: ${goString(code)}`).join(', ')}} { _, err := renderHostValue(t, target); if err == nil || !strings.HasPrefix(err.Error(), code+":") { t.Fatalf("generated Go %s = %v, want %s", target, err, code) } } }
`);
        run('go', ['test', '.'], goDir, { GOCACHE: '/tmp/template-go-cache' });
      } finally {
        rmSync(goDir, { recursive: true, force: true });
      }
    },
    Rust: () => {
      const rustSource = join(temporary, 'native.rust');
      writeFileSync(rustSource, compileSource(graphManifest, join(fixture, 'types.json'), 'rust'));
      const rust = rustWorkspace('generated-native-calls-rust');
      const rustTest = rust.test('generated_native_object_check');
      const rustPassing = Object.entries(passing).map(([target, output]) => `(${rustString(target)}, ${rustString(output)})`).join(', ');
      writeFileSync(rustTest, `mod generated { include!(${rustString(rustSource)}); }
use polyspec_template::{DefineData, DefineInput, ErrorCode, HostError, OrderedMap, RenderOptions, RenderTarget, RequestError, RuntimeEnvironment, TemplateObject, Value};
fn template_error(error: RequestError) -> polyspec_template::TemplateError { match error { RequestError::Template(error) => error, RequestError::Argument(error) => panic!("unexpected argument error: {error}") } }
#[derive(Debug)] struct Order;
fn text(value: &Value) -> String { match value { Value::Str(value) | Value::Safe(value) => value.to_string(), _ => panic!("expected text") } }
impl TemplateObject for Order { fn member(&self, key: &str) -> Result<Option<Value>, HostError> { Ok((key == "label").then(|| Value::text("Order 12"))) } fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, HostError>> { if method == "fail" { return Some(Err("failed member".into())); } if method != "status_label" { return None; } if args.len() != 1 { return Some(Err("invalid status_label".into())); } let prefix = args.first().and_then(Value::as_text).ok_or_else(|| HostError::from("invalid status_label")); Some(prefix.map(|prefix| Value::text(format!("{prefix}:12")))) } }
fn root(order: &Value) -> OrderedMap { let mut root = OrderedMap::new(); root.insert("order".to_string(), order.clone()); root }
#[test] fn generated_native_calls_match() { let mut runtime = RuntimeEnvironment::new(None, std::collections::HashMap::new()); runtime.register_class("Order", "suffix", Box::new(|args, _| Ok(Value::text(format!("done{}", text(&args[0])))))).unwrap(); runtime.register_class("Order", "fail", Box::new(|_, _| Err("failed class".into()))).unwrap(); let program = generated::GeneratedProgram::new(runtime); let order = Value::object(Order); let actual = program.render_values(RenderTarget::Name("input.tpl"), root(&order), &RenderOptions::default()).unwrap(); assert_eq!(actual, ${rustString(expected)}); let mut data = OrderedMap::new(); data.insert("o".to_string(), order.clone()); let mut options = RenderOptions::default(); options.define.insert("card".to_string(), DefineInput { template: Some("part.tpl".to_string()), data: Some(DefineData::Value(Value::map(data))), html: None }); for (target, output) in [${rustPassing}] { assert_eq!(program.render_values(RenderTarget::Name(target), root(&order), &options).unwrap(), output, "Rust generated {target}"); } let expected_codes = [${Object.entries(errorCases).map(([name, code]) => `(${rustString(name)}, ErrorCode::${code})`).join(', ')}]; for (target, expected) in expected_codes { let error = template_error(program.render_values(RenderTarget::Name(target), root(&order), &RenderOptions::default()).unwrap_err()); assert_eq!(error.code, expected, "Rust native error for {target}"); } }
#[derive(Debug)] struct ValueOrder;
fn same_order(object: &std::rc::Rc<dyn TemplateObject>, order: &ValueOrder) -> bool { std::ptr::eq(std::rc::Rc::as_ptr(object).cast::<()>(), std::ptr::from_ref(order).cast::<()>()) }
fn describe_value(value: &Value, is_order: &dyn Fn(&std::rc::Rc<dyn TemplateObject>) -> bool) -> String { match value { Value::Null => "null".to_string(), Value::Bool(value) => format!("bool({value})"), Value::Number(value) => format!("number({value})"), Value::Str(text) => format!("string({text})"), Value::List(items) => format!("list({})", items.iter().map(|item| describe_value(item, is_order)).collect::<Vec<_>>().join(",")), Value::Map(map) => format!("map({})", map.iter().map(|(key, item)| format!("{key}={}", describe_value(item, is_order))).collect::<Vec<_>>().join(",")), Value::Object(object) if is_order(object) => "object(order)".to_string(), _ => "unexpected".to_string() } }
fn describe_arguments(args: &[Value], is_order: &dyn Fn(&std::rc::Rc<dyn TemplateObject>) -> bool) -> String { args.iter().map(|item| describe_value(item, is_order)).collect::<Vec<_>>().join(",") }
impl TemplateObject for ValueOrder { fn member(&self, _key: &str) -> Result<Option<Value>, HostError> { Ok(None) } fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, HostError>> { (method == "describe").then(|| Ok(Value::text(describe_arguments(args, &|object| same_order(object, self))))) } }
fn render_host_value(target: &str) -> Result<String, RequestError> { let order = Value::object(ValueOrder); let Value::Object(original) = order.clone() else { unreachable!() }; let mut runtime = RuntimeEnvironment::new(None, std::collections::HashMap::new()); let function_original = std::rc::Rc::clone(&original); runtime.register("describe", Box::new(move |args, _| Ok(Value::text(describe_arguments(args, &|object| std::rc::Rc::ptr_eq(object, &function_original)))))).unwrap(); runtime.register("mutate", Box::new(|_, _| Ok(Value::Null))).unwrap(); runtime.register("pick", Box::new(|args, _| Ok(args[0].clone()))).unwrap(); let class_original = std::rc::Rc::clone(&original); runtime.register_class("Order", "describe", Box::new(move |args, _| Ok(Value::text(describe_arguments(args, &|object| std::rc::Rc::ptr_eq(object, &class_original)))))).unwrap(); let program = generated::GeneratedProgram::new(runtime); let mut root = OrderedMap::new(); root.insert("order".to_string(), order.clone()); root.insert("same".to_string(), order); root.insert("other".to_string(), Value::object(ValueOrder)); root.insert("items".to_string(), Value::list(vec![Value::Number(1.0)])); program.render_values(RenderTarget::Name(target), root, &RenderOptions::default()) }
#[test] fn generated_host_values_match() { for (target, output) in [${Object.entries(hostValues.outputs).map(([name, output]) => `(${rustString(name)}, ${rustString(output)})`).join(', ')}] { assert_eq!(render_host_value(target).unwrap(), output, "Rust generated {target}"); } for (target, code) in [${Object.entries(hostValues.errors).map(([name, code]) => `(${rustString(name)}, ErrorCode::${code})`).join(', ')}] { assert_eq!(template_error(render_host_value(target).unwrap_err()).code, code, "Rust generated {target}"); } }
`);
      try {
        run(process.env.HOME + '/.cargo/bin/cargo', ['test', '--locked', '--offline', '--manifest-path', rust.manifest, '--test', 'generated_native_object_check'], root, { CARGO_TARGET_DIR: rust.targetDirectory, RUSTFLAGS: '-Dwarnings -Adead-code' });
      } finally {
        rmSync(rust.directory, { recursive: true, force: true });
      }
    },
    PHP: () => {
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
      const phpRunner = `require ${phpString(join(root, 'packages/template-php/vendor/autoload.php'))}; final class GeneratedProgram {} final class Assign {} function render_template(): void {} require ${phpString(phpSource)}; require ${phpString(secondSource)}; class Order { public string $label = 'Order 12'; public function status_label(mixed $prefix): string { if (!is_string($prefix)) throw new RuntimeException('invalid status_label'); return $prefix . ':12'; } public function fail(mixed $prefix): string { throw new RuntimeException('failed member'); } } $runtime = new Polyspec\\Template\\Render\\RuntimeEnvironment(); $runtime->registerClass('Order', 'suffix', static fn (array $args, array $env): string => 'done' . $args[0]); $runtime->registerClass('Order', 'fail', static function (array $args, array $env): string { throw new RuntimeException('failed class'); }); $program = new \\${phpNamespace}\\GeneratedProgram($runtime); $order = new Order(); $actual = $program->render('input.tpl', ['order' => $order]); if ($actual !== ${phpString(expected)}) throw new RuntimeException('PHP generated native output differs'); $second = (new \\${secondNamespace}\\GeneratedProgram($runtime))->render('input.tpl', ['order' => $order]); if ($second !== ${phpString(expected)}) throw new RuntimeException('second PHP generated program output differs'); $define = ['card' => ['template' => 'part.tpl', 'data' => ['o' => $order]]]; foreach ([${phpPassing}] as $target => $output) { $rendered = $program->render($target, ['order' => $order], ['define' => $define]); if ($rendered !== $output) throw new RuntimeException('PHP generated ' . $target . ' differs: ' . $rendered); } $expectedCodes = json_decode(${phpString(JSON.stringify(errorCases))}, true); foreach ($expectedCodes as $target => $expectedCode) { try { $program->render($target, ['order' => new Order()]); throw new RuntimeException('PHP native error did not fail: ' . $target); } catch (Polyspec\\Template\\TemplateError $error) { if ($error->errorCode !== $expectedCode) throw new RuntimeException('PHP native error ' . $target . ' = ' . $error->errorCode . ', want ' . $expectedCode); } } final class ValueOrder { public function describe(mixed ...$args): string { return value_describe_arguments($args, $this); } } function value_describe(mixed $value, object $order): string { if ($value === null) return 'null'; if (is_bool($value)) return 'bool(' . ($value ? 'true' : 'false') . ')'; if (is_float($value)) return 'number(' . $value . ')'; if (is_string($value)) return 'string(' . $value . ')'; if (is_array($value) && array_is_list($value)) return 'list(' . value_describe_arguments($value, $order) . ')'; if (is_array($value)) { $parts = []; foreach ($value as $key => $item) $parts[] = $key . '=' . value_describe($item, $order); return 'map(' . implode(',', $parts) . ')'; } return $value === $order ? 'object(order)' : 'unexpected'; } function value_describe_arguments(array $args, object $order): string { return implode(',', array_map(static fn (mixed $item): string => value_describe($item, $order), $args)); } function render_host_value(string $target): string { $valueOrder = new ValueOrder(); $valuesRuntime = new Polyspec\\Template\\Render\\RuntimeEnvironment(); $valuesRuntime->register('describe', static fn (array $args): string => value_describe_arguments($args, $valueOrder)); $valuesRuntime->register('mutate', static function (array $args): mixed { $args[0][0] = 'changed'; $args[1]['k'] = 'changed'; $args[2][] = 'added'; return null; }); $valuesRuntime->register('pick', static fn (array $args): mixed => $args[0]); $valuesRuntime->registerClass('Order', 'describe', static fn (array $args): string => value_describe_arguments($args, $valueOrder)); return (new \\${phpNamespace}\\GeneratedProgram($valuesRuntime))->render($target, ['order' => $valueOrder, 'same' => $valueOrder, 'other' => new ValueOrder(), 'items' => [1]]); } $hostValues = json_decode(${phpString(JSON.stringify(hostValues))}, true); foreach ($hostValues['outputs'] as $target => $output) { $rendered = render_host_value($target); if ($rendered !== $output) throw new RuntimeException('PHP generated ' . $target . ' differs: ' . $rendered); } foreach ($hostValues['errors'] as $target => $expectedCode) { try { render_host_value($target); throw new RuntimeException('PHP generated ' . $target . ' did not fail'); } catch (Polyspec\\Template\\TemplateError $error) { if ($error->errorCode !== $expectedCode) throw new RuntimeException('PHP generated ' . $target . ' = ' . $error->errorCode); } }`;
      run('php', ['-r', phpRunner], root);
    },
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

assert.ok(true);
process.stdout.write('generated native calls and host values: TypeScript, Go, Rust and PHP outputs matched\n');
