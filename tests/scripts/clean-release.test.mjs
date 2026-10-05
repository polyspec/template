// Tests the clean release check scripts/check-clean-release.mjs (`make release-check`, T17.1-2): it refuses a source
// tree with changes, installs with `make install` and installs the browser in a detached worktree of HEAD, runs
// `make release-test-matrix` there and removes the worktree whether the matrix passes or fails. The fixture is a
// temporary Git repository with a copy of the script; `npm`, `node` and `make` are stubs on PATH that log their
// command and directory, so no dependency is installed and no suite runs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/check-clean-release.mjs';

function git(directory, ...args) {
  const run = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

// A committed repository with the script and a file `committed.txt`, and stubs that log into `calls.log`.
function fixture(t) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'template-clean-release-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repository = path.join(base, 'repository');
  mkdirSync(path.join(repository, 'scripts'), { recursive: true });
  copyFileSync(path.join(ROOT, SCRIPT), path.join(repository, SCRIPT));
  writeFileSync(path.join(repository, 'committed.txt'), 'committed\n');
  git(repository, 'init', '--quiet');
  git(repository, 'add', '.');
  git(repository, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'fixture');
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  const log = path.join(base, 'calls.log');
  writeFileSync(log, '');
  for (const name of ['npm', 'node', 'make']) {
    // make install passes; make release-test-matrix exits with STUB_MAKE_STATUS.
    const status = name === 'make' ? '$([ "$1" = release-test-matrix ] && echo "${STUB_MAKE_STATUS:-0}" || echo 0)' : '0';
    writeFileSync(path.join(bin, name), `#!/bin/sh\nfiles=$(ls | tr '\\n' ' ')\necho "${name} $* | $(pwd) | $files" >> "${log}"\nexit ${status}\n`);
    chmodSync(path.join(bin, name), 0o755);
  }
  const run = (env = {}) => spawnSync(process.execPath, [SCRIPT], {
    cwd: repository, encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...env },
  });
  const calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => {
    const [command, directory, files] = line.split(' | ');
    return { command, directory, files: files.split(/\s+/).filter(Boolean) };
  });
  const worktrees = () => git(repository, 'worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).length;
  return { repository, run, calls, worktrees };
}

test('the release check runs the matrix in a detached worktree of HEAD and removes it', (t) => {
  const release = fixture(t);
  const result = release.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const calls = release.calls();
  assert.deepEqual(calls.map(call => call.command.split(' ')[0] === 'node' ? 'node playwright install chromium' : call.command), ['make install', 'node playwright install chromium', 'make release-test-matrix']);
  assert.match(calls[1].command, /^node \S+\/node_modules\/@playwright\/test\/cli\.js install chromium$/);
  for (const call of calls) {
    assert.notEqual(call.directory, release.repository, `${call.command} ran in the source tree`);
    assert.deepEqual(call.files, ['committed.txt', 'scripts'], `${call.command} ran in a checkout without the committed files`);
  }
  assert.equal(new Set(calls.map(call => call.directory)).size, 1);
  assert.match(result.stdout, /^release: isolated clean checkout passed$/m);
  assert.equal(release.worktrees(), 1, 'the release check left its worktree');
});

test('the release check refuses a source tree with changes', (t) => {
  const release = fixture(t);
  writeFileSync(path.join(release.repository, 'uncommitted.txt'), 'change\n');
  const result = release.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release-check requires a clean source worktree/);
  assert.deepEqual(release.calls(), []);
  assert.equal(release.worktrees(), 1);
});

test('the release check removes its worktree when the matrix fails', (t) => {
  const release = fixture(t);
  const result = release.run({ STUB_MAKE_STATUS: '2' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /make release-test-matrix failed with status 2/);
  assert.equal(release.worktrees(), 1, 'the release check left its worktree');
});
