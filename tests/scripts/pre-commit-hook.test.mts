// The pre-commit hook is a tracked hook of HOOK_DECLARATION of the Makefile (kit K1099): git runs it before
// each commit, and it refuses a staged generated path through make staged-generated-hook, the check that AGENTS.md
// "Generated files" and the rule of the links name as their enforcement.
// The commit-msg hook, the other tracked hook of HOOK_DECLARATION (T27.1-64, T27.1-68), runs make commit-msg-hook with the file
// of the message, the message rules of make commit (T27.1-67).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repository = resolve('.');
const read = (file: string) => readFileSync(join(repository, file), 'utf8');

test('HOOK_DECLARATION of the Makefile declares the hooks pre-commit and commit-msg of .githooks', () => {
  const declaration = /^HOOK_DECLARATION := (.*)$/m.exec(read('Makefile'))?.[1] ?? '';
  assert.deepEqual([...declaration.matchAll(/--hook (\S+)/g)].map(match => match[1]), ['pre-commit', 'commit-msg']);
  assert.match(declaration, /^--hooks-path \.githooks /);
});

test('.githooks/pre-commit is executable and runs make staged-generated-hook', () => {
  const hook = join(repository, '.githooks/pre-commit');
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'the hook is not executable');
  assert.match(read('.githooks/pre-commit'), /^make --no-print-directory staged-generated-hook \|\| exit 1$/m);
});

test('.githooks/commit-msg is executable and runs make commit-msg-hook with the message file', () => {
  const hook = join(repository, '.githooks/commit-msg');
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'the hook is not executable');
  assert.match(read('.githooks/commit-msg'), /^exec make --no-print-directory commit-msg-hook MESSAGE="\$1"$/m);
});

test('core.hooksPath is .githooks, so git runs the tracked hooks', () => {
  const hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: repository, encoding: 'utf8' }).trim();
  assert.equal(hooksPath, '.githooks');
});
