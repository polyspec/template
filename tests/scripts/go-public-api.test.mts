import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { jsonDocument } from '../../scripts/json-document.mts';
import { declaredApiSymbols } from './public-api-declarations.mts';
import { toolsDirectory } from '../../scripts/tools-directory.mts';

function compile(file: string) {
  // The importer must live outside the module: Go permits internal imports
  // from a source file physically inside the owning module.
  const directory = mkdtempSync(join(tmpdir(), 'template-go-api-'));
  try {
    const source = join(directory, 'consumer.go');
    copyFileSync(`packages/go/testdata/public-api/${file}`, source);
    return spawnSync('go', ['build', '-o', join(directory, 'consumer.a'), source], {
      cwd: resolve('packages/go'), encoding: 'utf8',
      env: { ...process.env, GOPROXY: 'off', GOTOOLCHAIN: 'local' },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a Go consumer can name the host callback context through the SDK', { timeout: 30_000 }, () => {
  const result = compile('public-host-function.go');
  assert.equal(result.status, 0, result.stderr);
});

test('a Go consumer can name parser analysis types through the SDK', { timeout: 30_000 }, () => {
  const result = compile('public-parser.go');
  assert.equal(result.status, 0, result.stderr);
});

for (const file of ['private-builtins.go', 'internal-builtins.go', 'private-lexer.go', 'private-parser.go', 'private-expression.go', 'private-evaluator.go', 'private-renderer.go']) {
  test(`a Go consumer cannot import an implementation through ${file}`, { timeout: 30_000 }, () => {
    const result = compile(file);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, null);
    assert.notEqual(result.status, 0, 'an implementation package is publicly accessible');
  });
}

test('every declared Go API reference exists in the native model', { timeout: 30_000 }, () => {
  const result = spawnSync(join(toolsDirectory(resolve('.')), 'symbols-go/bin/kit-symbols-go'), ['packages/go'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  const found = new Set(jsonDocument<string[]>('Go SDK model', { type: 'array', items: { type: 'string' } }).parse(result.stdout, 'Go symbols'));
  assert.deepEqual(declaredApiSymbols('go').filter(symbol => !found.has(symbol)), []);
  for (const name of ['CheckFloat', 'CheckInteger', 'CheckLevel', 'CheckJSON', 'CompareCodePoints', 'ShortestDigits', 'Positional', 'RoundDecimal']) {
    assert.equal(found.has(`github.com/polyspec/template/packages/go/value.${name}`), false, `${name} is private conversion machinery`);
  }
});
