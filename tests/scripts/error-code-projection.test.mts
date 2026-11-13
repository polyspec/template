// GN-7b of binding: every member of packages/rust/interface.json returns the core error `TemplateError`, a struct that
// holds its code in a field, and the rows of `errors.kinds` name the variants of `ErrorCode`. The generated crates match
// each row against the error of the core, so the contract names in `errors.code` the type of the error and the function
// that gives its code: `{error, path}`. The generator reads no Rust source, so this test requires the item, requires
// every row to name a variant of the enum that the function returns, and requires the core to hold that function.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

test('the contract names the projection of the core error to the code that its kinds list', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract) && isObject(contract['errors']), 'packages/rust/interface.json holds no errors');
  const errors = contract['errors'];
  assert.deepEqual(errors['code'], { error: 'polyspec_template::TemplateError', path: 'polyspec_template::TemplateError::code' });
  const kinds = Array.isArray(errors['kinds']) ? errors['kinds'].filter(isObject) : [];
  assert.notEqual(kinds.length, 0, 'errors.kinds holds no row');
  assert.deepEqual(kinds.map((row) => String(row['variant'])).filter((variant) => !/^polyspec_template::ErrorCode::[A-Z][A-Za-z0-9]*$/.test(variant)), []);
  const core = readFileSync(path.join(ROOT, 'packages/rust/src/error.rs'), 'utf8');
  const implementation = /impl TemplateError \{[^]*?\n\}/g;
  const projection = /pub fn code\(&self\) -> ErrorCode \{/;
  assert.ok([...core.matchAll(implementation)].some((block) => projection.test(block[0])), 'packages/rust/src/error.rs holds no `pub fn code(&self) -> ErrorCode` of TemplateError');
});
