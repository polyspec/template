// Tests that the Python support of each feature of contracts/features.json follows the verification commands that the
// feature declares to run Python (T22.4-9). A verification command declares `"python": true` when it runs the Python
// implementation; the declaration is read here, not inferred from the words of the Makefile or of the scripts, which
// name the Python client as data. A feature whose commands declare no Python declares python: unsupported. A feature
// whose commands declare Python declares python: partial, or pass once the CI merge-group run of T22.4-7 passed. Each
// failure names the feature, the declared value and the expected value.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'contracts/features.json'), 'utf8'));

test('each feature declares python as the coverage of the commands that declare a Python run', () => {
  assert.ok(manifest.features.length > 0, 'contracts/features.json holds no feature; the check verified nothing');
  const failures = [];
  for (const feature of manifest.features) {
    const declared = feature.clients?.python;
    const covered = feature.verification.some(item => item.python === true);
    if (!covered && declared !== 'unsupported') {
      failures.push(`${feature.id}: no verification command declares a Python run, so python must be unsupported; declared ${declared}`);
    }
    if (covered && declared !== 'partial' && declared !== 'pass') {
      failures.push(`${feature.id}: a verification command declares a Python run, so python must be partial or pass; declared ${declared}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
