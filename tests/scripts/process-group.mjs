// A test helper that stops a process group and waits until no process of it is left (T20.3). A test that started a
// command in its own group (`detached: true`) and removes the command's directory afterwards must wait: SIGKILL ends
// the processes of the group soon, not at once, and a process that is still running writes into the directory while it
// is removed, which fails with ENOTEMPTY.
import { setTimeout as sleep } from 'node:timers/promises';

/** Whether a process of the group `pgid` exists. */
function groupExists(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    // EPERM: a process of the group exists and belongs to another user.
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

/**
 * Sends `signal` to the process group of `child`, whose process leads it, and resolves when `child` has exited and no
 * process of the group is left. It has no time limit; while it waits longer than a second it says so once on stderr.
 */
export async function stopProcessGroup(child, signal = 'SIGKILL') {
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
  if (groupExists(child.pid)) process.kill(-child.pid, signal);
  await exited;
  const started = Date.now();
  let said = false;
  while (groupExists(child.pid)) {
    if (!said && Date.now() - started > 1000) {
      process.stderr.write(`waiting for the processes of group ${child.pid} to exit\n`);
      said = true;
    }
    await sleep(10);
  }
}
