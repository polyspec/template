#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { compileAst } from '../../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../../tools/compiler/compiler.mjs';
import { deriveTypeManifest } from '../../tools/compiler/type-manifest.mjs';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { firstDifference, listCases } from './cases.mjs';
import { root } from './drivers.mjs';

const goRoot = join(root, 'packages/template-go');
const temporary = mkdtempSync(join(goRoot, 'generated_conformance_'));
function errorObject(error) { return typeof error?.code === 'string' ? { code: error.code, template: error.template ?? 'input.tpl', line: error.line ?? 0, col: error.col ?? 0 } : null; }
function parsedTemplates(testCase) { const templates = new Map(), pending = [[testCase.dir, '']]; while (pending.length) { const [directory, prefix] = pending.pop(); for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name), name = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) pending.push([path, name]); else if (entry.isFile() && entry.name.endsWith('.tpl')) templates.set(name, parse(readFileSync(path), name, testCase.options)); } } return templates; }
const q = value => JSON.stringify(value);
const failures = [];
const runnable = [];
let passed = 0;
const cases = listCases(process.argv[2]);
if (process.argv[2] === undefined) assert.equal(cases.length, 211);
try {
  for (const testCase of cases) {
    try {
      const directory = join(temporary, `case_${testCase.id.replaceAll(/[^A-Za-z0-9]+/g, '_')}`);
      const defineText = testCase.hasDefine ? readFileSync(join(testCase.dir, 'define.json'), 'utf8') : '{}';
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), JSON.parse(defineText));
      const typePath = join(directory, 'types.json'), graphPath = join(directory, 'ast');
      mkdirSync(directory);
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(join(directory, 'generated.go'), compileSource(join(graphPath, 'manifest.json'), typePath, 'go'));
      const dataBase64 = (testCase.hasData ? readFileSync(join(testCase.dir, 'data.json')) : Buffer.from('{}')).toString('base64');
      const envText = testCase.hasEnv ? readFileSync(join(testCase.dir, 'env.json'), 'utf8') : '';
      const expectation = testCase.expectedError === null
        ? `if runErr != nil { t.Fatal(runErr) }; if actual != ${q(testCase.expectedHtml)} { t.Fatalf("generated output differs: %q", actual) }`
        : `_ = actual; assertGeneratedError(t, runErr, ${q(testCase.expectedError.code)}, ${q(testCase.expectedError.template)}, ${testCase.expectedError.line}, ${testCase.expectedError.col})`;
      writeFileSync(join(directory, 'generated_test.go'), `package generated
import ("encoding/base64"; "encoding/json"; "errors"; "testing"; template "github.com/polyspec/template"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/value")
func assertGeneratedError(t *testing.T, err error, code, name string, line, col int) { t.Helper(); if err == nil { t.Fatalf("expected %s", code) }; var te *errs.Error; if errors.As(err, &te) { if string(te.Code) != code || te.Template != name || te.Line != line || te.Col != col { t.Fatalf("expected %s %s:%d:%d, got %#v", code,name,line,col,te) }; return }; var be *value.BindError; if errors.As(err, &be) && string(be.Code) == code && name == "input.tpl" && line == 0 && col == 0 { return }; t.Fatalf("unexpected error: %T %v",err,err) }
func generatedDefinitions(t *testing.T) map[string]template.DefineInput { var raw map[string]json.RawMessage; if err:=json.Unmarshal([]byte(${q(defineText)}),&raw);err!=nil{t.Fatal(err)}; result:=map[string]template.DefineInput{}; for name,encoded:=range raw { var path string; if json.Unmarshal(encoded,&path)==nil { result[name]=template.DefineInput{Template:path}; continue }; var entry struct{Template string \`json:"template"\`;Data any \`json:"data"\`;HTML *string \`json:"html"\`}; if err:=json.Unmarshal(encoded,&entry);err!=nil{t.Fatal(err)};result[name]=template.DefineInput{Template:entry.Template,Data:entry.Data,HTML:entry.HTML} }; return result }
func TestGeneratedConformance(t *testing.T) { data,_:=base64.StdEncoding.DecodeString(${q(dataBase64)}); assign,runErr:=value.ParseJSON(data); options:=template.RenderOptions{Define:generatedDefinitions(t)}; ${envText ? `var env template.Env; if err:=json.Unmarshal([]byte(${q(envText)}),&env);err!=nil{t.Fatal(err)}; options.Env=&env;` : ''} var actual string; if runErr==nil { program,err:=NewGeneratedProgram(template.Options{});runErr=err;if runErr==nil{actual,runErr=program.Render("input.tpl",assign,options)} }; ${expectation} }
`);
      runnable.push(testCase);
    } catch (error) {
      const actual = errorObject(error);
      const difference = testCase.expectedError === null || actual === null ? 'unexpected compile failure' : firstDifference(testCase.expectedError, actual);
      if (difference) failures.push(`${testCase.id}: compile ${difference}: ${error.message}`); else passed++;
    }
  }
  if (runnable.length) {
    const relative = `./${basename(temporary)}/...`;
    const result = spawnSync('go', ['test', relative], { cwd: goRoot, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) failures.push(`generated Go execution failed:\n${result.stdout}${result.stderr}`); else passed += runnable.length;
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(`${passed}/${cases.length} Go generated conformance cases passed\n`);
process.exit(failures.length ? 1 : 0);
