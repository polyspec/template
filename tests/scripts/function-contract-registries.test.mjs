// Tests that the registry checker reads the function registry of every language as the formatter of that language writes it
// (T22.4-34): `ruff format` writes the keys of the Python registry in double quotes and may break the arguments of a
// `BuiltIn(...)` over several lines, so a checker that reads one spelling finds no function and fails with the contract
// as the missing names. The test runs the checker on the tree and fails with its output.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the registries of all five languages hold the functions of the contract', () => {
  const run = spawnSync(process.execPath, ['scripts/check-function-contract.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`.slice(0, 1500));
});
