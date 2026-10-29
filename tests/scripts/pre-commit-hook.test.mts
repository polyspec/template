// The pre-commit hook is a tracked hook of config/checklist.json (kit's hooks, K-generated-files): git runs it before
// each commit, and it refuses a staged generated path through make staged-generated-hook, the check that AGENTS.md
// "Generated files" and the rule of the links name as their enforcement.
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

test('config/checklist.json lists the pre-commit hook', () => {
  const config = checklistDocument.parse(read('config/checklist.json'), 'config/checklist.json');
  assert.deepEqual(config.hooks, ['pre-commit']);
});

test('.githooks/pre-commit is executable and runs make staged-generated-hook', () => {
  const hook = join(repository, '.githooks/pre-commit');
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'the hook is not executable');
  assert.match(read('.githooks/pre-commit'), /^make --no-print-directory commit-gates-hook \|\| exit 1$/m);
  assert.match(read('.githooks/pre-commit'), /^make --no-print-directory staged-generated-hook \|\| exit 1$/m);
});

test('core.hooksPath is .githooks, so git runs the tracked pre-commit hook', () => {
  const hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: repository, encoding: 'utf8' }).trim();
  assert.equal(hooksPath, '.githooks');
});
