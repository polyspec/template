import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

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

for (const file of ['private-builtins.go', 'internal-builtins.go']) {
  test(`a Go consumer cannot import the built-in implementation through ${file}`, { timeout: 30_000 }, () => {
    const result = compile(file);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, null);
    assert.notEqual(result.status, 0, 'the implementation registry is publicly accessible');
  });
}
