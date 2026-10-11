// Tests that the callers that start a command in its own process group leave no process of the group when they
// resolve (T19.13): `runBounded` and `runStep` of tests/runner/bounded.mjs, which the generated conformance runners
// use, and `runStep` of the VS Code integration test, whose caller removes the profile directories next. A command
// that starts a background process and exits, or that is killed at its deadline, left that process running.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runBounded, runStep } from '../runner/bounded.mjs';
import { runStep as runIntegrationStep } from '../../packages/template-vscode/tests/integration/step.mjs';

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: no process has the ID. EPERM: a process of another user has it now, so the background process, which ran
    // as this user, has ended and its ID was reused.
    if (error.code === 'ESRCH' || error.code === 'EPERM') return false;
    throw error;
  }
};

// The background process starts running only after this delay, as a member does under load, so the leader may exit or
// reach its deadline before the member runs.
const MEMBER_START_MS = 5_000;

// The code of the background process, which runs on after MEMBER_START_MS.
const background = `setTimeout(() => setInterval(() => {}, 1000), ${MEMBER_START_MS})`;

// A node command that starts a background process of its group. The leader writes the process ID of that member into
// `file` before it continues, so the file exists whatever the start of the member, then waits `leaderMs` and exits, or
// runs on without an end.
function command(file, leaderMs) {
  const leader = leaderMs === undefined ? 'setInterval(() => {}, 1000)' : `setTimeout(() => process.exit(0), ${leaderMs})`;
  return ['-e', `const member = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(background)}], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(file)}, String(member.pid)); ${leader}`];
}

// The shell leader of the case after its deadline: the shell forks the member and writes its pid at fork time, then
// execs sleep, so the leader runs until the deadline. Arguments: the node executable, the background code and the pid
// file. The deadline of that case is 10 s, about 100 times the time the leader needs before the file exists (up to
// 98.5 ms under load 40). It protects that the member exists before the deadline fires, so the test can read its pid.
const SHELL_LEADER = '"$0" -e "$1" & echo $! > "$2"; exec sleep 600';
const DEADLINE_MS = 10_000;
function deadlineCommand(file) {
  return ['-c', SHELL_LEADER, process.execPath, background, file];
}

for (const [name, start] of [
  ['runBounded after the command exits', file => runBounded(process.execPath, command(file, 300), { cwd: tmpdir(), timeoutMs: 60_000 })],
  ['runBounded after the deadline', file => runBounded('/bin/sh', deadlineCommand(file), { cwd: tmpdir(), timeoutMs: DEADLINE_MS })],
  ['runStep of the generated runners', file => runStep(process.execPath, command(file, 300), { cwd: tmpdir() })],
  ['runStep of the VS Code integration test', file => runIntegrationStep('probe', process.execPath, command(file, 300), { env: process.env, output: () => {}, log: () => {} })],
]) {
  test(`${name} leaves no process of the group`, async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'template-group-callers-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'background.pid');
    await start(file);
    const pid = Number(readFileSync(file, 'utf8'));
    const running = alive(pid);
    if (running) process.kill(pid, 'SIGKILL');
    assert.equal(running, false, `the background process ${pid} of the group still ran when ${name} resolved`);
  });
}
