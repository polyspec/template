#!/usr/bin/env node
// Compiles tests/fixtures/typed-values with its typed manifest in every generated backend and checks
// that typed records, typed lists and typed maps reach host functions, built-in functions and
// operators as canonical values (VAL-21, EXP-34, docs/spec/compiler.md). The AST program renders the
// same template with the same data to the same output.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileAst } from '../packages/template-compiler/ast-artifact.mjs';
import { compileSource } from '../packages/template-compiler/compiler.mjs';
import { goString, phpString, rustString } from '../packages/template-compiler/backend-support.mjs';
import { root } from '../tests/runner/drivers.mjs';
import { goWorkspace, nodeWorkspace, rustWorkspace } from './temporary-workspace.mjs';
import { checkLanguages } from './language-checks.mjs';
import { pythonCommand, pythonEnvironment } from './python-toolchain.mjs';
import { tsc } from './tools.mjs';

const fixture = join(root, 'tests/fixtures/typed-values');
const types = join(fixture, 'types.json');
const source = readFileSync(join(fixture, 'input.tpl'), 'utf8');
const expected = readFileSync(join(fixture, 'expected.html'), 'utf8');
// The workspaces of this check are directories of the system temporary directory, never of the checkout (T20.1).
const temporary = nodeWorkspace('generated-typed-values');
const run = (command, args, cwd, env = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}${result.stderr}`);
  return result.stdout;
};

// The describe function of every host: the host form of each argument (VAL-21).
const tsDescribe = `function describeValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool(' + value + ')';
  if (typeof value === 'number') return 'number(' + value + ')';
  if (typeof value === 'string') return 'string(' + value + ')';
  if (Array.isArray(value)) return 'list(' + value.map(describeValue).join(',') + ')';
  if (value instanceof Map) return 'map(' + [...value].map(([key, item]) => key + '=' + describeValue(item)).join(',') + ')';
  return 'unexpected(' + Object.prototype.toString.call(value) + ')';
}
const describe = args => args.map(describeValue).join(',');`;
const assign = `{ page: { title: 'T', count: 2 }, rows: [{ name: 'a' }, { name: 'b' }], tags: new Map([['x', 1]]) }`;

try {
  const graph = join(temporary, 'ast');
  compileAst({ root: fixture, output: graph, entry: 'input.tpl', refresh: 'dev', typeManifest: types });
  const graphManifest = join(graph, 'manifest.json');

  checkLanguages('generated typed values', {
    TypeScript: () => {
      // TypeScript generated program and the TypeScript AST program as the reference.
      const tsSource = join(temporary, 'typed.ts');
      writeFileSync(tsSource, compileSource(graphManifest, types, 'ts'));
      run('node', [tsc, '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', join(temporary, 'ts'), tsSource], root);
      const tsRunner = join(temporary, 'typed.mjs');
      writeFileSync(tsRunner, `import { GeneratedProgram } from './ts/typed.js';
import { AstProgram, MapLoader, RuntimeEnvironment } from '@polyspec/template';
${tsDescribe}
const expected = ${JSON.stringify(expected)};
const runtime = new RuntimeEnvironment();
runtime.register('describe', describe);
const generated = new GeneratedProgram(runtime).render('input.tpl', ${assign});
if (generated !== expected) throw new Error('TypeScript generated typed values differ: ' + JSON.stringify(generated));
const ast = new AstProgram({ loader: new MapLoader({ 'input.tpl': ${JSON.stringify(source)} }) });
ast.register('describe', describe);
const reference = ast.render('input.tpl', ${assign});
if (reference !== expected) throw new Error('TypeScript AST typed values differ: ' + JSON.stringify(reference));
`);
      run(process.execPath, [tsRunner], root);
    },
    Go: () => {
      // Go.
      const goDir = goWorkspace('generated-typed-values-go');
      try {
        writeFileSync(join(goDir, 'generated.go'), compileSource(graphManifest, types, 'go'));
        writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("strconv"; "strings"; "testing"; template "github.com/polyspec/template/packages/template-go"; "github.com/polyspec/template/packages/template-go/functions"; "github.com/polyspec/template/packages/template-go/value")
func describeValue(input any) string { switch current := input.(type) { case nil: return "null"; case bool: return "bool(" + strconv.FormatBool(current) + ")"; case float64: return "number(" + strconv.FormatFloat(current, 'f', -1, 64) + ")"; case string: return "string(" + current + ")"; case value.List: parts := []string{}; for _, item := range current { parts = append(parts, describeValue(item)) }; return "list(" + strings.Join(parts, ",") + ")"; case *value.OrderedMap: parts := []string{}; for _, key := range current.Keys() { parts = append(parts, key+"="+describeValue(current.MustGet(key))) }; return "map(" + strings.Join(parts, ",") + ")" }; return "unexpected" }
func TestGeneratedTypedValues(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; if err := program.Runtime.Register("describe", func(args []value.Value, _ functions.Context) (any, error) { parts := []string{}; for _, item := range args { parts = append(parts, describeValue(item)) }; return strings.Join(parts, ","), nil }); err != nil { t.Fatal(err) }; page := value.NewOrderedMap(); page.Set("title", "T"); page.Set("count", 2.0); first := value.NewOrderedMap(); first.Set("name", "a"); second := value.NewOrderedMap(); second.Set("name", "b"); tags := value.NewOrderedMap(); tags.Set("x", 1.0); assign := value.NewOrderedMap(); assign.Set("page", page); assign.Set("rows", value.List{first, second}); assign.Set("tags", tags); actual, err := program.Render("input.tpl", assign, template.RenderOptions{}); if err != nil || actual != ${goString(expected)} { t.Fatalf("generated Go typed values = %q %v", actual, err) } }
`);
        run('go', ['test', '.'], goDir);
      } finally {
        rmSync(goDir, { recursive: true, force: true });
      }
    },
    Rust: () => {
      // Rust.
      const rustSource = join(temporary, 'typed.rust');
      writeFileSync(rustSource, compileSource(graphManifest, types, 'rust'));
      const rust = rustWorkspace('generated-typed-values-rust');
      const rustTest = rust.test('generated_typed_values_check');
      writeFileSync(rustTest, `mod generated { include!(${rustString(rustSource)}); }
use polyspec_template::{Program, RenderOptions, RenderTarget, RuntimeEnvironment, Value};
fn describe_value(value: &Value) -> String { match value { Value::Null => "null".to_string(), Value::Bool(value) => format!("bool({value})"), Value::Number(value) => format!("number({value})"), Value::Str(text) => format!("string({text})"), Value::List(items) => format!("list({})", items.iter().map(describe_value).collect::<Vec<_>>().join(",")), Value::Map(map) => format!("map({})", map.iter().map(|(key, item)| format!("{key}={}", describe_value(item))).collect::<Vec<_>>().join(",")), _ => "unexpected".to_string() } }
#[test] fn generated_typed_values_match() { let mut runtime = RuntimeEnvironment::new(None, std::collections::HashMap::new()); runtime.register("describe", Box::new(|args, _| Ok(Value::text(args.iter().map(describe_value).collect::<Vec<_>>().join(","))))).unwrap(); let program = generated::GeneratedProgram::new(runtime); let assign = serde_json::json!({ "page": { "title": "T", "count": 2 }, "rows": [{ "name": "a" }, { "name": "b" }], "tags": { "x": 1 } }); assert_eq!(program.render(RenderTarget::Name("input.tpl"), &assign, &RenderOptions::default()).unwrap(), ${rustString(expected)}); }
`);
      try {
        run(process.env.HOME + '/.cargo/bin/cargo', ['test', '--locked', '--offline', '--manifest-path', rust.manifest, '--test', 'generated_typed_values_check'], root, { CARGO_TARGET_DIR: rust.targetDirectory, RUSTFLAGS: '-Dwarnings -Adead-code' });
      } finally {
        rmSync(rust.directory, { recursive: true, force: true });
      }
    },
    PHP: () => {
      // PHP.
      const phpNamespace = 'Polyspec\\Generated\\TypedValues';
      const phpSource = join(temporary, 'typed.php');
      writeFileSync(phpSource, compileSource(graphManifest, types, 'php', { phpNamespace }));
      run('php', ['-r', `require ${phpString(join(root, 'packages/template-php/vendor/autoload.php'))}; require ${phpString(phpSource)}; function describe_value(mixed $value): string { if ($value === null) return 'null'; if (is_bool($value)) return 'bool(' . ($value ? 'true' : 'false') . ')'; if (is_float($value)) return 'number(' . $value . ')'; if (is_string($value)) return 'string(' . $value . ')'; if (is_array($value) && array_is_list($value)) return 'list(' . implode(',', array_map('describe_value', $value)) . ')'; if (is_array($value)) { $parts = []; foreach ($value as $key => $item) $parts[] = $key . '=' . describe_value($item); return 'map(' . implode(',', $parts) . ')'; } return 'unexpected(' . get_debug_type($value) . ')'; } $runtime = new Polyspec\\Template\\Render\\RuntimeEnvironment(); $runtime->register('describe', static fn (array $args): string => implode(',', array_map('describe_value', $args))); $actual = (new \\${phpNamespace}\\GeneratedProgram($runtime))->render('input.tpl', ['page' => ['title' => 'T', 'count' => 2], 'rows' => [['name' => 'a'], ['name' => 'b']], 'tags' => ['x' => 1]]); if ($actual !== ${phpString(expected)}) throw new RuntimeException('PHP generated typed values differ: ' . $actual);`], root);
    },
    Python: () => {
      // Python: the generated program renders through Engine like the AST program; the generated module imports the package from its sources (scripts/python-toolchain.mjs).
      const pythonDir = join(temporary, 'python');
      mkdirSync(pythonDir);
      writeFileSync(join(pythonDir, 'generated.py'), compileSource(graphManifest, types, 'python'));
      writeFileSync(join(pythonDir, 'expected.html'), expected);
      writeFileSync(join(pythonDir, 'check.py'), `import sys
from polyspec.template import Engine, RuntimeEnvironment
from generated import GeneratedProgram


def describe_value(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'bool(' + ('true' if value else 'false') + ')'
    if isinstance(value, (int, float)):
        return 'number(' + (str(int(value)) if value == int(value) else repr(value)) + ')'
    if isinstance(value, str):
        return 'string(' + value + ')'
    if isinstance(value, list):
        return 'list(' + ','.join(describe_value(item) for item in value) + ')'
    if isinstance(value, dict):
        return 'map(' + ','.join(key + '=' + describe_value(item) for key, item in value.items()) + ')'
    return 'unexpected(' + type(value).__name__ + ')'


runtime = RuntimeEnvironment()
runtime.register('describe', lambda args, _context: ','.join(describe_value(item) for item in args))
assign = {'page': {'title': 'T', 'count': 2}, 'rows': [{'name': 'a'}, {'name': 'b'}], 'tags': {'x': 1}}
actual = Engine(GeneratedProgram(runtime)).render('input.tpl', assign)
with open('expected.html', encoding='utf-8', newline='') as handle:
    expected = handle.read()
if actual != expected:
    sys.exit('Python generated typed values differ: ' + repr(actual))
`);
      run(pythonCommand(), ['check.py'], pythonDir, pythonEnvironment());
    },
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('generated typed values: TypeScript, Go, Rust, PHP and Python outputs matched the AST program\n');
