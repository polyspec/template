// Tests scripts/python-toolchain.mjs (T22.4-20): the interpreter is `python<minor>` of .python-version; a missing
// interpreter fails with the command and the fix, never with a fallback to `python3`.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pythonCommand, pythonMinor } from '../../scripts/python-toolchain.mjs';

test('the minor release comes from .python-version', () => {
  assert.match(pythonMinor(), /^3\.\d+$/);
});

test('an empty PATH fails with the command named after .python-version and the fix', t => {
  const empty = mkdtempSync(join(tmpdir(), 'template-python-toolchain-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.throws(() => pythonCommand({ PATH: empty }), error => error.message.includes(`python${pythonMinor()} is not on PATH`) && error.message.includes('.python-version') && error.message.includes('install that Python'));
});

test('the interpreter of this machine reports the minor release of .python-version', () => {
  assert.equal(pythonCommand(), `python${pythonMinor()}`);
});
