// Native Python module export lists define the SDK model.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { jsonDocument } from '../../scripts/json-document.mts';
import { declaredApiSymbols } from './public-api-declarations.mts';

test('every declared Python API reference exists in the native model', { timeout: 30_000 }, () => {
  const tools = dirname(fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests')));
  const result = spawnSync('python3', ['-I', join(tools, 'symbols/python.py'), 'packages/python/src/polyspec/template'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  const found = new Set(jsonDocument<string[]>('Python SDK model', { type: 'array', items: { type: 'string' } }).parse(result.stdout, 'Python symbols'));
  assert.deepEqual(declaredApiSymbols('python').filter(symbol => !found.has(symbol)), []);
});
