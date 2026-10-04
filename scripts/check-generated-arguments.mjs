#!/usr/bin/env node
// Compiles tests/fixtures/typed-arguments with its typed manifest in every generated backend and checks
// that a request whose `assign` or definition `data` does not match the declared types fails with the
// argument error of the host language, which passes to the host unchanged and is not an ERR-1 error
// (ERR-13): an `Error` of TypeScript that is not a `TemplateError` or a built-in subclass, a Go error
// that is not an `*errs.Error`, `RequestError::Argument` of Rust and `\InvalidArgumentException` of PHP.
// A request that matches the declared types renders `T|N`.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileAst } from '../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../tools/compiler/compiler.mjs';
import { phpString, rustString } from '../tools/compiler/backend-support.mjs';
import { root } from '../tests/runner/drivers.mjs';

const fixture = join(root, 'tests/fixtures/typed-arguments');
const types = join(fixture, 'types.json');
const expected = readFileSync(join(fixture, 'expected.html'), 'utf8');
const temporary = mkdtempSync(join(root, '.generated-arguments-'));
const failures = [];
const run = (language, command, args, cwd, env = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) failures.push(`${language}: ${command} exited with ${result.status}\n${result.stdout}${result.stderr}`);
};

try {
  const graph = join(temporary, 'ast');
  compileAst({ root: fixture, output: graph, entry: 'input.tpl', refresh: 'dev', typeManifest: types });
  const graphManifest = join(graph, 'manifest.json');

  // TypeScript.
  const tsSource = join(temporary, 'typed.ts');
  writeFileSync(tsSource, compileSource(graphManifest, types, 'ts'));
  const tsc = spawnSync('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', join(temporary, 'ts'), tsSource], { cwd: root, encoding: 'utf8' });
  if (tsc.status !== 0) failures.push(`TypeScript: tsc exited with ${tsc.status}\n${tsc.stdout}${tsc.stderr}`);
  const tsRunner = join(temporary, 'typed.mjs');
  writeFileSync(tsRunner, `import { GeneratedProgram } from './ts/typed.js';
import { RuntimeEnvironment, TemplateError } from '@polyspec/template';
const program = new GeneratedProgram(new RuntimeEnvironment());
const card = name => ({ define: { card: { template: 'part.tpl', data: { name } } } });
const rendered = program.render('input.tpl', { title: 'T' }, card('N'));
if (rendered !== ${JSON.stringify(expected)}) throw new Error('TypeScript renders ' + JSON.stringify(rendered));
const kind = request => { try { request(); return 'rendered'; } catch (error) { if (error instanceof TemplateError) return 'template ' + error.code; return Object.getPrototypeOf(error) === Error.prototype ? 'argument' : 'other ' + error?.constructor?.name; } };
const kinds = [kind(() => program.render('input.tpl', { title: 1 }, card('N'))), kind(() => program.render('input.tpl', { title: 'T' }, card(2)))];
if (kinds.some(item => item !== 'argument')) throw new Error('TypeScript reports ' + kinds.join(', '));
`);
  run('TypeScript', process.execPath, [tsRunner], root);

  // Go.
  const goDir = join(root, 'packages/template-go', `.generated-arguments-${process.pid}`);
  mkdirSync(goDir);
  try {
    writeFileSync(join(goDir, 'generated.go'), compileSource(graphManifest, types, 'go'));
    writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("errors"; "testing"; template "github.com/polyspec/template"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/render"; "github.com/polyspec/template/value")
func request(title any, name any) (value.Value, template.RenderOptions) { assign := value.NewOrderedMap(); assign.Set("title", title); data := value.NewOrderedMap(); data.Set("name", name); return assign, template.RenderOptions{Define: map[string]render.DefineInput{"card": {Template: "part.tpl", Data: data}}} }
func kind(err error) string { if err == nil { return "rendered" }; var te *errs.Error; if errors.As(err, &te) { return "template " + string(te.Code) }; return "argument" }
func TestGeneratedArguments(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; assign, options := request("T", "N"); actual, err := program.Render("input.tpl", assign, options); if err != nil || actual != "T|N" { t.Fatalf("Go renders %q %v", actual, err) }; first, firstOptions := request(1.0, "N"); _, firstErr := program.Render("input.tpl", first, firstOptions); second, secondOptions := request("T", 2.0); _, secondErr := program.Render("input.tpl", second, secondOptions); if kind(firstErr) != "argument" || kind(secondErr) != "argument" { t.Fatalf("Go reports %s, %s", kind(firstErr), kind(secondErr)) } }
`);
    run('Go', 'go', ['test', '.'], goDir, { GOCACHE: '/tmp/template-go-cache' });
  } finally {
    rmSync(goDir, { recursive: true, force: true });
  }

  // Rust.
  const rustSource = join(temporary, 'typed.rust');
  writeFileSync(rustSource, compileSource(graphManifest, types, 'rust'));
  const rustTest = join(root, 'packages/template-rust/tests/generated_arguments_check.rs');
  writeFileSync(rustTest, `mod generated { include!(${rustString(rustSource)}); }
use polyspec_template::{DefineData, DefineInput, OrderedMap, Program, RenderOptions, RenderTarget, RuntimeEnvironment, Value};
fn options(name: Value) -> RenderOptions { let mut options = RenderOptions::default(); let mut data = OrderedMap::new(); data.insert("name".to_string(), name); options.define.insert("card".to_string(), DefineInput { template: Some("part.tpl".to_string()), data: Some(DefineData::Value(Value::map(data))), html: None }); options }
fn kind<T, E: std::fmt::Debug>(result: Result<T, E>) -> String { match result { Ok(_) => "rendered".to_string(), Err(error) => { let text = format!("{error:?}"); if text.starts_with("Argument(") { "argument".to_string() } else { text } } } }
#[test] fn generated_arguments_fail_as_argument_errors() { let program = generated::GeneratedProgram::new(RuntimeEnvironment::new(None, std::collections::HashMap::new())); assert_eq!(program.render(RenderTarget::Name("input.tpl"), &serde_json::json!({ "title": "T" }), &options(Value::text("N"))).unwrap(), ${rustString(expected)}); let first = kind(program.render(RenderTarget::Name("input.tpl"), &serde_json::json!({ "title": 1 }), &options(Value::text("N")))); let second = kind(program.render(RenderTarget::Name("input.tpl"), &serde_json::json!({ "title": "T" }), &options(Value::Number(2.0)))); assert!(first == "argument" && second == "argument", "Rust reports {first}, {second}"); }
`);
  try {
    run('Rust', process.env.HOME + '/.cargo/bin/cargo', ['test', '--locked', '--manifest-path', join(root, 'packages/template-rust/Cargo.toml'), '--test', 'generated_arguments_check'], root, { RUSTFLAGS: '-Dwarnings -Adead-code' });
  } finally {
    rmSync(rustTest, { force: true });
  }

  // PHP.
  const phpNamespace = 'Polyspec\\Generated\\TypedArguments';
  const phpSource = join(temporary, 'typed.php');
  writeFileSync(phpSource, compileSource(graphManifest, types, 'php', { phpNamespace }));
  run('PHP', 'php', ['-r', `require ${phpString(join(root, 'packages/template-php/vendor/autoload.php'))}; require ${phpString(phpSource)}; $program = new \\${phpNamespace}\\GeneratedProgram(new Polyspec\\Template\\Render\\RuntimeEnvironment()); $card = static fn (mixed $name): array => ['define' => ['card' => ['template' => 'part.tpl', 'data' => ['name' => $name]]]]; $rendered = $program->render('input.tpl', ['title' => 'T'], $card('N')); if ($rendered !== ${phpString(expected)}) throw new RuntimeException('PHP renders ' . $rendered); $kind = static function (callable $request): string { try { $request(); return 'rendered'; } catch (Polyspec\\Template\\TemplateError $error) { return 'template ' . $error->errorCode; } catch (InvalidArgumentException) { return 'argument'; } catch (Throwable $error) { return 'other ' . $error::class; } }; $kinds = [$kind(static fn () => $program->render('input.tpl', ['title' => 1], $card('N'))), $kind(static fn () => $program->render('input.tpl', ['title' => 'T'], $card(2)))]; if ($kinds !== ['argument', 'argument']) throw new RuntimeException('PHP reports ' . implode(', ', $kinds));`], root);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exit(1);
}
process.stdout.write('generated arguments: TypeScript, Go, Rust and PHP report a request that does not match the declared types as an argument error of the language\n');
