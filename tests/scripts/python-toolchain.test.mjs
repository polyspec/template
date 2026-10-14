// Tests scripts/python-toolchain.mjs (T22.4-20, T22.5-5, T24.12): the interpreter is the shim var/tools/mise/shims/python3
// of the python of mise.toml, which must report the minor release of that python. A missing interpreter fails with the
// path and the fix; the interpreter of PATH is never tried.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pythonCommand, pythonInterpreter, pythonMinor } from '../../scripts/python-toolchain.mjs';

test('the minor release comes from the python of mise.toml', () => {
  assert.match(pythonMinor(), /^3\.\d+$/);
});

test('a missing interpreter fails with its path and the make install-tools fix', t => {
  const empty = mkdtempSync(join(tmpdir(), 'template-python-toolchain-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const missing = join(empty, 'python3');
  assert.throws(() => pythonCommand(missing), error => error.message.includes(`${missing} is missing`) && error.message.includes('run make install-tools'));
});

test('the pinned interpreter of var/tools reports the minor release of the python of mise.toml', () => {
  assert.equal(pythonCommand(), pythonInterpreter);
});
