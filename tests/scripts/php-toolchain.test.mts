import assert from 'node:assert/strict';
import test from 'node:test';
import { phpVersionIsAllowed } from '../../scripts/php-toolchain.mts';

for (const version of ['8.4.27', '8.4.26']) test(`the 8.4 policy accepts PHP ${version}`, { timeout: 5000 }, () => {
  assert.equal(phpVersionIsAllowed(['8.4'], version), true);
});
for (const version of ['8.5.10', '8.3.36', 'unreported', '']) test(`the 8.4 policy rejects ${JSON.stringify(version)}`, { timeout: 5000 }, () => {
  assert.equal(phpVersionIsAllowed(['8.4'], version), false);
});
test('an empty PHP policy accepts no interpreter', { timeout: 5000 }, () => {
  assert.equal(phpVersionIsAllowed([], '8.4.27'), false);
});
