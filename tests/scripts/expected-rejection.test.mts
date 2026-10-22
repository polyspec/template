// The refusal checks of the scripts count only the expected failure (scripts/expected-rejection.mts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { rejects } from '../../scripts/expected-rejection.mts';

test('only the expected failure counts as a refusal', () => {
  assert.equal(rejects(() => { throw new Error('missing adapter operation: render'); }, /^missing adapter operation: /), true);
  assert.equal(rejects(() => 'accepted', /^missing adapter operation: /), false);
  assert.throws(() => rejects(() => { throw new TypeError('adapter is undefined'); }, /^missing adapter operation: /), TypeError);
});
