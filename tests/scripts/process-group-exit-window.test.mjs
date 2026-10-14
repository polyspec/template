// Tests that stopProcessGroup resolves only after the member of a group whose leader has exited is gone (T22.5-7,
// T24.3): kill(pid, 0) fails for the member once it resolves. The test records the pid of the leader and of the member
// and kills in t.after every recorded pid that it has not seen gone, so a failing or cancelled run leaves no process
// behind and a pid that another process may have taken since is not signaled; the member ends by itself after
// MEMBER_LIFE_MS in any case.
// Finding of the experiment that this test replaces (60 runs on macOS, T22.5-7): before the stop, the group probe
// answered ESRCH in 58 runs and EPERM in 2, in which the member, absent from `ps` and never in state Z, still answered
// kill(pid, 0). scripts/process-group.mjs therefore treats EPERM as a member in exit and waits for ESRCH, which
// tests/scripts/process-group-gone.test.mjs holds with an injected kill.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stopProcessGroup } from '../../scripts/process-group.mjs';

// The member outlives its leader by far, so the group still has it when the test stops the group.
const MEMBER_LIFE_MS = 60_000;

const answers = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};

const killIfRunning = pid => {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};

test('stopProcessGroup resolves only after the member of a group whose leader exited is gone', { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-exit-window-'));
  const pids = [];
  t.after(() => {
    for (const pid of pids) killIfRunning(pid);
    rmSync(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'member.pid');
  // The leader starts a member in its group, writes the member's pid and exits after 300 ms.
  const member = `setTimeout(() => {}, ${MEMBER_LIFE_MS})`;
  const leader = `const member = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(member)}], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(file)}, String(member.pid)); setTimeout(() => process.exit(0), 300)`;
  const child = spawn(process.execPath, ['-e', leader], { detached: true, stdio: 'ignore' });
  pids.push(child.pid);
  await new Promise(resolve => child.once('close', resolve));
  const memberPid = Number(readFileSync(file, 'utf8'));
  pids.push(memberPid);
  assert.equal(answers(memberPid), true, `the member ${memberPid} ended before the group was stopped`);
  await stopProcessGroup(child);
  assert.equal(answers(memberPid), false, `the member ${memberPid} still answers kill(pid, 0) after stopProcessGroup resolved`);
  // Both are gone: the leader was reaped before stopProcessGroup resolved, and the member no longer answers.
  pids.length = 0;
});
