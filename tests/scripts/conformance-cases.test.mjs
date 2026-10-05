// Tests the case-filtered conformance (scripts/conformance-cases.mjs, `make conformance-cases`, T13.1-4): changed
// paths name their cases once each, every case runs in the AST runner and the four generated runners, a removed case
// has nothing to run, and a path outside a case directory fails with its name. No runner runs; the cases use
// --dry-run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { caseIds, RUNNERS } from '../../scripts/conformance-cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const run = (...args) => spawnSync(process.execPath, ['scripts/conformance-cases.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

test('changed paths name each case once', () => {
  assert.deepEqual(caseIds(['tests/cases/text/crlf-input/input.tpl', 'tests/cases/text/crlf-input/expected.html', 'tests/cases/data/null-assign']), {
    ids: ['text/crlf-input', 'data/null-assign'], errors: [],
  });
});

test('a case runs in every mode and a removed case has nothing to run', () => {
  const result = run('--dry-run', 'tests/cases/text/crlf-input/input.tpl', 'tests/cases/text/removed-case/input.tpl');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /text\/removed-case: the case directory does not exist; the case was removed and has nothing to run/);
  assert.deepEqual(result.stdout.match(/would run node .*/g), RUNNERS.map(runner => `would run node ${runner} --case text/crlf-input`));
});

test('a path outside a case directory fails with its name', () => {
  const result = run('--dry-run', 'tests/cases/README.md');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /tests\/cases\/README\.md: not a file or directory of a case/);
});

test('the make target passes CASES to the script', () => {
  const result = spawnSync('make', ['-n', '--no-print-directory', 'conformance-cases', 'CASES=tests/cases/text/crlf-input/input.tpl'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^node scripts\/conformance-cases\.mjs tests\/cases\/text\/crlf-input\/input\.tpl$/m);
});
