// Tests the guard of the full suite (scripts/full-run.mjs): `make check` starts the guard before any step, the guard
// refuses while a checklist item is `[~]`, while tracked changes are uncommitted and when the current tree already has
// a full run, it records each target as the run proceeds, and `make rerun-failed` reruns only the targets of the
// current tree that did not pass. The guard also refuses while the pre-push hook is not installed (T17.1-3). The targets
// of these tests are stubs; no test runs a real target.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { activeItems, decide, fullRun, LOCK, RECORD, toolchainVersions } from '../../scripts/full-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CHECKLIST = `# Execution checklist

- The last column of every task row is its state: \`[ ]\` waiting, \`[~]\` in progress, \`[o]\` done.

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T1.1 | Write the parser | \`make test-ts\` | [o] |
| T1.2 | Print \`a \\| b\` for a union | \`make test-ts\` | [~] |
| T1.2-1 | Name the union members | \`make test-ts\` | [ ] |
| T1.3 | Remove the old runner | \`make test-scripts\` | [!] cause: blocked; retry: T1.2 done |
`;

const DONE = CHECKLIST.replace('| [~] |', '| [o] |');

// The commands that make prints for `target` without running them. A make started by another make, as `make check`
// starts `make test-scripts`, prints `Entering directory` lines with GNU Make 4 (T17.1-4); MAKEFLAGS=w makes every make
// print them, and --no-print-directory removes them, so the lines are the commands on every make.
function dryRun(target) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

// A Git checkout with a committed checklist and the installed pre-push hook, unless `hooks` is false.
function checkout(t, checklist, { hooks = true } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-full-run-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(directory, 'docs/plans/execution-checklist.md'), checklist);
  writeFileSync(path.join(directory, '.gitignore'), '/var/\n');
  mkdirSync(path.join(directory, '.githooks'));
  writeFileSync(path.join(directory, '.githooks/pre-push'), '#!/bin/sh\n');
  chmodSync(path.join(directory, '.githooks/pre-push'), 0o755);
  git(directory, 'init', '--quiet');
  git(directory, 'add', '.');
  git(directory, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'checklist');
  if (hooks) git(directory, 'config', 'core.hooksPath', '.githooks');
  return directory;
}

const commit = (directory, file, text) => {
  writeFileSync(path.join(directory, file), text);
  git(directory, 'add', file);
  git(directory, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', file);
};

const record = directory => JSON.parse(readFileSync(path.join(directory, RECORD), 'utf8'));

const ENVIRONMENT = { node: 'v26.8.1', npm: '12.2.0', go: 'go1.27.1', cargo: 'cargo 1.98.1', php: '8.5.11', composer: 'Composer version 2.10.3' };

// Runs the guard with stub targets that pass unless they are named in `failing`; returns the exit status, the
// printed lines and the targets that ran.
async function guard(directory, mode, targets, failing = []) {
  const lines = [];
  const ran = [];
  const status = await fullRun({
    root: directory,
    mode,
    targets,
    print: line => lines.push(line),
    environment: () => ENVIRONMENT,
    runTarget: async name => {
      // The record names the target as running while it runs, with the run still incomplete.
      const current = record(directory);
      assert.equal(current.result, 'incomplete');
      assert.equal(current.targets.find(target => target.name === name).status, 'running');
      ran.push(name);
      return !failing.includes(name);
    },
  });
  return { status, output: lines.join('\n'), ran };
}

test('make check and make rerun-failed start the guard before any step', () => {
  const check = dryRun('check');
  assert.match(check[0], /^node scripts\/full-run\.mjs run docs-check docs-static-check test-scripts /, check.join('\n'));
  assert.equal(check.length, 1, check.join('\n'));
  assert.deepEqual(dryRun('rerun-failed'), ['node scripts/full-run.mjs rerun-failed']);
});

test('the active items are the task rows in state [~], with their titles', () => {
  assert.deepEqual(activeItems(CHECKLIST), [{ id: 'T1.2', title: 'Print `a \\| b` for a union' }]);
  assert.deepEqual(activeItems(DONE), []);
});

test('the decision refuses an active item, a dirty tree and a second run of a tree', () => {
  const clean = { mode: 'run', targets: ['a', 'b'], active: [], dirty: [], hooks: null, tree: 'tree-1', record: null, running: false };
  const fresh = decide(clean);
  assert.equal(fresh.run, true);
  assert.deepEqual(fresh.targets, ['a', 'b']);
  assert.match(fresh.reason, /no full-run record/);

  const active = decide({ ...clean, active: [{ id: 'T1.2', title: 'Print a union' }] });
  assert.equal(active.run, false);
  assert.match(active.reason, /1 active checklist item[\s\S]*T1\.2 Print a union/);

  const hooks = decide({ ...clean, hooks: 'core.hooksPath is not .githooks; run make hooks' });
  assert.equal(hooks.run, false);
  assert.match(hooks.reason, /the pre-push hook is not installed: core\.hooksPath is not \.githooks; run make hooks/);
  assert.equal(decide({ ...clean, mode: 'rerun-failed', hooks: 'x' }).run, false);

  const dirty = decide({ ...clean, dirty: [' M Makefile'] });
  assert.equal(dirty.run, false);
  assert.match(dirty.reason, /uncommitted tracked changes[\s\S]*M Makefile/);

  const earlier = { tree: 'tree-1', commit: 'c1', result: 'passed', started: '2026-10-05T01:00:00.000Z', targets: [{ name: 'a', status: 'passed' }, { name: 'b', status: 'passed' }] };
  const second = decide({ ...clean, record: earlier });
  assert.equal(second.run, false);
  assert.match(second.reason, /full run of tree tree-1 \(commit c1\) started 2026-10-05T01:00:00\.000Z with result passed/);

  const changed = decide({ ...clean, tree: 'tree-2', record: earlier });
  assert.equal(changed.run, true);
  assert.match(changed.reason, /differs from the tree tree-1/);
  assert.equal(decide({ ...clean, tree: 'tree-2', record: earlier, active: [{ id: 'T1.2', title: 'x' }] }).run, false);

  const running = decide({ ...clean, tree: 'tree-2', record: { ...earlier, result: 'incomplete', pid: 42 }, running: true });
  assert.equal(running.run, false);
  assert.match(running.reason, /process 42 is still running/);
});

test('the decision of rerun-failed needs a record of the current tree with targets that did not pass', () => {
  const clean = { mode: 'rerun-failed', targets: [], active: [], dirty: [], hooks: null, tree: 'tree-1', record: null, running: false };
  assert.match(decide(clean).reason, /no full-run record/);
  assert.equal(decide(clean).run, false);
  const failed = { tree: 'tree-1', commit: 'c1', result: 'failed', started: 's', targets: [{ name: 'a', status: 'passed' }, { name: 'b', status: 'failed' }, { name: 'c', status: 'pending' }] };
  assert.equal(decide({ ...clean, tree: 'tree-2', record: failed }).run, false);
  assert.match(decide({ ...clean, tree: 'tree-2', record: failed }).reason, /verified tree tree-1, not the current tree tree-2/);
  assert.deepEqual(decide({ ...clean, record: failed }).targets, ['b', 'c']);
  assert.equal(decide({ ...clean, record: { ...failed, result: 'passed', targets: [{ name: 'a', status: 'passed' }] } }).run, false);
  assert.equal(decide({ ...clean, record: failed, dirty: [' M x'] }).run, false);
});

test('a checklist with an active item refuses the run before any target', async t => {
  const directory = checkout(t, CHECKLIST);
  const { status, output, ran } = await guard(directory, 'run', ['a', 'b']);
  assert.equal(status, 1);
  assert.deepEqual(ran, []);
  assert.match(output, /^\[full-run\] refuse: 1 active checklist item/);
  assert.match(output, /T1\.2 Print `a \\\| b` for a union/);
});

test('a checkout without the installed pre-push hook is refused before any target', async t => {
  const directory = checkout(t, DONE, { hooks: false });
  const { status, output, ran } = await guard(directory, 'run', ['a']);
  assert.equal(status, 1);
  assert.deepEqual(ran, []);
  assert.match(output, /^\[full-run\] refuse: the pre-push hook is not installed: core\.hooksPath is not \.githooks/);
});

test('a dirty tree is refused', async t => {
  const directory = checkout(t, DONE);
  writeFileSync(path.join(directory, '.gitignore'), '/var/\n/build/\n');
  const { status, output, ran } = await guard(directory, 'run', ['a']);
  assert.equal(status, 1);
  assert.deepEqual(ran, []);
  assert.match(output, /uncommitted tracked changes[\s\S]*M \.gitignore/);
});

test('a full run records each target, and the same tree is refused a second time', async t => {
  const directory = checkout(t, DONE);
  const first = await guard(directory, 'run', ['a', 'b', 'c']);
  assert.equal(first.status, 0, first.output);
  assert.deepEqual(first.ran, ['a', 'b', 'c']);
  assert.match(first.output, /^\[full-run\] run: no full-run record/);
  const written = record(directory);
  assert.equal(written.tree, git(directory, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(written.result, 'passed');
  assert.ok(written.ended);
  assert.deepEqual(written.targets.map(target => target.status), ['passed', 'passed', 'passed']);

  const second = await guard(directory, 'run', ['a', 'b', 'c']);
  assert.equal(second.status, 1);
  assert.deepEqual(second.ran, []);
  assert.match(second.output, new RegExp(`refuse: the full run of tree ${written.tree} \\(commit ${written.commit}\\) started ${written.started} with result passed`));

  commit(directory, 'next.txt', 'next\n');
  const changed = await guard(directory, 'run', ['a']);
  assert.equal(changed.status, 0, changed.output);
  assert.match(changed.output, /differs from the tree/);
});

test('rerun-failed without a record is refused', async t => {
  const directory = checkout(t, DONE);
  const { status, output, ran } = await guard(directory, 'rerun-failed', []);
  assert.equal(status, 1);
  assert.deepEqual(ran, []);
  assert.match(output, /refuse: no full-run record/);
});

test('rerun-failed reruns only the failed targets, and a passing rerun completes the result', async t => {
  const directory = checkout(t, DONE);
  const first = await guard(directory, 'run', ['a', 'b', 'c'], ['b']);
  assert.equal(first.status, 1);
  assert.deepEqual(first.ran, ['a', 'b', 'c']);
  assert.equal(record(directory).result, 'failed');
  assert.match(first.output, /failed: b/);

  const failing = await guard(directory, 'rerun-failed', [], ['b']);
  assert.equal(failing.status, 1);
  assert.deepEqual(failing.ran, ['b']);
  assert.equal(record(directory).result, 'failed');

  const passing = await guard(directory, 'rerun-failed', []);
  assert.equal(passing.status, 0, passing.output);
  assert.deepEqual(passing.ran, ['b']);
  const completed = record(directory);
  assert.equal(completed.result, 'passed');
  assert.deepEqual(completed.targets.map(target => target.status), ['passed', 'passed', 'passed']);
  assert.equal(completed.reruns.length, 2);
  assert.deepEqual(completed.reruns.map(rerun => rerun.environment), [ENVIRONMENT, ENVIRONMENT], 'a rerun does not record the toolchains it ran on');

  const again = await guard(directory, 'rerun-failed', []);
  assert.equal(again.status, 1);
  assert.match(again.output, /passed; no target failed/);
});

test('a run that stops records the run as incomplete, and rerun-failed runs its unfinished targets', async t => {
  const directory = checkout(t, DONE);
  await assert.rejects(fullRun({
    root: directory,
    mode: 'run',
    targets: ['a', 'b', 'c'],
    print: () => {},
    environment: () => ENVIRONMENT,
    runTarget: async name => {
      if (name === 'b') throw new Error('stopped');
      return true;
    },
  }), /stopped/);
  const stopped = record(directory);
  assert.equal(stopped.result, 'incomplete');
  assert.deepEqual(stopped.targets.map(target => target.status), ['passed', 'running', 'pending']);
  stopped.pid = 2 ** 22 + 1;
  writeFileSync(path.join(directory, RECORD), JSON.stringify(stopped));

  const second = await guard(directory, 'run', ['a', 'b', 'c']);
  assert.equal(second.status, 1);
  assert.match(second.output, /with result incomplete/);
  const rerun = await guard(directory, 'rerun-failed', []);
  assert.equal(rerun.status, 0, rerun.output);
  assert.deepEqual(rerun.ran, ['b', 'c']);
  assert.equal(record(directory).result, 'passed');
});

test('the record of a run holds the version of each toolchain that the run ran on', async t => {
  const directory = checkout(t, DONE);
  const run = await guard(directory, 'run', ['a']);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(record(directory).environment, ENVIRONMENT);
  const versions = toolchainVersions(ROOT);
  assert.deepEqual(Object.keys(versions), ['node', 'npm', 'go', 'cargo', 'php', 'composer']);
  assert.equal(versions.node, process.version);
  assert.match(versions.php, /^\d+\.\d+\.\d+$/, `the PHP version of the record is ${versions.php}, not a patch version`);
});

test('a guard is refused while the guard of another run holds the lock of the record, and runs no target', async (t) => {
  // T19.12: two guards read the record, both decided to run and wrote the record in turn.
  const directory = checkout(t, DONE);
  const other = spawn('sleep', ['60'], { stdio: 'ignore' });
  t.after(() => other.kill());
  mkdirSync(path.join(directory, 'var'), { recursive: true });
  writeFileSync(path.join(directory, LOCK), `${JSON.stringify({ checkout: directory, pid: other.pid, started: '2026-10-05T00:00:00.000Z', token: 'other' })}\n`);
  const run = await guard(directory, 'run', ['a']);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, new RegExp(`^\\[full-run\\] refuse: .*full-run\\.json\\.lock is held by process ${other.pid} of the checkout .*; the guard of another run reads or writes var/full-run\\.json$`, 'm'));
  assert.deepEqual(run.ran, []);
  assert.equal(existsSync(path.join(directory, RECORD)), false, 'the refused guard wrote the record');
});

test('the guard releases the lock of the record after a run and after a target that throws', async (t) => {
  const directory = checkout(t, DONE);
  const run = await guard(directory, 'run', ['a']);
  assert.equal(run.status, 0, run.output);
  assert.equal(existsSync(path.join(directory, LOCK)), false, 'the lock stayed after the run');
  commit(directory, 'next.txt', 'next\n');
  await assert.rejects(fullRun({ root: directory, mode: 'run', targets: ['a'], print: () => {}, environment: () => ENVIRONMENT, runTarget: async () => { throw new Error('stopped'); } }), /stopped/);
  assert.equal(existsSync(path.join(directory, LOCK)), false, 'the lock stayed after a target that threw');
});

