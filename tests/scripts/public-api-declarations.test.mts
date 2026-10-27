// Exact native symbol sets retain every publication point of one contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import { publicApiDeclarationsDocument } from './public-api-declarations.mts';

const document = (binding: object) => ({ units: [{ kind: 'api', symbols: [{ implementation: 'ts', ...binding }] }] });

test('API declarations retain a scalar native reference', { timeout: 5000 }, () => {
  const result = publicApiDeclarationsDocument.check(document({ symbol: 'SDK.Type' }), 'scalar reference');
  assert.equal(result.units[0]?.symbols?.[0]?.symbol, 'SDK.Type');
});

test('API declarations retain every exact reference of a native symbol list', { timeout: 5000 }, () => {
  const expected = ['SDK.Type', 'SDK.Type.member'];
  const result = publicApiDeclarationsDocument.check(document({ symbols: expected }), 'symbol list');
  assert.deepEqual(result.units[0]?.symbols?.[0]?.symbols, expected);
});

test('API declarations reject empty, duplicate, mixed and non-string symbol lists', { timeout: 5000 }, () => {
  for (const binding of [
    { symbols: [] }, { symbols: ['SDK.Type', 'SDK.Type'] }, { symbols: ['SDK.Type', 1] },
    { symbols: [''] }, { symbol: 'SDK.Type', symbols: ['SDK.Type'] }, {},
  ]) assert.throws(() => publicApiDeclarationsDocument.check(document(binding), 'invalid symbol binding'));
});
