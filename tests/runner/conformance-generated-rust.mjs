#!/usr/bin/env node
// Rust generated conformance: compiles every case into a module of one integration test file whose
// tests are named after the cases, and runs it with scripts/run-tests.mjs, which prints each case
// test with its elapsed time and stops a test that outlives its own timeout.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileAst } from '../../packages/template-compiler/ast-artifact.mjs';
import { rustString } from '../../packages/template-compiler/backend-support.mjs';
import { compileSource } from '../../packages/template-compiler/compiler.mjs';
import { deriveTypeManifest } from '../../packages/template-compiler/type-manifest.mjs';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { caseTestFailures, firstDifference, generatedCases, runCaseTests, typeDefinitions } from './cases.mjs';
import { stepProgress } from './bounded.mjs';
import { root } from './drivers.mjs';
import { rustWorkspace } from '../../scripts/temporary-workspace.mjs';

// The time limit of one generated case test.
const CASE_TIMEOUT_SECONDS = 30;

// A crate of the system temporary directory that depends on packages/template-rust; it holds the generated cases and
// their integration test.
const workspace = rustWorkspace('generated-conformance-rust');
const temporary = workspace.directory;
const integrationTest = workspace.test('generated_conformance_check');
// Paths and expected output are embedded as exact Rust string literals.
const quote = rustString;

function errorObject(error) {
  if (typeof error?.code !== 'string') return null;
  return { code: error.code, template: error.template ?? 'input.tpl', line: error.line ?? 0, col: error.col ?? 0 };
}

function parsedTemplates(testCase) {
  const templates = new Map();
  const pending = [[testCase.dir, '']];
  while (pending.length > 0) {
    const [directory, prefix] = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) pending.push([path, name]);
      else if (entry.isFile() && entry.name.endsWith('.tpl')) templates.set(name, parse(readFileSync(path), name, testCase.options));
    }
  }
  return templates;
}

const failures = [];
const runnable = [];
let compilePassed = 0;
// The cases whose generated test passed.
let executed = 0;
const { cases } = generatedCases(process.argv.slice(2));
const progress = stepProgress();
// The module and the test of a case are named after its id.
const names = new Map();
function caseName(testCase) {
  const name = `case_${testCase.id.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`;
  if (names.has(name) && names.get(name) !== testCase.id) throw new Error(`${testCase.id} and ${names.get(name)} have the same Rust name ${name}`);
  names.set(name, testCase.id);
  return name;
}

try {
  for (const testCase of cases) {
    const step = `${testCase.id} › compile`;
    progress.start(step);
    try {
      const name = caseName(testCase);
      const directory = join(temporary, name);
      mkdirSync(directory);
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), typeDefinitions(testCase));
      const typePath = join(directory, 'types.json');
      const graphPath = join(directory, 'ast');
      const sourcePath = join(directory, 'generated.rs');
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'rust'));
      runnable.push({ testCase, sourcePath, name });
      progress.pass(step);
    } catch (error) {
      const actual = errorObject(error);
      const difference = testCase.expectedError === null || actual === null ? 'unexpected compile failure' : firstDifference(testCase.expectedError, actual);
      if (difference) { failures.push(`${testCase.id}: compile ${difference}: ${error.message}`); progress.fail(step, undefined, difference); }
      else { compilePassed++; progress.pass(step); }
    }
  }
  progress.close('Rust generated conformance compile');

  const modules = runnable.map(({ testCase, sourcePath, name }) => {
    const data = testCase.hasData ? `include_bytes!(${quote(resolve(join(testCase.dir, 'data.json')))})` : 'b"{}"';
    return `#[allow(dead_code, unused_imports, unused_variables)]
mod ${name} {
    include!(${quote(resolve(sourcePath))});
    pub fn execute() -> Result<String, super::ActualError> {
        use polyspec_template::Program;
        let data = ${data};
        let text = std::str::from_utf8(data).map_err(|_| super::ActualError::data("E_DATA_INVALID_UTF8"))?;
        let assign = polyspec_template::read_json(text).map_err(super::ActualError::bind)?;
        let mut options = polyspec_template::RenderOptions::default();
        ${testCase.hasDefine ? `let define = polyspec_template::read_json(include_str!(${quote(resolve(join(testCase.dir, 'define.json')))})).map_err(super::ActualError::bind)?;
        options.define = polyspec_template::defines_from_json(&define).map_err(super::ActualError::bind)?;` : ''}
        ${testCase.hasEnv ? `let env = polyspec_template::read_json(include_str!(${quote(resolve(join(testCase.dir, 'env.json')))})).map_err(super::ActualError::bind)?;
        options.env = Some(polyspec_template::env_from_json(&env).map_err(super::ActualError::bind)?);` : ''}
        let program = GeneratedProgram::new(polyspec_template::RuntimeEnvironment::new(None, std::collections::HashMap::new()));
        program.render(polyspec_template::RenderTarget::Name("input.tpl"), &assign, &options).map_err(super::ActualError::request)
    }
}`;
  }).join('\n');

  const tests = runnable.map(({ testCase, name }) => testCase.expectedError === null
    ? `#[test]
fn ${name}() { assert_eq!(${name}::execute().unwrap(), ${quote(testCase.expectedHtml)}); }`
    : `#[test]
fn ${name}() { let actual = ${name}::execute().unwrap_err(); assert_eq!(actual, ActualError { code: ${quote(testCase.expectedError.code)}.to_string(), template: ${quote(testCase.expectedError.template)}.to_string(), line: ${testCase.expectedError.line}, col: ${testCase.expectedError.col} }); }`).join('\n');

  writeFileSync(integrationTest, `#[derive(Debug, PartialEq)]
struct ActualError { code: String, template: String, line: usize, col: usize }
impl ActualError {
    fn data(code: &str) -> Self { Self { code: code.to_string(), template: "input.tpl".to_string(), line: 0, col: 0 } }
    fn bind(error: polyspec_template::BindError) -> Self { Self::data(error.code.as_str()) }
    fn template(error: polyspec_template::TemplateError) -> Self { Self { code: error.code.as_str().to_string(), template: error.template, line: error.line, col: error.col } }
    // An argument error (ERR-13) is not an ERR-1 error, so it never equals an expected error object.
    fn request(error: polyspec_template::RequestError) -> Self { match error { polyspec_template::RequestError::Template(error) => Self::template(error), polyspec_template::RequestError::Argument(error) => Self { code: format!("argument error: {}", error.message), template: String::new(), line: 0, col: 0 } } }
}
${modules}
${tests}
`);
  if (runnable.length > 0) {
    const run = await runCaseTests(['cargo', '--timeout', String(CASE_TIMEOUT_SECONDS), '--cwd', temporary, '--', '--locked', '--offline', '--test', 'generated_conformance_check'], {
      cwd: root,
      env: { ...workspace.env, PATH: `${resolve(process.env.HOME, '.cargo/bin')}:${process.env.PATH}`, RUSTFLAGS: '-Awarnings' },
    }, new Map(runnable.map(({ testCase, name }) => [name, testCase.id])));
    failures.push(...caseTestFailures('Rust', run));
    if (run.status === 0 || run.failed.length > 0) executed = runnable.length - run.failed.length;
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

for (const failure of failures) process.stderr.write(`${failure}\n`);
const passed = compilePassed + executed;
process.stdout.write(`${passed}/${cases.length} Rust generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
