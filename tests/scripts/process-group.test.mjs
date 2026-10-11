// Tests the helper scripts/process-group.mjs (T20.3): after it stops a process group whose processes keep
// writing into a directory, the directory can be removed, every time.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

import { stopProcessGroup } from '../../scripts/process-group.mjs';

// Each attempt starts writers, stops them and removes their directory; 20 attempts under the load of a full run take
// longer than the default 30 s of one test (T20.3-1).
test('a stopped process group writes nothing into a directory that is then removed', { timeout: 300_000 }, async () => {
  const failures = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const directory = mkdtempSync(path.join(tmpdir(), 'template-process-group-'));
    // Three background processes of the group create directories as fast as they can, among 50 names each, so that
    // the directory stays small and its removal fast.
    const child = spawn('sh', ['-c', `for n in 1 2 3; do (while :; do mkdir -p "${directory}/d$n/$((RANDOM % 50))"; done) & done; wait`], { detached: true, stdio: 'ignore' });
    await sleep(100);
    await stopProcessGroup(child);
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      failures.push(`${attempt}: ${error.code}`);
      await sleep(500);
      rmSync(directory, { recursive: true, force: true });
    }
  }
  assert.deepEqual(failures, [], 'a process of the stopped group still wrote into the directory');
});

// A member that a signal sent to the group missed, because it was created while the group was signaled, keeps running
// after the leader has exited. Through the kill seam the group answers the probe until the member ends, and a second
// SIGKILL to the group ends it. The stop must send that second signal; the fake member ends after 200 probes so that a
// stop without the second signal fails with an assertion, not a hang.
test('stopProcessGroup signals the group again while a member is still running', { timeout: 30_000 }, async () => {
  const pgid = 4242;
  const sent = [];
  let probes = 0;
  let alive = true;
  const kill = (pid, signal) => {
    assert.equal(pid, -pgid, 'the signal goes to the process group');
    if (signal === 0) {
      probes += 1;
      if (probes >= 200) alive = false;
      if (!alive) throw Object.assign(new Error('no process of the group'), { code: 'ESRCH' });
      return true;
    }
    sent.push(signal);
    if (sent.length >= 2) alive = false;
    return true;
  };
  const child = { pid: pgid, exitCode: 0, signalCode: null };
  await stopProcessGroup(child, 'SIGKILL', kill);
  assert.deepEqual(sent, ['SIGKILL', 'SIGKILL'], 'the group of a member that is still running received no second SIGKILL');
});
