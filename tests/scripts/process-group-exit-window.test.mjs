// Records what the group probe returns while a member of a process group is in exit (T22.5-7), and asserts the
// criterion of stopProcessGroup: it resolves only after kill(pid, 0) fails for the member. The window is rare, so the
// test does not require it to occur; the output names the probe results observed on this platform.
// Observed on macOS in this item (60 runs of this experiment): 58 runs with the group probe at ESRCH and kill(pid, 0)
// at ESRCH; 2 runs with the group probe at EPERM, kill(pid, 0) still succeeding and the pid absent from `ps`. No run
// showed the member in state Z. Linux: not observed in this item; this output records the result on the platform that
// runs it.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stopProcessGroup } from '../../scripts/process-group.mjs';

const RUNS = 40;
// The member starts running only after this delay, as a member does under load, so the leader may exit before it runs.
const MEMBER_START_MS = 5_000;

const probe = pgid => { try { process.kill(-pgid, 0); return 'ok'; } catch (error) { return error.code; } };
const memberSignal = pid => { try { process.kill(pid, 0); return 'ok'; } catch (error) { return error.code; } };

test('stopProcessGroup resolves only after kill(pid, 0) fails for the member, whatever the probe returns', { timeout: 300_000 }, async (t) => {
  const tally = {};
  for (let run = 0; run < RUNS; run += 1) {
    const directory = mkdtempSync(path.join(tmpdir(), 'template-exit-window-'));
    try {
      const file = path.join(directory, 'member.pid');
      // The leader starts a member in its group and writes the member's pid before it exits after 300 ms; the member
      // starts running after MEMBER_START_MS.
      const member = `setTimeout(() => setInterval(() => {}, 1000), ${MEMBER_START_MS})`;
      const leader = `const member = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(member)}], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(file)}, String(member.pid)); setTimeout(() => process.exit(0), 300)`;
      const child = spawn(process.execPath, ['-e', leader], { detached: true, stdio: 'ignore' });
      await new Promise(resolve => child.once('close', resolve));
      const pid = Number(readFileSync(file, 'utf8'));
      const before = probe(child.pid);
      await stopProcessGroup(child);
      const after = memberSignal(pid);
      const key = `probe before stop: ${before}; kill(pid, 0) after stop: ${after}`;
      tally[key] = (tally[key] ?? 0) + 1;
      assert.notEqual(after, 'ok', `the member ${pid} still answers kill(pid, 0) after stopProcessGroup resolved`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  t.diagnostic(`${process.platform}, ${RUNS} runs: ${JSON.stringify(tally)}`);
});
