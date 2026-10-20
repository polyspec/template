#!/usr/bin/env node
// Python generated conformance: compiles every case into a Python module and runs
// it in its own Python process. Each case prints its start and its result with its
// elapsed time, and the Python process of a case is stopped when it outlives its
// deadline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { compileSource } from '../../packages/compiler/src/compiler.mts';
import { caseTypeManifest, runProcessCases } from './generated-cases.mts';
import { parsedCaseResult } from './generated-errors.mts';
import { runBoundedStep } from './bounded.mts';
import { root } from './drivers.mts';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mts';
import { pythonEnvironment, pythonPackageCommand } from '../../scripts/python-toolchain.mts';

// The time limit of one Python process of a case.
const PROCESS_TIMEOUT_MS = 30_000;

const temporary = temporaryDirectory('generated-conformance-python');
const sources = join(temporary, 'source');
const runner = join(temporary, 'runner.py');
mkdirSync(sources);

// Every case runs in its own Python process. The runner loads the generated module
// of the case from its path and renders the entry template with the case inputs.
writeFileSync(runner, `import importlib.util
import json
import sys

from polyspec.template import RenderOptions
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
    html = module.GeneratedProgram().render('input.tpl', assign, RenderOptions(define=define, env=env))
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

// The python of var/python/venv, checked once before the first case.
const interpreter = pythonPackageCommand();
const environment = { ...process.env, ...pythonEnvironment() };

await runProcessCases('Python', temporary, async (testCase, id) => {
  const typePath = join(temporary, `${id}.types.json`);
  const graphPath = join(temporary, `${id}.ast`);
  const sourcePath = join(sources, `${id}.py`);
  writeFileSync(typePath, JSON.stringify(caseTypeManifest(testCase)));
  compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
  writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'python', {}));
  const options = { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS, env: environment };
  const lint = await runBoundedStep(interpreter, ['-m', 'py_compile', sourcePath], options, 'python -m py_compile');
  if (lint.status !== 0) throw new Error(`${lint.stdout}${lint.stderr}`);
  const result = await runBoundedStep(interpreter, [runner, sourcePath,
    testCase.hasData ? join(testCase.dir, 'data.json') : '',
    testCase.hasDefine ? join(testCase.dir, 'define.json') : '',
    testCase.hasEnv ? join(testCase.dir, 'env.json') : ''], options, 'the case process');
  if (result.status !== 0) throw new Error(result.stderr || `${interpreter} exited with ${result.status}`);
  return parsedCaseResult(result.stdout, 'Python');
});
