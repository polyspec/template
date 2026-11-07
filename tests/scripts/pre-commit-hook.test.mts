// The pre-commit hook is a tracked hook of config/checklist.json (kit's hooks, K-generated-files): git runs it before
// each commit, and it refuses a staged generated path through make staged-generated-hook, the check that AGENTS.md
// "Generated files" and the rule of the links name as their enforcement.
// The commit-msg hook, the other tracked hook of config/checklist.json (T27.1-64), runs make commit-msg-hook with the file
// of the message, the message rules of make commit (T27.1-67).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { jsonDocument } from '../../scripts/json-document.mts';

const repository = resolve('.');
const read = (file: string) => readFileSync(join(repository, file), 'utf8');
const checklistDocument = jsonDocument<{ hooks: string[] }>('checklist config', {
  type: 'object',
  required: ['hooks'],
  properties: { hooks: { type: 'array', items: { type: 'string' } } },
});

test('config/checklist.json lists the pre-commit and commit-msg hooks', () => {
  const config = checklistDocument.parse(read('config/checklist.json'), 'config/checklist.json');
  assert.deepEqual(config.hooks, ['pre-commit', 'commit-msg']);
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
