// Tests that the unit tests of the TypeScript packages and of the VS Code extension run through
// scripts/run-tests.mjs, which prints each test with its elapsed time and gives it its own timeout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The commands that make prints for `target` without running them. A make started by another make, as `make check`
// starts `make test-scripts`, prints `Entering directory` lines with GNU Make 4 (T17.1-4); MAKEFLAGS=w makes every make
// print them, and --no-print-directory removes them, so the lines are the commands on every make.
function commands(target) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n');
}

const RUNS_TESTS_DIRECTLY = /\bnpm (?:test|run test:extension)\b|\bvitest\b(?! --cwd)|\bnode --test\b/;

for (const [target, runner] of [
  ['test-ts', 'node scripts/run-tests.mjs vitest --cwd packages/template-ts'],
  ['test-language', 'node scripts/run-tests.mjs vitest --cwd packages/template-language'],
  ['test-lsp', 'node scripts/run-tests.mjs vitest --cwd packages/template-lsp'],
  ['test-codemirror', 'node scripts/run-tests.mjs vitest --cwd packages/template-codemirror'],
  ['test-vscode', 'node scripts/run-tests.mjs node --cwd packages/template-vscode -- tests/extension.test.mjs tests/integration-step.test.mjs'],
]) {
  test(`${target} runs its unit tests through scripts/run-tests.mjs`, () => {
    const lines = commands(target);
    assert.ok(lines.includes(runner), lines.join('\n'));
    assert.deepEqual(lines.filter(line => !line.startsWith('node scripts/run-tests.mjs') && RUNS_TESTS_DIRECTLY.test(line)), []);
  });
}
