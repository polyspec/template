#!/usr/bin/env node
// Rust generated conformance: compiles every case into a module of one integration test file whose
// tests are named after the cases, and runs it with scripts/kit/run-tests.mjs, which prints each case
// test with its elapsed time.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { rustString } from '../../packages/compiler/src/backend-support.mts';
import { compileSource } from '../../packages/compiler/src/compiler.mts';
import { caseTestFailures, expectedHtml, generatedCases, runCaseTests, type TestCase } from './cases.mts';
import { caseTypeManifest, compileStep, finishRun } from './generated-cases.mts';
import { knownFailureVerdict } from './known-failures.mts';
import { runStep, stepProgress } from './bounded.mts';
import { rustBuildArgs, rustRunArgs } from './rust-steps.mts';
import { root } from './drivers.mts';
import { CARGO, rustWorkspace } from '../../scripts/temporary-workspace.mts';

// A crate of the system temporary directory that depends on packages/rust; it holds the generated cases and
// their integration test.
const workspace = rustWorkspace('generated-conformance-rust');
const temporary = workspace.directory;
const integrationTest = workspace.test('generated_conformance_check');
// Paths and expected output are embedded as exact Rust string literals.
const quote = rustString;

// The cases that this runner is known to fail, with the reason; docs/spec/compiler.md#transition states the list. The
// compiler parses with the legacy TypeScript runtime, which reads a lone surrogate escape as U+FFFD, where EXP-3 makes it
// parse_invalid_escape, so the AST of these cases holds no error. Remove the entries when the compiler parses with the
// Node binding (T28.4). The run fails when a case outside the list fails and when a case of the list passes.
const KNOWN_FAILURE_REASON = 'the compiler parses with the legacy TypeScript runtime, which reads a lone surrogate escape as U+FFFD (EXP-3); removed when the compiler parses with the Node binding (T28.4)';
const KNOWN_FAILURES: ReadonlyMap<string, string> = new Map([
  'errors/high-surrogate-at-quote-escape',
  'errors/high-surrogate-before-pair-escape',
  'errors/lone-high-surrogate-escape',
  'errors/lone-low-surrogate-escape',
].map(id => [id, KNOWN_FAILURE_REASON]));
// The known failures that this run observed.
let knownFailed = 0;

const failures: string[] = [];
const runnable: { testCase: TestCase; sourcePath: string; name: string }[] = [];
let compilePassed = 0;
// The cases whose generated test passed.
let executed = 0;
const { cases } = generatedCases(process.argv.slice(2));
const progress = stepProgress();
// The module and the test of a case are named after its id.
const names = new Map<string, string>();
function caseName(testCase: TestCase): string {
  const name = `case_${testCase.id.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`;
  if (names.has(name) && names.get(name) !== testCase.id) throw new Error(`${testCase.id} and ${names.get(name)} have the same Rust name ${name}`);
  names.set(name, testCase.id);
  return name;
}

try {
  for (const testCase of cases) {
    const compiled = compileStep(testCase, progress, failures, () => {
      const name = caseName(testCase);
      const directory = join(temporary, name);
      mkdirSync(directory);
      const typeManifest = caseTypeManifest(testCase);
      const typePath = join(directory, 'types.json');
      const graphPath = join(directory, 'ast');
      const sourcePath = join(directory, 'generated.rs');
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'rust'));
      runnable.push({ testCase, sourcePath, name });
    });
    if (compiled === 'expected') compilePassed++;
  }
  progress.close('Rust generated conformance compile');

  const modules = runnable.map(({ testCase, sourcePath, name }) => {
    const data = testCase.hasData ? `include_bytes!(${quote(resolve(join(testCase.dir, 'data.json')))})` : 'b"{}"';
    return `#[allow(dead_code, unused_imports, unused_variables)]
mod ${name} {
    include!(${quote(resolve(sourcePath))});
    fn actual(error: GeneratedError) -> super::ActualError { match error { GeneratedError::Render(polyspec_template::RenderError::Kind(error)) => super::ActualError::template(error), other => super::ActualError::argument(other.to_string()) } }
    pub fn execute() -> Result<String, super::ActualError> {
        let data = ${data};
        let text = std::str::from_utf8(data).map_err(|_| super::ActualError::data("data_invalid_utf8"))?;
        let assign = polyspec_template::read_json(text).map_err(super::ActualError::bind)?;
        let mut options = polyspec_template::RenderOptions::default();
        ${testCase.hasDefine ? `let define = polyspec_template::read_json(include_str!(${quote(resolve(join(testCase.dir, 'define.json')))})).map_err(super::ActualError::bind)?;
        options.define = Some(polyspec_template::defines_from_json(&define).map_err(super::ActualError::bind)?);` : ''}
        ${testCase.hasEnv ? `let env = polyspec_template::read_json(include_str!(${quote(resolve(join(testCase.dir, 'env.json')))})).map_err(super::ActualError::bind)?;
        options.env = Some(polyspec_template::env_from_json(&env).map_err(super::ActualError::bind)?);` : ''}
        let program = GeneratedProgram::new(polyspec_template::EngineOptions::default()).map_err(actual)?;
        program.render("input.tpl", &assign, &options).map_err(actual)
    }
}`;
  }).join('\n');

  const tests = runnable.map(({ testCase, name }) => testCase.expectedError === null
    ? `#[test]
fn ${name}() { assert_eq!(${name}::execute().unwrap(), ${quote(expectedHtml(testCase))}); }`
    : `#[test]
fn ${name}() { let actual = ${name}::execute().unwrap_err(); assert_eq!(actual, ActualError { code: ${quote(testCase.expectedError.code)}.to_string(), template: ${quote(testCase.expectedError.template)}.to_string(), line: ${testCase.expectedError.line}, col: ${testCase.expectedError.col} }); }`).join('\n');

  writeFileSync(integrationTest, `#[derive(Debug, PartialEq)]
struct ActualError { code: String, template: String, line: usize, col: usize }
impl ActualError {
    fn data(code: &str) -> Self { Self { code: code.to_string(), template: "input.tpl".to_string(), line: 0, col: 0 } }
    fn bind(error: polyspec_template::BindError) -> Self { Self::data(error.code.as_str()) }
    fn template(error: polyspec_template::TemplateError) -> Self { Self { code: error.code.as_str().to_string(), template: error.template, line: error.line, col: error.col } }
    // An argument error (ERR-13) is not an ERR-1 error, so it never equals an expected error object; an error of host code
    // is not one either.
    fn argument(message: String) -> Self { Self { code: format!("argument error: {message}"), template: String::new(), line: 0, col: 0 } }
}
${modules}
${tests}
`);
  if (runnable.length > 0) {
    const env = { ...workspace.env, PATH: `${dirname(CARGO)}:${process.env.PATH}`, RUSTFLAGS: '-Awarnings' };
    // The crate is built before its tests run, so a compile failure is reported as the build of the crate, not as a test.
    const build = await runStep(CARGO, rustBuildArgs('generated_conformance_check'), { cwd: temporary, env });
    if (build.status !== 0) {
      failures.push(`the generated Rust test crate does not build (exit ${String(build.status)}):\n${build.stderr.trim()}`);
    } else {
      const run = await runCaseTests(rustRunArgs('generated_conformance_check', temporary), { cwd: root, env },
        new Map(runnable.map(({ testCase, name }) => [name, testCase.id])));
      // A failure outside the list fails the run, and so does a case of the list that passes; a failure before any case
      // failed is reported as it is.
      const verdict = knownFailureVerdict(runnable.map(({ testCase }) => testCase.id), run.failed, new Set(KNOWN_FAILURES.keys()));
      failures.push(...caseTestFailures('Rust', { ...run, failed: verdict.unexpected, status: run.failed.length > 0 && verdict.unexpected.length === 0 ? 0 : run.status }));
      if (run.status === 0 || run.failed.length > 0) {
        executed = runnable.length - run.failed.length;
        knownFailed = verdict.observed;
        failures.push(...verdict.passed.map(id => `${id}: a known failure passed; remove it from KNOWN_FAILURES (${KNOWN_FAILURE_REASON})`));
      }
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(`known failures ${knownFailed}: ${[...KNOWN_FAILURES.keys()].join(', ')} (${KNOWN_FAILURE_REASON})\n`);
finishRun('Rust', compilePassed + executed, cases.length, failures);
