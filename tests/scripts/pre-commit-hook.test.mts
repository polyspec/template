// The pre-commit hook is a tracked hook of config/checklist.json (kit's hooks, K-generated-files): git runs it before
// each commit, and it refuses a staged generated path through make staged-generated-hook, the check that AGENTS.md
// "Generated files" and the rule of the links name as their enforcement.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repository = resolve('.');
const read = (file: string) => readFileSync(join(repository, file), 'utf8');

test('config/checklist.json lists the pre-commit hook with the pre-push hook', () => {
  const config = JSON.parse(read('config/checklist.json')) as { hooks: string[] };
  assert.deepEqual(config.hooks, ['pre-commit', 'pre-push']);
});

test('.githooks/pre-commit is executable and runs make staged-generated-hook', () => {
  const hook = join(repository, '.githooks/pre-commit');
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'the hook is not executable');
  assert.match(read('.githooks/pre-commit'), /^exec make --no-print-directory staged-generated-hook$/m);
});

test('core.hooksPath is .githooks, so git runs the tracked pre-commit hook', () => {
  const hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: repository, encoding: 'utf8' }).trim();
  assert.equal(hooksPath, '.githooks');
});
