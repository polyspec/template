// Tests the push gate (scripts/push-gate.mjs, T17.1-3): the tracked pre-push hook `.githooks/pre-push` refuses a push
// while a task of the checklist is `[~]` in a pushed commit or in the working tree, naming each task, and when it cannot
// read the checklist of a pushed commit; every make invocation sets `core.hooksPath` to `.githooks`, and `hooks-check`
// fails while it is not set or the hook is not executable; the CI command `commit <rev>` fails for a commit with a task
// in progress or without the executable hook, with a GitHub annotation for each line. Each case pushes from a
// temporary checkout, which holds a copy of the gate, the guard, the hook and the Makefile, to a temporary bare
// repository.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPIED = ['Makefile', 'scripts/push-gate.mjs', 'scripts/git-hooks.mjs', 'scripts/full-run.mjs', 'scripts/holder-lock.mjs', 'scripts/target-report.mjs', '.githooks/pre-push'];
const CHECKLIST_FILE = 'docs/plans/execution-checklist.md';

const CHECKLIST = `# Execution checklist

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T1.1 | Write the parser | \`make test-ts\` | [o] |
| T1.2 | Print a union | \`make test-ts\` | [~] |
| T1.3 | Remove the old runner | \`make test-scripts\` | [ ] |
`;
const DONE = CHECKLIST.replace('| [~] |', '| [o] |');

function run(cwd, command, args, options = {}) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', ...options });
}

function git(cwd, ...args) {
  const result = run(cwd, 'git', args);
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

// Commits the index as it is; commitAll adds every change of the working tree first.
const commitIndex = (directory, message) => {
  git(directory, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', message);
  return git(directory, 'rev-parse', 'HEAD');
};
const commitAll = (directory, message) => {
  git(directory, 'add', '--all');
  return commitIndex(directory, message);
};

// A checkout with the gate and a committed checklist, its hooks installed unless `install` is false, and a bare
// repository as its remote `origin`.
function checkout(t, checklist, { install = true } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-push-gate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const work = path.join(directory, 'work');
  const remote = path.join(directory, 'remote.git');
  for (const file of COPIED) {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(work, file));
  }
  chmodSync(path.join(work, '.githooks/pre-push'), 0o755);
  mkdirSync(path.join(work, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(work, CHECKLIST_FILE), checklist);
  git(directory, 'init', '--quiet', '--bare', remote);
  git(directory, 'init', '--quiet', '--initial-branch=main', work);
  git(work, 'remote', 'add', 'origin', remote);
  commitAll(work, 'checklist');
  if (install) git(work, 'config', 'core.hooksPath', '.githooks');
  return { work, remote };
}

const push = (work, ...refspecs) => run(work, 'git', ['push', '--quiet', 'origin', ...(refspecs.length ? refspecs : ['HEAD:refs/heads/main'])]);
const remoteHead = remote => run(remote, 'git', ['rev-parse', '--verify', '--quiet', 'refs/heads/main']).stdout.trim();
const gate = (work, args, env = {}) => run(work, process.execPath, ['scripts/push-gate.mjs', ...args], { env: { ...process.env, ...env } });

test('a push without a task in progress reaches the remote', t => {
  const { work, remote } = checkout(t, DONE);
  const pushed = push(work);
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.equal(remoteHead(remote), git(work, 'rev-parse', 'HEAD'));
});

test('a push whose commit has a task in progress is refused and names the task', t => {
  const { work, remote } = checkout(t, DONE);
  assert.equal(push(work).status, 0);
  const before = remoteHead(remote);
  writeFileSync(path.join(work, CHECKLIST_FILE), CHECKLIST);
  const active = commitAll(work, 'start T1.2');
  const pushed = push(work);
  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /push refused: checklist tasks are in progress \(docs\/plans\/execution-checklist\.md\)/);
  assert.match(pushed.stderr, new RegExp(`HEAD ${active.slice(0, 7)}: T1\\.2 Print a union`));
  assert.match(pushed.stderr, /A push happens only when no checklist task is \[~\] \(AGENTS\.md\)/);
  assert.match(pushed.stderr, /Complete each task \(\[o\] with its changelog entry, committed\), or mark it \[!\]/);
  assert.doesNotMatch(pushed.stderr, /no-verify/);
  assert.equal(remoteHead(remote), before);
});

test('a push is refused while the checklist of the working tree has a task in progress', t => {
  const { work, remote } = checkout(t, DONE);
  writeFileSync(path.join(work, CHECKLIST_FILE), CHECKLIST);
  const pushed = push(work);
  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /working tree: T1\.2 Print a union/);
  assert.doesNotMatch(pushed.stderr, /HEAD [0-9a-f]{7}:/);
  assert.equal(remoteHead(remote), '');
});

test('a push is refused when a pushed commit has no checklist', t => {
  const { work, remote } = checkout(t, DONE);
  git(work, 'rm', '--quiet', '--cached', CHECKLIST_FILE);
  const removed = commitIndex(work, 'remove the checklist');
  const pushed = push(work);
  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /push refused: the push gate cannot read the checklist/);
  assert.match(pushed.stderr, new RegExp(`HEAD ${removed.slice(0, 7)}: .*docs/plans/execution-checklist\\.md`));
  assert.equal(remoteHead(remote), '');
});

test('the deletion of a remote branch reads only the working tree', t => {
  const { work, remote } = checkout(t, DONE);
  assert.equal(push(work, 'HEAD:refs/heads/main', 'HEAD:refs/heads/other').status, 0);
  const deleted = push(work, ':refs/heads/other');
  assert.equal(deleted.status, 0, deleted.stderr);
  assert.equal(run(remote, 'git', ['rev-parse', '--verify', '--quiet', 'refs/heads/other']).stdout.trim(), '');
  writeFileSync(path.join(work, CHECKLIST_FILE), CHECKLIST);
  const refused = push(work, ':refs/heads/main');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /working tree: T1\.2 Print a union/);
  assert.notEqual(remoteHead(remote), '');
});

test('hooks-check fails until core.hooksPath is .githooks, and every make invocation sets it', t => {
  const { work } = checkout(t, DONE, { install: false });
  const missing = gate(work, ['hooks-check']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /core\.hooksPath is not \.githooks[\s\S]*make hooks/);

  const plain = run(work, 'make', ['-n', 'help']);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(git(work, 'config', 'core.hooksPath'), '.githooks');
  assert.equal(gate(work, ['hooks-check']).status, 0);

  git(work, 'config', '--unset', 'core.hooksPath');
  const installed = run(work, 'make', ['hooks']);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(git(work, 'config', 'core.hooksPath'), '.githooks');
  assert.match(installed.stdout, /\[push-gate\] the pre-push hook \.githooks\/pre-push is installed/);

  chmodSync(path.join(work, '.githooks/pre-push'), 0o644);
  const notExecutable = gate(work, ['hooks-check']);
  assert.equal(notExecutable.status, 1);
  assert.match(notExecutable.stderr, /\.githooks\/pre-push is not executable[\s\S]*make hooks/);
});

test('the tracked hook is executable and starts the gate', () => {
  assert.ok(statSync(path.join(ROOT, '.githooks/pre-push')).mode & 0o111);
  assert.match(git(ROOT, 'ls-files', '--stage', '.githooks/pre-push'), /^100755 /);
  assert.match(readFileSync(path.join(ROOT, '.githooks/pre-push'), 'utf8'), /^exec node scripts\/push-gate\.mjs hook\b/m);
});

test('the CI command fails for a commit with a task in progress and passes for a clean commit', t => {
  const { work } = checkout(t, DONE);
  const summary = path.join(work, '..', 'summary.md');
  const clean = gate(work, ['commit', 'HEAD'], { GITHUB_STEP_SUMMARY: summary });
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /\[push-gate\] commit [0-9a-f]{7}: no checklist task is in progress/);

  writeFileSync(path.join(work, CHECKLIST_FILE), CHECKLIST);
  commitAll(work, 'start T1.2');
  const active = gate(work, ['commit', 'HEAD'], { GITHUB_STEP_SUMMARY: summary });
  assert.equal(active.status, 1);
  assert.match(active.stdout, /^::error::push refused: checklist tasks are in progress/m);
  assert.match(active.stdout, /^::error::  commit [0-9a-f]{7}: T1\.2 Print a union$/m);
  assert.match(readFileSync(summary, 'utf8'), /T1\.2 Print a union/);
});

test('the CI command fails for a commit whose hook is missing or not executable', t => {
  const { work } = checkout(t, DONE);
  git(work, 'update-index', '--chmod=-x', '.githooks/pre-push');
  commitIndex(work, 'hook without mode');
  const mode = gate(work, ['commit', 'HEAD']);
  assert.equal(mode.status, 1);
  assert.match(mode.stdout, /^::error::.*\.githooks\/pre-push is tracked with mode 100644, not 100755/m);

  git(work, 'rm', '--quiet', '--cached', '.githooks/pre-push');
  commitIndex(work, 'no hook');
  const missing = gate(work, ['commit', 'HEAD']);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^::error::.*\.githooks\/pre-push is not tracked/m);
});

test('the push-gate workflow runs the CI command through make on every push and pull request', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/push-gate.yml'), 'utf8');
  assert.match(workflow, /\non:\n {2}push:\n {2}pull_request:\n/);
  assert.match(workflow, /\njobs:\n {2}push-gate:\n {4}runs-on: ubuntu-24\.04\n/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  // T20.1-8, T20.1-9: the job runs its tool through make and uploads the report of the target.
  assert.match(workflow, /- run: make ci-targets TARGETS="push-gate-commit"\n/);
  assert.match(workflow, /path: var\/report\/ci-targets\/\n/);
  const commands = spawnSync('make', ['--no-print-directory', '-n', 'push-gate-commit'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(commands.status, 0, commands.stderr);
  assert.match(commands.stdout, /^node scripts\/push-gate\.mjs commit HEAD$/m);
});
