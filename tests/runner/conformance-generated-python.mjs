#!/usr/bin/env node
// Python generated conformance: compiles every case into a Python module and runs
// it in its own Python process. Each case prints its start and its result with its
// elapsed time, and the Python process of a case is stopped when it outlives its
// deadline.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAst } from '../../packages/template-compiler/ast-artifact.mjs';
import { compileSource } from '../../packages/template-compiler/compiler.mjs';
import { deriveTypeManifest } from '../../packages/template-compiler/type-manifest.mjs';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { firstDifference, generatedCases, typeDefinitions } from './cases.mjs';
import { runBounded, seconds, stepProgress } from './bounded.mjs';
import { root } from './drivers.mjs';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mjs';

// The time limit of one Python process of a case.
const PROCESS_TIMEOUT_MS = 30_000;

const temporary = temporaryDirectory('generated-conformance-python');
const sources = join(temporary, 'source');
const runner = join(temporary, 'runner.py');
mkdirSync(sources);

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

// Every case runs in its own Python process. The runner loads the generated module
// of the case from its path and renders the entry template with the case inputs.
writeFileSync(runner, `import importlib.util
import json
import sys

from polyspec.template.json_parse import parse_json_bytes

spec = importlib.util.spec_from_file_location('generated_case', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def read_json(path):
    if path == '':
        return None
    with open(path, 'rb') as handle:
        return parse_json_bytes(handle.read())


try:
    assign = read_json(sys.argv[2])
    define = read_json(sys.argv[3])
    env = read_json(sys.argv[4])
    options = {}
    if define is not None:
        options['define'] = define
    if env is not None:
        options['env'] = env
    html = module.GeneratedProgram().render('input.tpl', assign, options)
    print(json.dumps({'html': html}))
except module.TemplateError as error:
    fields = error.to_object()
    print(json.dumps({'error': {'code': fields['code'], 'template': fields['template'],
                                'line': fields['line'], 'col': fields['col']}}))
except module.BindError as error:
    print(json.dumps({'error': {'code': error.code, 'template': 'input.tpl', 'line': 0, 'col': 0}}))
except Exception as error:  # noqa: BLE001  a failure of the generated program is a case failure
    print(json.dumps({'failure': f'{type(error).__name__}: {error}'}))
`);

const failures = [];
let passed = 0;
const { cases, filtered } = generatedCases(process.argv.slice(2));
const progress = stepProgress();

// Runs one Python process of a case; a process that outlives its deadline fails the case.
async function python(args, step) {
  const result = await runBounded('python3', args, {
    cwd: root,
    timeoutMs: PROCESS_TIMEOUT_MS,
    env: { ...process.env, PYTHONPATH: join(root, 'packages', 'template-python', 'src') },
  });
  if (result.timedOut) throw Object.assign(new Error(`${step} exceeded its ${seconds(PROCESS_TIMEOUT_MS)} deadline`), { deadline: true });
  return result;
}

try {
  for (const testCase of cases) {
    const id = testCase.id.replaceAll('/', '--');
    const failed = failures.length;
    progress.start(testCase.id);
    try {
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), typeDefinitions(testCase));
      const typePath = join(temporary, `${id}.types.json`);
      const graphPath = join(temporary, `${id}.ast`);
      const sourcePath = join(sources, `${id}.py`);
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'python', {}));
      const lint = await python(['-m', 'py_compile', sourcePath], 'python -m py_compile');
      if (lint.status !== 0) throw new Error(`${lint.stdout}${lint.stderr}`);
      const result = await python([runner, sourcePath,
        testCase.hasData ? join(testCase.dir, 'data.json') : '',
        testCase.hasDefine ? join(testCase.dir, 'define.json') : '',
        testCase.hasEnv ? join(testCase.dir, 'env.json') : ''], 'the case process');
      if (result.status !== 0) throw new Error(result.stderr || `python3 exited with ${result.status}`);
      let actual;
      try { actual = JSON.parse(result.stdout); }
      catch { throw new Error(`invalid Python result: ${result.stdout}`); }
      if (actual.failure) failures.push(`${testCase.id}: ${actual.failure}`);
      else if (actual.error) {
        const difference = testCase.expectedError === null ? 'unexpected render failure' : firstDifference(testCase.expectedError, actual.error);
        if (difference) failures.push(`${testCase.id}: render ${difference}`); else passed++;
      } else if (testCase.expectedError !== null) failures.push(`${testCase.id}: expected ${testCase.expectedError.code}, generated execution succeeded`);
      else if (actual.html !== testCase.expectedHtml) failures.push(`${testCase.id}: generated HTML differs`);
      else passed++;
    } catch (error) {
      const actual = errorObject(error);
      const difference = testCase.expectedError === null || actual === null ? 'unexpected compile failure' : firstDifference(testCase.expectedError, actual);
      if (error.deadline) failures.push(`${testCase.id}: ${error.message}`);
      else if (difference) failures.push(`${testCase.id}: compile ${difference}: ${error.message}`); else passed++;
    }
    if (failures.length > failed) progress.fail(testCase.id, undefined, failures.slice(failed).join('\n'));
    else progress.pass(testCase.id);
  }
  progress.close('Python generated conformance');
  if (!filtered) assert.equal(passed + failures.length, cases.length);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(`${passed}/${cases.length} Python generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
