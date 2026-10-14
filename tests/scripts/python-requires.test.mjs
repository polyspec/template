// The Python support range of the package states what CI tests (T22.5-3): requires-python of
// packages/python/pyproject.toml is the minor release of the python of mise.toml and nothing older, because CI
// runs only that release (make install-tools installs the python of mise.toml at the digest of mise.lock, T24.12).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pythonMinor } from '../../scripts/python-toolchain.mjs';

const repository = resolve('.');

test('requires-python of the Python package is the minor release of the python of mise.toml (T22.5-3)', () => {
  const pyproject = readFileSync(join(repository, 'packages/python/pyproject.toml'), 'utf8');
  const declared = /^requires-python = "(>=\d+\.\d+)"$/m.exec(pyproject)?.[1];
  assert.ok(declared, 'pyproject.toml declares requires-python as ">=<major>.<minor>"');
  const release = pythonMinor();
  assert.equal(declared, `>=${release}`, `requires-python ${declared} must state the tested minor release of the python of mise.toml (${release})`);
});
