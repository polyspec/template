#!/usr/bin/env node
// Compiles tests/fixtures/bound-data with its typed manifest in every generated backend and checks
// that the generated program renders a bound map (VAL-22) as assign and as definition data with the
// bytes of the host map (RT-61). The root is typed, so the program converts a bound assign to its
// root record and bound definition data to the data record of `part` (RT-68).
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileFiles, compileSource } from '../packages/compiler/src/compiler.mts';
import { phpProgramAutoload, writePhpProgram } from './php-program.mts';
import { goString, phpString, rustString } from '../packages/compiler/src/backend-support.mts';
import { root } from '../tests/runner/drivers.mts';
import { CARGO, goWorkspace, nodeWorkspace, runChecked, runPythonCheck, rustWorkspace } from './temporary-workspace.mts';
import { compileFixtureGraph } from './fixture-graph.mts';
import { checkLanguages } from './language-checks.mts';
import { boundDataCasesDocument } from './fixture-documents.mts';
import { tsc } from './tools.mts';

const fixture = join(root, 'tests/fixtures/bound-data');
const cases = boundDataCasesDocument.read(join(fixture, 'cases.json'));
// The workspaces of this check are directories of the system temporary directory, never of the checkout (T20.1).
const temporary = nodeWorkspace('generated-bound-data');
const json = (value: unknown): string => JSON.stringify(value);

try {
  const types = join(fixture, 'types.json');
  const graphManifest = compileFixtureGraph(temporary, fixture, 'page.tpl', types);
  const source = (language: string, options?: object): string => compileSource(graphManifest, types, language, options);
  const files = (language: string, options?: object) => compileFiles(graphManifest, types, language, options);

  checkLanguages('generated bound data', {
    TypeScript: () => {
      // TypeScript.
      writeFileSync(join(temporary, 'bound.ts'), source('ts'));
      runChecked('node', [tsc, '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', join(temporary, 'ts'), join(temporary, 'bound.ts')], root);
      const tsRunner = join(temporary, 'bound.mjs');
      writeFileSync(tsRunner, `import { GeneratedProgram } from './ts/bound.js';
import { RuntimeEnvironment, bind, merge } from '@polyspec/template';
const cases = ${json(cases)};
const check = (actual, expected, label) => { if (actual !== expected) throw new Error('TypeScript generated ' + label + ': ' + JSON.stringify(actual)); };
const program = new GeneratedProgram(new RuntimeEnvironment());
check(program.render('page.tpl', bind(cases.assign)), cases.outputs.page, 'bound assign');
check(program.render('page.tpl', cases.assign), cases.outputs.page, 'host assign');
const prepared = program.prepare('page.tpl', bind(cases.assign));
check(prepared.render() + prepared.render(), cases.outputs.page + cases.outputs.page, 'prepared bound assign');
check(program.render('page.tpl', merge(bind(cases.assign), bind(cases.second))), cases.outputs.merged, 'merged assign');
check(program.render('define.tpl', cases.assign, { define: { part: { template: 'part.tpl', data: bind(cases.definitionData) } } }), cases.outputs.define, 'bound definition data');
`);
      runChecked(process.execPath, [tsRunner], root);
    },
    Go: () => {
      // Go.
      const goDir = goWorkspace('generated-bound-data-go');
      try {
        writeFileSync(join(goDir, 'generated.go'), source('go'));
        const goHeader = `package generated
import ("testing"; template "github.com/polyspec/template/packages/go")
func fixture(t *testing.T, text string) template.Value { t.Helper(); parsed, err := template.ParseJSON([]byte(text)); if err != nil { t.Fatal(err) }; return parsed }
func bound(t *testing.T, text string) template.BoundMap { t.Helper(); result, err := template.Bind(fixture(t, text)); if err != nil { t.Fatal(err) }; return result }
`;
        writeFileSync(join(goDir, 'bound_test.go'), `${goHeader}
func TestGeneratedBoundAssign(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }
  check := func(assign any, expected, label string) { t.Helper(); actual, err := program.Render("page.tpl", assign, template.RenderOptions{}); if err != nil || actual != expected { t.Fatalf("%s: %q %v", label, actual, err) } }
  check(bound(t, ${goString(json(cases.assign))}), ${goString(cases.outputs.page)}, "bound assign")
  check(fixture(t, ${goString(json(cases.assign))}), ${goString(cases.outputs.page)}, "host assign")
  check(template.Merge(bound(t, ${goString(json(cases.assign))}), bound(t, ${goString(json(cases.second))})), ${goString(cases.outputs.merged)}, "merged assign") }
`);
        writeFileSync(join(goDir, 'definition_test.go'), `package generated
import ("testing"; template "github.com/polyspec/template/packages/go")
func TestGeneratedBoundDefinitionData(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }
  options := template.RenderOptions{Define: map[string]template.DefineInput{"part": {Template: "part.tpl", Data: bound(t, ${goString(json(cases.definitionData))})}}}
  actual, err := program.Render("define.tpl", fixture(t, ${goString(json(cases.assign))}), options); if err != nil || actual != ${goString(cases.outputs.define)} { t.Fatalf("bound definition data: %q %v", actual, err) } }
`);
        runChecked('go', ['test', '.'], goDir);
      } finally {
        rmSync(goDir, { recursive: true, force: true });
      }
    },
    Rust: () => {
      // Rust.
      writeFileSync(join(temporary, 'bound.rust'), source('rust'));
      const rust = rustWorkspace('generated-bound-data-rust');
      const rustTest = rust.test('generated_bound_data_check');
      writeFileSync(rustTest, `mod generated { include!(${rustString(join(temporary, 'bound.rust'))}); }
use polyspec_template::{DefineData, DefineInput, Program, RenderOptions, RenderTarget, RuntimeEnvironment, bind, merge};
fn fixture(text: &str) -> serde_json::Value { serde_json::from_str(text).unwrap() }
#[test] fn generated_programs_render_bound_maps() {
  let page = generated::GeneratedProgram::new(RuntimeEnvironment::new(None, std::collections::HashMap::new()).expect("an empty function map registers"));
  let assign = fixture(${rustString(json(cases.assign))});
  let bound = bind(&assign).unwrap();
  let options = RenderOptions::default();
  assert_eq!(page.render_bound(RenderTarget::Name("page.tpl"), &bound, &options).unwrap(), ${rustString(cases.outputs.page)});
  assert_eq!(page.render(RenderTarget::Name("page.tpl"), &assign, &options).unwrap(), ${rustString(cases.outputs.page)});
  let prepared = page.prepare_bound(RenderTarget::Name("page.tpl"), &bound, &options).unwrap();
  assert_eq!(prepared.render().unwrap() + &prepared.render().unwrap(), ${rustString(cases.outputs.page + cases.outputs.page)});
  let merged = merge(&bound, &bind(&fixture(${rustString(json(cases.second))})).unwrap());
  assert_eq!(page.render_bound(RenderTarget::Name("page.tpl"), &merged, &options).unwrap(), ${rustString(cases.outputs.merged)});
  let mut options = RenderOptions::default();
  options.define.insert("part".to_string(), DefineInput { template: Some("part.tpl".to_string()), data: Some(DefineData::Bound(bind(&fixture(${rustString(json(cases.definitionData))})).unwrap())), html: None });
  assert_eq!(page.render(RenderTarget::Name("define.tpl"), &assign, &options).unwrap(), ${rustString(cases.outputs.define)});
}
`);
      try {
        runChecked(CARGO, ['test', '--locked', '--offline', '--manifest-path', rust.manifest, '--test', 'generated_bound_data_check'], root, { CARGO_TARGET_DIR: rust.targetDirectory, RUSTFLAGS: '-Dwarnings -Adead-code' });
      } finally {
        rmSync(rust.directory, { recursive: true, force: true });
      }
    },
    PHP: () => {
      // PHP.
      const phpNamespace = 'Polyspec\\Generated\\BoundData';
      writePhpProgram(join(temporary, 'php'), files('php', { phpNamespace }));
      runChecked('php', ['-r', `${phpProgramAutoload(phpString(join(root, 'vendor/autoload.php')), phpNamespace, phpString(join(temporary, 'php')))}
use Polyspec\\Template\\BoundMap;
$cases = json_decode(${phpString(json(cases))}, true, flags: JSON_THROW_ON_ERROR);
$check = static function (string $actual, string $expected, string $label): void { if ($actual !== $expected) throw new RuntimeException('PHP generated ' . $label . ': ' . $actual); };
$program = new \\${phpNamespace}\\GeneratedProgram(new Polyspec\\Template\\Render\\RuntimeEnvironment());
$check($program->render('page.tpl', BoundMap::bind($cases['assign'])), $cases['outputs']['page'], 'bound assign');
$check($program->render('page.tpl', $cases['assign']), $cases['outputs']['page'], 'host assign');
$check($program->render('page.tpl', BoundMap::merge(BoundMap::bind($cases['assign']), BoundMap::bind($cases['second']))), $cases['outputs']['merged'], 'merged assign');
$check($program->render('define.tpl', $cases['assign'], ['define' => ['part' => ['template' => 'part.tpl', 'data' => BoundMap::bind($cases['definitionData'])]]]), $cases['outputs']['define'], 'bound definition data');`], root);
    },
    Python: () => {
      // Python: bind and merge of the package build the bound maps (VAL-22).
      runPythonCheck(temporary, {
        'generated.py': source('python'),
        'cases.json': json(cases),
        'check.py': `import json
import sys
from polyspec.template import Engine, RenderOptions, RuntimeEnvironment, bind, merge
from generated import GeneratedProgram

with open('cases.json', encoding='utf-8') as handle:
    cases = json.load(handle)


def check(actual, expected, label):
    if actual != expected:
        sys.exit('Python generated ' + label + ': ' + repr(actual))


program = Engine(GeneratedProgram(RuntimeEnvironment()))
check(program.render('page.tpl', bind(cases['assign'])), cases['outputs']['page'], 'bound assign')
check(program.render('page.tpl', cases['assign']), cases['outputs']['page'], 'host assign')
prepared = program.prepare('page.tpl', bind(cases['assign']))
check(prepared.render() + prepared.render(), cases['outputs']['page'] * 2, 'prepared bound assign')
check(program.render('page.tpl', merge(bind(cases['assign']), bind(cases['second']))), cases['outputs']['merged'], 'merged assign')
definition = RenderOptions(define={'part': {'template': 'part.tpl', 'data': bind(cases['definitionData'])}})
check(program.render('define.tpl', cases['assign'], definition), cases['outputs']['define'], 'bound definition data')
`,
      });
    },
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('generated bound data: TypeScript, Go, Rust, PHP and Python generated programs rendered bound maps with the bytes of the host maps\n');
