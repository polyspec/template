#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileAst } from '../../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../../tools/compiler/compiler.mjs';
import { deriveTypeManifest } from '../../tools/compiler/type-manifest.mjs';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { firstDifference, listCases } from './cases.mjs';
import { root } from './drivers.mjs';

const crate = join(root, 'packages/template-rust');
const temporary = mkdtempSync(join(crate, 'generated_conformance_'));
const integrationTest = join(crate, 'tests/generated_conformance_check.rs');
const quote = value => JSON.stringify(value);

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
const cases = listCases(process.argv[2]);
if (process.argv[2] === undefined) assert.ok(cases.length > 0);

try {
  for (const testCase of cases) {
    try {
      const index = runnable.length;
      const directory = join(temporary, `case_${testCase.id.replaceAll(/[^A-Za-z0-9]+/g, '_')}`);
      mkdirSync(directory);
      const define = testCase.hasDefine ? JSON.parse(readFileSync(join(testCase.dir, 'define.json'), 'utf8')) : {};
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), define);
      const typePath = join(directory, 'types.json');
      const graphPath = join(directory, 'ast');
      const sourcePath = join(directory, 'generated.rs');
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'rust'));
      runnable.push({ testCase, sourcePath, index });
    } catch (error) {
      const actual = errorObject(error);
      const difference = testCase.expectedError === null || actual === null ? 'unexpected compile failure' : firstDifference(testCase.expectedError, actual);
      if (difference) failures.push(`${testCase.id}: compile ${difference}: ${error.message}`);
      else compilePassed++;
    }
  }

  const modules = runnable.map(({ testCase, sourcePath, index }) => {
    const data = testCase.hasData ? `include_bytes!(${quote(resolve(join(testCase.dir, 'data.json')))})` : 'b"{}"';
    return `#[allow(dead_code, unused_imports, unused_variables)]
mod case_${index} {
    include!(${quote(resolve(sourcePath))});
    pub fn execute() -> Result<String, super::ActualError> {
        use polyspec_template::Program;
        let data = ${data};
        let text = std::str::from_utf8(data).map_err(|_| super::ActualError::data("E_DATA_INVALID_UTF8"))?;
        let assign: serde_json::Value = serde_json::from_str(text).map_err(|_| super::ActualError::data("E_DATA_UNSUPPORTED_TYPE"))?;
        let mut options = polyspec_template::RenderOptions::default();
        ${testCase.hasDefine ? `let define: serde_json::Value = serde_json::from_str(include_str!(${quote(resolve(join(testCase.dir, 'define.json')))})).unwrap();
        options.define = polyspec_template::defines_from_json(&define).map_err(super::ActualError::bind)?;` : ''}
        ${testCase.hasEnv ? `let env: serde_json::Value = serde_json::from_str(include_str!(${quote(resolve(join(testCase.dir, 'env.json')))})).unwrap();
        options.env = Some(polyspec_template::env_from_json(&env).map_err(super::ActualError::bind)?);` : ''}
        let program = GeneratedProgram::new(polyspec_template::RuntimeEnvironment::new(None, std::collections::HashMap::new()));
        program.render(polyspec_template::RenderTarget::Name("input.tpl"), &assign, &options).map_err(super::ActualError::template)
    }
}`;
  }).join('\n');

  const tests = runnable.map(({ testCase, index }) => testCase.expectedError === null
    ? `#[test]
fn case_${index}_matches() { assert_eq!(case_${index}::execute().unwrap(), ${quote(testCase.expectedHtml)}); }`
    : `#[test]
fn case_${index}_matches() { let actual = case_${index}::execute().unwrap_err(); assert_eq!(actual, ActualError { code: ${quote(testCase.expectedError.code)}.to_string(), template: ${quote(testCase.expectedError.template)}.to_string(), line: ${testCase.expectedError.line}, col: ${testCase.expectedError.col} }); }`).join('\n');

  writeFileSync(integrationTest, `#[derive(Debug, PartialEq)]
struct ActualError { code: String, template: String, line: usize, col: usize }
impl ActualError {
    fn data(code: &str) -> Self { Self { code: code.to_string(), template: "input.tpl".to_string(), line: 0, col: 0 } }
    fn bind(error: polyspec_template::BindError) -> Self { Self::data(error.code.as_str()) }
    fn template(error: polyspec_template::TemplateError) -> Self { Self { code: error.code.as_str().to_string(), template: error.template, line: error.line, col: error.col } }
}
${modules}
${tests}
`);
  if (runnable.length > 0) {
    const result = spawnSync(resolve(process.env.HOME, '.cargo/bin/cargo'), ['test', '--locked', '--test', 'generated_conformance_check'], { cwd: crate, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, RUSTFLAGS: '-Awarnings' } });
    if (result.status !== 0) failures.push(`generated Rust execution failed:\n${result.stdout}${result.stderr}`);
  }
} finally {
  rmSync(integrationTest, { force: true });
  rmSync(temporary, { recursive: true, force: true });
}

for (const failure of failures) process.stderr.write(`${failure}\n`);
const passed = failures.length === 0 ? cases.length : compilePassed;
process.stdout.write(`${passed}/${cases.length} Rust generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
