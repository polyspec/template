// Compiles consumers against the built library: host callback types are public,
// while the implementation's built-in registry is not part of the SDK.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { jsonDocument } from '../../scripts/json-document.mts';

const diagnostic = jsonDocument<{ code: { code: string } | null }>('Rust diagnostic', {
  type: 'object', required: ['code'],
  properties: { code: { anyOf: [
    { type: 'null' },
    { type: 'object', required: ['code'], properties: { code: { type: 'string' } } },
  ] } },
});

function compile(file: string) {
  const output = mkdtempSync(join(tmpdir(), 'template-rust-api-'));
  try {
    const rustc = join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'rustc.exe' : 'rustc');
    return spawnSync(rustc, [
      '--edition=2024', '--crate-type=lib', '--error-format=json',
      '--crate-name=public_api_probe', '--out-dir', output,
      '-L', 'dependency=packages/rust/target/release/deps',
      '--extern', 'polyspec_template=packages/rust/target/release/libpolyspec_template.rlib',
      `packages/rust/tests/fixtures/public-api/${file}`,
    ], { encoding: 'utf8' });
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

test('a Rust consumer can use the public host callback types', { timeout: 30_000 }, () => {
  const result = compile('public-host-function.rs');
  assert.equal(result.status, 0, result.stderr);
});

test('a Rust consumer cannot access the built-in implementation registry', { timeout: 30_000 }, () => {
  const result = compile('private-builtins.rs');
  assert.notEqual(result.status, 0, 'the implementation registry is publicly accessible');
  const errors = result.stderr.split('\n').filter(Boolean).map(line => diagnostic.parse(line, 'rustc stderr').code?.code);
  assert.ok(errors.includes('E0603'), result.stderr);
});

test('a Rust consumer can use the root parser and analysis types', { timeout: 30_000 }, () => {
  const result = compile('public-parser.rs');
  assert.equal(result.status, 0, result.stderr);
});

test('a Rust consumer can use compiler runtime services through the SDK', { timeout: 30_000 }, () => {
  const result = compile('public-runtime.rs');
  assert.equal(result.status, 0, result.stderr);
});

for (const file of ['private-scanner.rs', 'private-escape.rs', 'private-render.rs', 'private-expression.rs', 'private-source.rs', 'private-ast.rs', 'private-values.rs', 'private-formatter.rs', 'private-errors.rs']) {
  test(`a Rust consumer cannot import the implementation through ${file}`, { timeout: 30_000 }, () => {
    const result = compile(file);
    assert.notEqual(result.status, 0, 'the implementation is publicly accessible');
    const errors = result.stderr.split('\n').filter(Boolean).map(line => diagnostic.parse(line, 'rustc stderr').code?.code);
    assert.ok(errors.includes('E0603'), result.stderr);
  });
}

test('a Rust consumer can construct and inspect AST data through the SDK root', { timeout: 30_000 }, () => {
  const result = compile('public-ast.rs');
  assert.equal(result.status, 0, result.stderr);
});

test('a Rust consumer can bind and inspect values through the SDK root', { timeout: 30_000 }, () => {
  const result = compile('public-values.rs');
  assert.equal(result.status, 0, result.stderr);
});

test('a Rust consumer can format through the default SDK root', { timeout: 30_000 }, () => {
  const result = compile('public-formatter.rs');
  assert.equal(result.status, 0, result.stderr);
});

test('a Rust consumer can construct positioned errors through the SDK root', { timeout: 30_000 }, () => {
  const result = compile('public-errors.rs');
  assert.equal(result.status, 0, result.stderr);
});
