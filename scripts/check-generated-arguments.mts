#!/usr/bin/env node
// Compiles the programs of tests/fixtures/typed-arguments and tests/fixtures/typed-arguments-unread with their typed
// manifests in every generated backend, renders the requests of messages.json of each, and checks the result of every
// request in every target: the output of a request that matches the declared types, and for any other request the
// argument error of the host language with the exact text that ERR-13 defines (T24.33). The argument error passes to the
// host unchanged and is not an ERR-1 error: an `Error` of TypeScript that is not a `TemplateError` or a built-in
// subclass, a Go error that is not an `*errs.Error` or a bind error, `RequestError::Argument` of Rust,
// `\InvalidArgumentException` of PHP and `ValueError` of Python. typed-arguments-unread declares a root record field and
// a list that no template reads and definition data that no block merges, which generated Rust checks without holding
// them (T24.31).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { compileAst } from '../packages/compiler/src/ast-artifact.mts';
import { compileFiles, compileSource } from '../packages/compiler/src/compiler.mts';
import { phpProgramAutoload, writePhpProgram } from './php-program.mts';
import { goString, phpString, rustString } from '../packages/compiler/src/backend-support.mts';
import { root } from '../tests/runner/drivers.mts';
import { CARGO, goWorkspace, nodeWorkspace, rustWorkspace } from './temporary-workspace.mts';
import { jsonDocument } from './json-document.mts';
import { checkLanguages } from './language-checks.mts';
import { pythonEnvironment, pythonPackageCommand } from './python-toolchain.mts';
import { tsc } from './tools.mts';

/** A request of messages.json and its result: `rendered: <output>` or `argument: <message>`. */
interface Vector { assign: Record<string, unknown>; define: Record<string, unknown>; result: string }
const vectorsDocument = jsonDocument<Vector[]>('list of requests', {
  type: 'array',
  items: { type: 'object', required: ['assign', 'define', 'result'], properties: { assign: { type: 'object' }, define: { type: 'object' }, result: { type: 'string' } } },
});

const fixtures = ['typed-arguments', 'typed-arguments-unread'].map(name => {
  const directory = join(root, 'tests/fixtures', name);
  const vectors = vectorsDocument.read(join(directory, 'messages.json'));
  if (vectors.length === 0) throw new Error(`${name}/messages.json holds no request`);
  return { name, id: name.replaceAll('-', '_'), directory, types: join(directory, 'types.json'), vectorsPath: join(directory, 'messages.json'), vectors };
});
// The workspaces of this check are directories of the system temporary directory, never of the checkout (T20.1).
const temporary = nodeWorkspace('generated-arguments');
const run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}\n${result.stdout}${result.stderr}`);
  return result.stdout;
};
const graphs = new Map(fixtures.map(fixture => {
  const graph = join(temporary, `${fixture.id}-ast`);
  compileAst({ root: fixture.directory, output: graph, entry: 'input.tpl', refresh: 'dev', typeManifest: fixture.types });
  return [fixture.name, join(graph, 'manifest.json')];
}));
const graphOf = (name: string): string => {
  const graph = graphs.get(name);
  if (graph === undefined) throw new Error(`no graph of ${name}`);
  return graph;
};

/** Compares the results that a target printed, one JSON array per fixture after the marker of the fixture, with messages.json. */
function compare(language: string, output: string): void {
  for (const fixture of fixtures) {
    const line = output.split('\n').find(text => text.startsWith(`${fixture.name} `));
    if (line === undefined) throw new Error(`${language} printed no results of ${fixture.name}\n${output}`);
    const actual: unknown = JSON.parse(line.slice(fixture.name.length + 1));
    assert.deepEqual(actual, fixture.vectors.map(vector => vector.result), `${language}: the results of ${fixture.name}/messages.json`);
  }
}

try {
  checkLanguages('generated arguments', {
    TypeScript: () => {
      const lines = fixtures.map(fixture => {
        const source = join(temporary, `${fixture.id}.ts`);
        writeFileSync(source, compileSource(graphOf(fixture.name), fixture.types, 'ts'));
        return fixture;
      });
      run('node', [tsc, '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', join(temporary, 'ts'), ...lines.map(fixture => join(temporary, `${fixture.id}.ts`))], root);
      const runner = join(temporary, 'arguments.mjs');
      writeFileSync(runner, `import { readFileSync } from 'node:fs';
import { RuntimeEnvironment, TemplateError } from '@polyspec/template';
${fixtures.map(fixture => `import { GeneratedProgram as ${fixture.id} } from './ts/${fixture.id}.js';`).join('\n')}
const result = (request) => { try { return 'rendered: ' + request(); } catch (error) { if (error instanceof TemplateError) return 'template: ' + error.code; return Object.getPrototypeOf(error) === Error.prototype ? 'argument: ' + error.message : 'other ' + error?.constructor?.name + ': ' + error?.message; } };
${fixtures.map(fixture => `{ const program = new ${fixture.id}(new RuntimeEnvironment()); const vectors = JSON.parse(readFileSync(${JSON.stringify(fixture.vectorsPath)}, 'utf8')); console.log(${JSON.stringify(fixture.name)} + ' ' + JSON.stringify(vectors.map(vector => result(() => program.render('input.tpl', vector.assign, { define: vector.define }))))); }`).join('\n')}
`);
      compare('TypeScript', run(process.execPath, [runner], root));
    },
    Go: () => {
      const output = fixtures.map(fixture => {
        const goDir = goWorkspace(`generated-arguments-go-${fixture.id}`);
        try {
          writeFileSync(join(goDir, 'generated.go'), compileSource(graphOf(fixture.name), fixture.types, 'go'));
          writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("encoding/json"; "errors"; "fmt"; "os"; "testing"; template "github.com/polyspec/template/packages/go"; "github.com/polyspec/template/packages/go/errs"; "github.com/polyspec/template/packages/go/render"; "github.com/polyspec/template/packages/go/value")
type vector struct { Assign json.RawMessage \`json:"assign"\`; Define map[string]struct { Template *string \`json:"template"\`; HTML *string \`json:"html"\`; Data json.RawMessage \`json:"data"\` } \`json:"define"\` }
func result(output string, err error) string { if err == nil { return "rendered: " + output }; var te *errs.Error; if errors.As(err, &te) { return "template: " + string(te.Code) }; var be *value.BindError; if errors.As(err, &be) { return "bind: " + be.Error() }; return "argument: " + err.Error() }
func TestGeneratedArguments(t *testing.T) { text, err := os.ReadFile(${goString(fixture.vectorsPath)}); if err != nil { t.Fatal(err) }; var vectors []vector; if err := json.Unmarshal(text, &vectors); err != nil { t.Fatal(err) }; program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; results := []string{}; for _, item := range vectors { assign, err := value.ParseJSON(item.Assign); if err != nil { t.Fatal(err) }; define := map[string]render.DefineInput{}; for id, entry := range item.Define { input := render.DefineInput{HTML: entry.HTML}; if entry.Template != nil { input.Template = *entry.Template }; if entry.Data != nil { data, err := value.ParseJSON(entry.Data); if err != nil { t.Fatal(err) }; input.Data = data }; define[id] = input }; results = append(results, result(program.Render("input.tpl", assign, template.RenderOptions{Define: define}))) }; encoded, _ := json.Marshal(results); fmt.Println(${goString(fixture.name)} + " " + string(encoded)) }
`);
          return run('go', ['test', '-v', '-count=1', '.'], goDir);
        } finally {
          rmSync(goDir, { recursive: true, force: true });
        }
      }).join('\n');
      compare('Go', output);
    },
    Rust: () => {
      const rust = rustWorkspace('generated-arguments-rust');
      const rustTest = rust.test('generated_arguments_check');
      const modules = fixtures.map(fixture => {
        const source = join(temporary, `${fixture.id}.rust`);
        writeFileSync(source, compileSource(graphOf(fixture.name), fixture.types, 'rust'));
        return `mod ${fixture.id} { include!(${rustString(source)}); }`;
      }).join('\n');
      writeFileSync(rustTest, `${modules}
use polyspec_template::{Program, RenderOptions, RenderTarget, RequestError, RuntimeEnvironment, defines_from_json};
fn result(rendered: Result<String, RequestError>) -> String { match rendered { Ok(output) => format!("rendered: {output}"), Err(RequestError::Argument(error)) => format!("argument: {}", error.message), Err(RequestError::Template(error)) => format!("template: {}", error.code.as_str()) } }
fn results(path: &str, render: impl Fn(&serde_json::Value, &RenderOptions) -> Result<String, RequestError>) -> String { let vectors: Vec<serde_json::Value> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(); let all: Vec<String> = vectors.iter().map(|vector| { let mut options = RenderOptions::default(); options.define = defines_from_json(&vector["define"]).unwrap(); result(render(&vector["assign"], &options)) }).collect(); serde_json::to_string(&all).unwrap() }
#[test] fn generated_arguments() { ${fixtures.map(fixture => `let program = ${fixture.id}::GeneratedProgram::new(RuntimeEnvironment::new(None, std::collections::HashMap::new())); println!("${fixture.name} {}", results(${rustString(fixture.vectorsPath)}, |assign, options| program.render(RenderTarget::Name("input.tpl"), assign, options)));`).join(' ')} }
`);
      try {
        compare('Rust', run(CARGO, ['test', '--locked', '--offline', '--manifest-path', rust.manifest, '--test', 'generated_arguments_check', '--', '--nocapture'], root, { CARGO_TARGET_DIR: rust.targetDirectory, RUSTFLAGS: '-Dwarnings -Adead-code' }));
      } finally {
        rmSync(rust.directory, { recursive: true, force: true });
      }
    },
    PHP: () => {
      const output = fixtures.map(fixture => {
        const phpNamespace = `Polyspec\\Generated\\${fixture.id === 'typed_arguments' ? 'TypedArguments' : 'TypedArgumentsUnread'}`;
        const phpDirectory = join(temporary, `${fixture.id}-php`);
        writePhpProgram(phpDirectory, compileFiles(graphOf(fixture.name), fixture.types, 'php', { phpNamespace }));
        return run('php', ['-r', `${phpProgramAutoload(phpString(join(root, 'vendor/autoload.php')), phpNamespace, phpString(phpDirectory))} $program = new \\${phpNamespace}\\GeneratedProgram(new Polyspec\\Template\\Render\\RuntimeEnvironment()); $result = static function (callable $request): string { try { return 'rendered: ' . $request(); } catch (Polyspec\\Template\\TemplateError $error) { return 'template: ' . $error->errorCode . ' ' . $error->getMessage(); } catch (InvalidArgumentException $error) { return 'argument: ' . $error->getMessage(); } catch (Throwable $error) { return 'other ' . $error::class . ': ' . $error->getMessage(); } }; $vectors = json_decode(file_get_contents(${phpString(fixture.vectorsPath)}), true, 512, JSON_THROW_ON_ERROR); echo ${phpString(fixture.name)}, ' ', json_encode(array_map(static fn (array $vector): string => $result(static fn () => $program->render('input.tpl', $vector['assign'], ['define' => $vector['define']])), $vectors), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\\n";`], root);
      }).join('\n');
      compare('PHP', output);
    },
    Python: () => {
      const pythonDir = join(temporary, 'python');
      mkdirSync(pythonDir);
      for (const fixture of fixtures) writeFileSync(join(pythonDir, `${fixture.id}.py`), compileSource(graphOf(fixture.name), fixture.types, 'python'));
      writeFileSync(join(pythonDir, 'check.py'), `import json
from polyspec.template import Engine, RenderOptions, RuntimeEnvironment, TemplateError
${fixtures.map(fixture => `import ${fixture.id}`).join('\n')}


def result(request):
    try:
        return 'rendered: ' + request()
    except TemplateError as error:
        return 'template: ' + error.code
    except ValueError as error:
        return 'argument: ' + str(error)
    except Exception as error:  # noqa: BLE001  any other exception names its class in the failure
        return 'other ' + type(error).__name__ + ': ' + str(error)


for name, module, path in [${fixtures.map(fixture => `(${JSON.stringify(fixture.name)}, ${fixture.id}, ${JSON.stringify(fixture.vectorsPath)})`).join(', ')}]:
    program = Engine(module.GeneratedProgram(RuntimeEnvironment()))
    with open(path, encoding='utf-8') as handle:
        vectors = json.load(handle)
    results = [result(lambda vector=vector: program.render('input.tpl', vector['assign'], RenderOptions(define=vector['define']))) for vector in vectors]
    print(name, json.dumps(results, ensure_ascii=False))
`);
      compare('Python', run(pythonPackageCommand(), ['check.py'], pythonDir, pythonEnvironment()));
    },
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('generated arguments: TypeScript, Go, Rust, PHP and Python render the requests of messages.json with the results and argument error messages of ERR-13\n');
