// Native SDK consumers verify the declared references independently of the parity symbol extractor.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { jsonDocument } from '../../scripts/json-document.mts';
import { pythonEnvironment, pythonPackageCommand } from '../../scripts/python-toolchain.mts';
import { declaredApiSymbols } from './public-api-declarations.mts';

const probe = `
import importlib
import json
import sys

missing = []
for reference in json.load(sys.stdin):
    parts = ("polyspec." + reference).split(".")
    for length in range(len(parts), 0, -1):
        module = ".".join(parts[:length])
        try:
            value = importlib.import_module(module)
        except ModuleNotFoundError as error:
            if error.name != module and not module.startswith(error.name + "."):
                raise
            continue
        for member in parts[length:]:
            if hasattr(value, member):
                value = getattr(value, member)
            else:
                missing.append(reference)
                break
        break
    else:
        missing.append(reference)
print(json.dumps(missing))
`;

function missingReferences(references: string[]): string[] {
  const result = spawnSync(pythonPackageCommand(), ['-I', '-c', probe], {
    input: JSON.stringify(references),
    env: { ...process.env, ...pythonEnvironment() },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return jsonDocument<string[]>('Missing Python SDK references', { type: 'array', items: { type: 'string' } }).parse(result.stdout, 'Python consumer');
}

test('every declared Python API reference is accessible to an installed SDK consumer', { timeout: 30_000 }, () => {
  assert.deepEqual(missingReferences(declaredApiSymbols('python')), []);
});

test('the Python SDK consumer rejects nonexistent module and class members', { timeout: 30_000 }, () => {
  const missing = ['template.nonexistent_sdk_module.member', 'template.engine.Engine.nonexistent_sdk_member'];
  assert.deepEqual(missingReferences(missing), missing);
});
