// compareText orders strings by UTF-16 code units, the order of Array.prototype.sort without a comparator, which the
// scripts kept before they named their comparator (T24.6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareText } from '../../scripts/compare-text.mts';

test('compareText orders by UTF-16 code units, as sort without a comparator', () => {
  const names = ['b', 'B', 'a', 'é', 'Z', '_', '10', '9', '\u{1F600}', '～', 'a'];
  assert.deepEqual([...names].sort(compareText), [...names].sort());
});

test('compareText returns 0 for equal strings and a sign for different ones', () => {
  assert.equal(compareText('a', 'a'), 0);
  assert.equal(compareText('a', 'b'), -1);
  assert.equal(compareText('b', 'a'), 1);
});
