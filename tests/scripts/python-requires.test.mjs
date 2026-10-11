// The Python support range of the package states what CI tests (T22.5-3): requires-python of
// packages/template-python/pyproject.toml is the minor release of .python-version and nothing older, because CI runs only
// that release (the python job of ci.yml sets up .python-version).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repository = resolve('.');

test('requires-python of the Python package is the minor release of .python-version (T22.5-3)', () => {
  const pyproject = readFileSync(join(repository, 'packages/template-python/pyproject.toml'), 'utf8');
  const declared = /^requires-python = "(>=\d+\.\d+)"$/m.exec(pyproject)?.[1];
  assert.ok(declared, 'pyproject.toml declares requires-python as ">=<major>.<minor>"');
  const minor = readFileSync(join(repository, '.python-version'), 'utf8').trim();
  assert.match(minor, /^\d+\.\d+$/, '.python-version holds the minor release');
  assert.equal(declared, `>=${minor}`, `requires-python ${declared} must state the tested minor release of .python-version (${minor})`);
});
