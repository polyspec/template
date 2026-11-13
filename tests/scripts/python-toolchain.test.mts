// Tests scripts/python-toolchain.mts (T22.4-20, T22.5-5, T24.12, T23.2): the interpreter is the shim
// var/tools/mise/shims/python3 of the python of mise.toml, which must report the minor release of that python. A missing
// interpreter fails with the path and the fix; the interpreter of PATH is never tried. A program that imports the package
// runs the python of legacy/packages/python/.venv, with no changed import path (PRINCIPLES S3).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

test('the python that imports the package is the python of legacy/packages/python/.venv, which make python-package makes', () => {
  assert.equal(pythonPackageInterpreter, join(pythonInterpreter, '../../../../../legacy/packages/python/.venv/bin/python'));
  assert.equal(pythonPackageEnvironment(), 'legacy/packages/python/.venv');
  assert.equal(pythonPackageCommand(), pythonPackageInterpreter, 'run make python-package');
});

test('make reads the Python environment without a shared BOOTSTRAP_NODE variable', { timeout: 5000 }, () => {
  const result = spawnSync('make', ['--no-print-directory', '-n', 'python-package', 'BOOTSTRAP_NODE='], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Permission denied|read no environment/);
});

// T28.44: an install makes what it installs each time it runs. The stamp of python-package states that the environment
// is installed, not that the wheels of the lock are in the uv cache, so make template-install-python runs the recipe of
// the environment itself and not the target of the stamp, which does nothing while the stamp is current. The two dry
// runs of make took 3 seconds on a loaded machine, so the test has 30 seconds.
test('make template-install-python makes the environment of the lock whatever the stamp of python-package says', { timeout: 30000 }, () => {
  const install = spawnSync('make', ['--no-print-directory', '-n', 'template-install-python'], { encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /\btemplate-python-environment\b/, install.stdout);
  const environment = spawnSync('make', ['--no-print-directory', '-n', 'template-python-environment'], { encoding: 'utf8' });
  assert.equal(environment.status, 0, environment.stderr);
  assert.match(environment.stdout, /pip install .* -r legacy\/packages\/python\/pylock\.toml/, environment.stdout);
});
