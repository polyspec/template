// Tests the verdict of a generated runner on its known failures (docs/spec/compiler.md#transition): a failure outside
// the list and a case of the list that passes fail the run, and a run whose failures are exactly the list passes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knownFailureVerdict } from '../runner/known-failures.mts';

const known = new Set(['errors/a', 'errors/b']);
const ran = ['echo/x', 'errors/a', 'errors/b', 'expr/y'];

test('a failure outside the list is unexpected', { timeout: 1000 }, () => {
  assert.deepEqual(knownFailureVerdict(ran, ['errors/a', 'errors/b', 'expr/y'], known), { unexpected: ['expr/y'], passed: [], observed: 2 });
});

test('a case of the list that passes is reported, so the list loses it', { timeout: 1000 }, () => {
  assert.deepEqual(knownFailureVerdict(ran, ['errors/a'], known), { unexpected: [], passed: ['errors/b'], observed: 1 });
});

test('failures that are exactly the list leave nothing to report', { timeout: 1000 }, () => {
  assert.deepEqual(knownFailureVerdict(ran, ['errors/a', 'errors/b'], known), { unexpected: [], passed: [], observed: 2 });
});

test('a case of the list that did not run is not judged', { timeout: 1000 }, () => {
  assert.deepEqual(knownFailureVerdict(['echo/x'], [], known), { unexpected: [], passed: [], observed: 0 });
});
