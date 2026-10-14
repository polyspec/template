// Tests scripts/python-toolchain.mts (T22.4-20, T22.5-5, T24.12, T23.2): the interpreter is the shim
// var/tools/mise/shims/python3 of the python of mise.toml, which must report the minor release of that python. A missing
// interpreter fails with the path and the fix; the interpreter of PATH is never tried. A program that imports the package
// runs the python of var/python/venv, with no changed import path (PRINCIPLES S3).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pythonCommand, pythonEnvironment, pythonInterpreter, pythonMinor, pythonPackageCommand, pythonPackageInterpreter } from '../../scripts/python-toolchain.mts';
import { pythonPackageEnvironment } from '../../scripts/python-venv.mts';

test('the minor release comes from the python of mise.toml', () => {
  assert.match(pythonMinor(), /^3\.\d+$/);
});

test('a missing interpreter fails with its path and the make install-tools fix', t => {
  const empty = mkdtempSync(join(tmpdir(), 'template-python-toolchain-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const missing = join(empty, 'python3');
  assert.throws(() => pythonCommand(missing), (error: unknown) => error instanceof Error && error.message.includes(`${missing} is missing`) && error.message.includes('run make install-tools'));
});

test('the pinned interpreter of var/tools reports the minor release of the python of mise.toml', () => {
  assert.equal(pythonCommand(), pythonInterpreter);
});

test('the environment of a Python program writes no bytecode and sets no import path', () => {
  assert.deepEqual(pythonEnvironment(), { PYTHONDONTWRITEBYTECODE: '1' });
});

test('the python that imports the package is the python of var/python/venv, which make python-package makes', () => {
  assert.equal(pythonPackageInterpreter, join(pythonInterpreter, '../../../../python/venv/bin/python'));
  assert.equal(pythonPackageEnvironment(), 'var/python/venv');
  assert.ok(!readFileSync(new URL('../../scripts/python-toolchain.mts', import.meta.url), 'utf8').includes("'var/python/venv"), 'python-toolchain.mjs restates the environment that config/parity.json declares');
  assert.equal(pythonPackageCommand(), pythonPackageInterpreter, 'run make python-package');
});
