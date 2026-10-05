// Tests that the callers that start a command in its own process group leave no process of the group when they
// resolve (T19.13): `runBounded` and `runStep` of tests/runner/bounded.mjs, which the generated conformance runners
// use, and `runStep` of the VS Code integration test, whose caller removes the profile directories next. A command
// that starts a background process and exits, or that is killed at its deadline, left that process running.
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
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

// A node command that starts a background process of its group, which writes its process ID into `file` and runs on,
// then waits `leaderMs` and exits, or runs on without an end.
function command(file, leaderMs) {
  const background = `require('node:fs').writeFileSync(${JSON.stringify(file)}, String(process.pid)); setInterval(() => {}, 1000)`;
  const leader = leaderMs === undefined ? 'setInterval(() => {}, 1000)' : `setTimeout(() => process.exit(0), ${leaderMs})`;
  return ['-e', `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(background)}], { stdio: 'ignore' }); ${leader}`];
}

for (const [name, start] of [
  ['runBounded after the command exits', file => runBounded(process.execPath, command(file, 300), { cwd: tmpdir(), timeoutMs: 10_000 })],
  ['runBounded after the deadline', file => runBounded(process.execPath, command(file), { cwd: tmpdir(), timeoutMs: 500 })],
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
