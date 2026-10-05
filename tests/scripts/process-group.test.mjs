// Tests the helper tests/scripts/process-group.mjs (T20.3): after it stops a process group whose processes keep
// writing into a directory, the directory can be removed, every time.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

import { stopProcessGroup } from './process-group.mjs';

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
