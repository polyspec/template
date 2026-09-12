#!/usr/bin/env node
// Compiles each generated artifact as a package consumer and exercises its Program implementation.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(new URL('..', import.meta.url).pathname);
const generated = resolve(root, 'tools/showcase/adapters/generated/typed');
const scenarioRoot = resolve(root, 'examples/site/scenarios');
const temporary = mkdtempSync(join(root, '.tmp-generated-program-'));
const scenarios = ['compiler-coverage', 'empty-state', 'html-slot', 'react-boundary', 'scope-precedence'];

function generatedSource(id, language) {
  if (language === 'go') return join(root, 'tools/showcase/adapters/go/generated', id, 'generated.go');
  const extension = language === 'rust' ? 'rust' : language;
  return join(generated, `${id}.${extension}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw result.error ?? new Error(`${command} exited with ${result.status}`);
  }
  return result.stdout;
}

function fixture(id, name) {
  return readFileSync(join(scenarioRoot, id, name), 'utf8');
}

function fixtureExists(id, name) {
  try {
    fixture(id, name);
    return true;
  } catch {
    return false;
  }
}

function expected(id) {
  return fixture(id, 'expected.html');
}

function target(id) {
  return JSON.parse(fixture(id, 'scenario.json')).target;
}

function checkTypeScript() {
  const sources = scenarios.map(id => generatedSource(id, 'ts'));
  const coverageSource = readFileSync(sources[0], 'utf8');
  assert.match(coverageSource, /new RuntimeBindings\(context\)/);
  assert.match(coverageSource, /runtime\.binary\(/);
  assert.match(coverageSource, /runtime\.call\(/);
  for (const duplicate of ['generatedTruthy', 'generatedDefault', 'generatedIn', 'function stringify(', 'function escape(']) {
    assert.equal(coverageSource.includes(duplicate), false, `TypeScript generated source duplicates runtime semantics: ${duplicate}`);
  }
  run('npx', ['tsc', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', ...sources]);
  const output = join(temporary, 'typescript');
  mkdirSync(output);
  run('npx', ['tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', output, ...sources]);
  const imports = `import { RuntimeEnvironment } from '@polyspec/template';\n` + scenarios.map((id, index) => `import { GeneratedProgram as Program${index} } from './${id}.js';`).join('\n');
  const cases = scenarios.map((id, index) => `{
    const actual = new Program${index}().render(${JSON.stringify(target(id))}, ${fixture(id, 'data.json')}, { define: ${fixture(id, 'define.json')}${fixtureExists(id, 'env.json') ? `, env: ${fixture(id, 'env.json')}` : ''} });
    if (actual !== ${JSON.stringify(expected(id))}) throw new Error(${JSON.stringify(`${id}: TypeScript GeneratedProgram output differs`)});
  }`).join('\n');
  const runner = join(output, 'check.mjs');
  const limit = `{ let failed = false; try { new Program0(new RuntimeEnvironment({ outputBytes: 1 })).render(${JSON.stringify(target(scenarios[0]))}, ${fixture(scenarios[0], 'data.json')}, { define: ${fixture(scenarios[0], 'define.json')} }); } catch (error) { failed = error?.code === 'E_RUNTIME_LIMIT' && error?.line > 0 && error?.col > 0; } if (!failed) throw new Error('TypeScript generated output limit did not preserve a positioned template error'); }`;
  writeFileSync(runner, `${imports}\n${cases}\n${limit}\n`);
  run(process.execPath, [runner]);
}

function checkGo() {
  for (const id of scenarios) {
    const directory = join(root, 'packages/template-go', `.generated-check-${id}`);
    mkdirSync(directory);
    try {
      copyFileSync(generatedSource(id, 'go'), join(directory, 'generated.go'));
      writeFileSync(join(directory, 'generated_test.go'), `package generated
import (
  "encoding/json"
  "os"
  "testing"
  template "github.com/polyspec/template"
  "github.com/polyspec/template/value"
)
func TestGeneratedProgram(t *testing.T) {
  assignBytes, err := os.ReadFile(${JSON.stringify(join(scenarioRoot, id, 'data.json'))}); if err != nil { t.Fatal(err) }
  assign, err := value.ParseJSON(assignBytes); if err != nil { t.Fatal(err) }
  defineBytes, err := os.ReadFile(${JSON.stringify(join(scenarioRoot, id, 'define.json'))}); if err != nil { t.Fatal(err) }
  var raw map[string]json.RawMessage
  if err := json.Unmarshal(defineBytes, &raw); err != nil { t.Fatal(err) }
  definitions := map[string]template.DefineInput{}
  for name, encoded := range raw {
    var path string
    if err := json.Unmarshal(encoded, &path); err == nil { definitions[name] = template.DefineInput{Template: path}; continue }
    var entry struct { Template string \`json:"template"\`; Data any \`json:"data"\`; HTML *string \`json:"html"\` }
    if err := json.Unmarshal(encoded, &entry); err != nil { t.Fatal(err) }
    definitions[name] = template.DefineInput{Template: entry.Template, Data: entry.Data, HTML: entry.HTML}
  }
  options := template.RenderOptions{Define: definitions}
  ${fixtureExists(id, 'env.json') ? `envBytes, err := os.ReadFile(${JSON.stringify(join(scenarioRoot, id, 'env.json'))}); if err != nil { t.Fatal(err) }; var env template.Env; if err := json.Unmarshal(envBytes, &env); err != nil { t.Fatal(err) }; options.Env = &env` : ''}
  program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }
  actual, err := program.Render(${JSON.stringify(target(id))}, assign, options); if err != nil { t.Fatal(err) }
  if actual != ${JSON.stringify(expected(id))} { t.Fatalf("generated output differs: %q", actual) }
}
`);
      run('go', ['test', '.'], { cwd: directory });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function checkRust() {
  const test = join(root, 'packages/template-rust/tests/generated_program_check.rs');
  const modules = scenarios.map((id, index) => `mod generated_${index} {
    include!(${JSON.stringify(generatedSource(id, 'rust'))});
    pub fn execute(target: &str, assign: serde_json::Value, options: polyspec_template::RenderOptions) -> String {
        use polyspec_template::Program;
        let program = GeneratedProgram::new(polyspec_template::RuntimeEnvironment::new(None, std::collections::HashMap::new()));
        program.render(polyspec_template::RenderTarget::Name(target), &assign, &options).unwrap()
    }
}`).join('\n');
  const cases = scenarios.map((id, index) => `#[test]
fn generated_${index}_matches() {
    let assign = serde_json::from_str(${JSON.stringify(fixture(id, 'data.json'))}).unwrap();
    let define: std::collections::HashMap<String, serde_json::Value> = serde_json::from_str(${JSON.stringify(fixture(id, 'define.json'))}).unwrap();
    let mut options = polyspec_template::RenderOptions::default();
    for (name, entry) in define {
        if let Some(path) = entry.as_str() {
            options.define.insert(name, polyspec_template::DefineInput { template: Some(path.to_string()), data: None, html: None });
        } else {
            options.define.insert(name, polyspec_template::DefineInput {
                template: entry.get("template").and_then(serde_json::Value::as_str).map(str::to_string),
                data: entry.get("data").cloned(),
                html: entry.get("html").and_then(serde_json::Value::as_str).map(str::to_string),
            });
        }
    }
    ${fixtureExists(id, 'env.json') ? `options.env = Some(serde_json::from_str(${JSON.stringify(fixture(id, 'env.json'))}).unwrap());` : ''}
    assert_eq!(generated_${index}::execute(${JSON.stringify(target(id))}, assign, options), ${JSON.stringify(expected(id))});
}`).join('\n');
  writeFileSync(test, `${modules}\n${cases}\n`);
  try {
    run(resolve(process.env.HOME, '.cargo/bin/cargo'), ['test', '--locked', '--manifest-path', join(root, 'packages/template-rust/Cargo.toml'), '--test', 'generated_program_check']);
  } finally {
    rmSync(test);
  }
}

function checkPhp() {
  const autoload = join(root, 'packages/template-php/vendor/autoload.php');
  const coverageSource = readFileSync(generatedSource(scenarios[0], 'php'), 'utf8');
  assert.match(coverageSource, /new RuntimeBindings\(\$context\)/);
  assert.match(coverageSource, /\$runtime->binary\(/);
  assert.match(coverageSource, /\$runtime->call\(/);
  for (const duplicate of ['generated_truthy', 'generated_default', 'generated_in', 'generated_escape', 'generated_index', 'generated_entries']) {
    assert.equal(coverageSource.includes(duplicate), false, `PHP generated source duplicates runtime semantics: ${duplicate}`);
  }
  for (const id of scenarios) {
    const limit = id === scenarios[0] ? ` $limited = new GeneratedProgram(new Polyspec\\Template\\Render\\RuntimeEnvironment(['outputBytes' => 1])); $failed = false; try { $limited->render(${JSON.stringify(target(id))}, $assign, $options); } catch (Polyspec\\Template\\TemplateError $error) { $failed = $error->errorCode === 'E_RUNTIME_LIMIT' && $error->errorLine > 0 && $error->errorCol > 0; } if (!$failed) throw new RuntimeException('PHP generated output limit did not preserve a positioned template error');` : '';
    const probe = `require ${JSON.stringify(autoload)}; require ${JSON.stringify(generatedSource(id, 'php'))}; $assign = Polyspec\\Template\\Value\\Json::parse(file_get_contents(${JSON.stringify(join(scenarioRoot, id, 'data.json'))})); $defineValue = Polyspec\\Template\\Value\\Json::parse(file_get_contents(${JSON.stringify(join(scenarioRoot, id, 'define.json'))})); $define = []; foreach ($defineValue->entries() as $name => $entry) $define[$name] = $entry; $options = ['define' => $define]; ${fixtureExists(id, 'env.json') ? `$options['env'] = json_decode(file_get_contents(${JSON.stringify(join(scenarioRoot, id, 'env.json'))}), true, flags: JSON_THROW_ON_ERROR);` : ''} $actual = (new GeneratedProgram())->render(${JSON.stringify(target(id))}, $assign, $options); if ($actual !== ${JSON.stringify(expected(id))}) throw new RuntimeException(${JSON.stringify(`${id}: PHP GeneratedProgram output differs`)});${limit}`;
    run('php', ['-l', join(generated, `${id}.php`)]);
    run('php', ['-r', probe]);
  }
}

try {
  checkTypeScript();
  checkGo();
  checkRust();
  checkPhp();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('compiler: TypeScript, Go, Rust and PHP GeneratedProgram implementations rendered all five scenarios identically\n');
