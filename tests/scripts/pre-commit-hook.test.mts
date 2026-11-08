// The pre-commit hook is a tracked hook of HOOK_DECLARATION of the Makefile (kit K1099): git runs it before
// each commit, and it refuses a staged generated path through make staged-generated-hook, the check that AGENTS.md
// "Generated files" and the rule of the links name as their enforcement.
// The commit-msg hook, the other tracked hook of HOOK_DECLARATION (T27.1-64, T27.1-68), runs make commit-msg-hook with the file
// of the message, the message rules of make commit (T27.1-67).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repository = resolve('.');

test('.githooks/pre-commit is executable', () => {
  const hook = join(repository, '.githooks/pre-commit');
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'the hook is not executable');
});

test('.githooks/commit-msg is executable', () => {
  const hook = join(repository, '.githooks/commit-msg');
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'the hook is not executable');
});

test('core.hooksPath is .githooks, so git runs the tracked hooks', () => {
  const hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: repository, encoding: 'utf8' }).trim();
  assert.equal(hooksPath, '.githooks');
});
