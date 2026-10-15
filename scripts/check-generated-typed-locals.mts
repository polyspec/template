#!/usr/bin/env node
// Compiles tests/fixtures/typed-locals with its typed manifest in the TypeScript and Go backends and checks that a
// generated program decodes a value once, where it enters the program, and never on a read (T25.8): the local `title`
// holds the result of a host function, which the program decodes once, and the loop body reads it twice for each row
// of a typed list, which the program iterates as it is. The generated source reads no local from the render scope and
// decodes nothing but the result of the call. A host function that returns a value of another type fails with
// E_RUNTIME_TYPE at the call, with a message that names the expression of the call in the template.
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileAst } from '../packages/compiler/src/ast-artifact.mts';
import { compileSource } from '../packages/compiler/src/compiler.mts';
import { goString } from '../packages/compiler/src/backend-support.mts';
import { root } from '../tests/runner/drivers.mts';
import { goWorkspace, nodeWorkspace } from './temporary-workspace.mts';
import { checkLanguages } from './language-checks.mts';
import { tsc } from './tools.mts';

const fixture = join(root, 'tests/fixtures/typed-locals');
const types = join(fixture, 'types.json');
const expected = readFileSync(join(fixture, 'expected.html'), 'utf8');
// The workspaces of this check are directories of the system temporary directory, never of the checkout (T20.1).
const temporary = nodeWorkspace('generated-typed-locals');
const run = (command: string, args: string[], cwd: string): void => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}\n${result.stdout}${result.stderr}`);
};
/** The functions that render the templates of a generated source: each line from a line of `start` to the next function. */
const renderFunctions = (source: string, start: RegExp): string => {
  let inside = false;
  return source.split('\n').filter((line) => {
    if (start.test(line)) inside = true;
    else if (/^(?:function|func) /.test(line)) inside = false;
    return inside;
  }).join('\n');
};
const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

try {
  const graph = join(temporary, 'ast');
  compileAst({ root: fixture, output: graph, entry: 'input.tpl', refresh: 'dev', typeManifest: types });
  const graphManifest = join(graph, 'manifest.json');

  checkLanguages('generated typed locals', {
    TypeScript: () => {
      const source = compileSource(graphManifest, types, 'ts');
      const render = renderFunctions(source, /^function render_/);
      assert.equal(count(render, /scope\.lookup\(/g), 0, 'a read of a local reads the render scope');
      assert.equal(count(render, /generatedChecked\(/g), 1, 'the program decodes another value than the result of the call');
      assert.equal(count(render, /generatedEncodeList\(/g), 0, 'the loop encodes its typed list');
      const tsSource = join(temporary, 'typed.ts');
      writeFileSync(tsSource, source);
      run('node', [tsc, '--ignoreConfig', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', join(temporary, 'ts'), tsSource], root);
      const runner = join(temporary, 'typed.mjs');
      writeFileSync(runner, `import { GeneratedProgram } from './ts/typed.js';
import { RuntimeEnvironment, TemplateError } from '@polyspec/template';
const assign = { page: { title: 'T' }, rows: [{ name: 'a' }, { name: 'b' }] };
const runtime = new RuntimeEnvironment();
runtime.register('label', ([title]) => title + '!');
const actual = new GeneratedProgram(runtime).render('input.tpl', assign);
if (actual !== ${JSON.stringify(expected)}) throw new Error('TypeScript renders ' + JSON.stringify(actual));
const wrong = new RuntimeEnvironment();
wrong.register('label', () => 1);
let error = null;
try { new GeneratedProgram(wrong).render('input.tpl', assign); } catch (caught) { error = caught; }
if (!(error instanceof TemplateError) || error.code !== 'E_RUNTIME_TYPE' || error.line !== 1 || error.col !== 12 || error.message !== 'label(page.title) is not a string') {
  throw new Error('TypeScript fails with ' + JSON.stringify({ code: error?.code, line: error?.line, col: error?.col, message: error?.message }));
}
`);
      run(process.execPath, [runner], root);
    },
    Go: () => {
      const source = compileSource(graphManifest, types, 'go');
      const render = renderFunctions(source, /^func render_/);
      assert.equal(count(render, /scope\.Lookup\(/g), 0, 'a read of a local reads the render scope');
      assert.equal(count(render, /generatedResult\[/g), 0, 'the program decodes a local');
      assert.equal(count(render, /generatedListEntries\(/g), 1, 'the loop converts its typed list');
      const goDir = goWorkspace('generated-typed-locals-go');
      try {
        writeFileSync(join(goDir, 'generated.go'), source);
        writeFileSync(join(goDir, 'generated_test.go'), `package generated
import ("testing"; template "github.com/polyspec/template/packages/go"; "github.com/polyspec/template/packages/go/functions"; "github.com/polyspec/template/packages/go/value")
func TestGeneratedTypedLocals(t *testing.T) { program, err := NewGeneratedProgram(template.Options{}); if err != nil { t.Fatal(err) }; if err := program.Runtime.Register("label", func(args []value.Value, _ functions.Context) (any, error) { return args[0].(string) + "!", nil }); err != nil { t.Fatal(err) }; page := value.NewOrderedMap(); page.Set("title", "T"); first := value.NewOrderedMap(); first.Set("name", "a"); second := value.NewOrderedMap(); second.Set("name", "b"); assign := value.NewOrderedMap(); assign.Set("page", page); assign.Set("rows", value.List{first, second}); actual, err := program.Render("input.tpl", assign, template.RenderOptions{}); if err != nil || actual != ${goString(expected)} { t.Fatalf("generated Go typed locals = %q %v", actual, err) } }
`);
        run('go', ['test', '.'], goDir);
      } finally {
        rmSync(goDir, { recursive: true, force: true });
      }
    },
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('generated typed locals: TypeScript and Go decode each value once and name the expression of a failed value\n');
