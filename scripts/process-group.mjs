// Stops a process group and waits until no process of it is left (T20.3, T19.13). A caller that started a
// command in its own group (`detached: true`) and removes the command's directory afterwards must wait: SIGKILL ends
// the processes of the group soon, not at once, and a process that is still running writes into the directory while it
// is removed, which fails with ENOTEMPTY.
import { setTimeout as sleep } from 'node:timers/promises';

// A group whose probe answers EPERM has a member in exit, which the kernel refuses to signal; the group ends when that
// member has exited. Exits take milliseconds. A group that is still exiting after this long is an error, not an ended
// group, so a hang is reported with its pgid, errno and elapsed time.
export const EXITING_DEADLINE_MS = 10_000;

const signalProcess = (pid, signal) => process.kill(pid, signal);

/**
 * Sends `signal` to the group `pgid` through `kill` and reports the state of the group: 'sent' when the group received
 * it, 'ended' when no process has the ID (ESRCH), and 'exiting' when a member is in exit (EPERM; observed on macOS while
 * a member has left the process table and still answers kill(pid, 0)). A caller sends no further signal after 'exiting'.
 * Any other error is thrown.
 */
export function signalGroup(pgid, signal, kill = signalProcess) {
  try {
    kill(-pgid, signal);
    return 'sent';
  } catch (error) {
    if (error.code === 'ESRCH') return 'ended';
    if (error.code === 'EPERM') return 'exiting';
    throw error;
  }
}

/**
 * Sends `signal` to the process group of `child`, whose process leads it, and resolves when `child` has exited and the
 * group has ended (ESRCH). The group is probed until ESRCH because no event reports the end of a group of processes
 * that are not children of this process. While it waits longer than a second it says so once on stderr. A group that
 * stays 'exiting' longer than `exitingDeadlineMs` rejects with an error that names its pgid, the errno and the elapsed
 * time. `kill` sends the signal (`process.kill` by default).
 */
export async function stopProcessGroup(child, signal = 'SIGKILL', kill = signalProcess, exitingDeadlineMs = EXITING_DEADLINE_MS) {
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
  if (signalGroup(child.pid, 0, kill) === 'sent') signalGroup(child.pid, signal, kill);
  await exited;
  const started = Date.now();
  let said = false;
  let exitingSince;
  for (let state = signalGroup(child.pid, 0, kill); state !== 'ended'; state = signalGroup(child.pid, 0, kill)) {
    const now = Date.now();
    if (state === 'exiting') {
      exitingSince ??= now;
      if (now - exitingSince > exitingDeadlineMs) {
        const error = new Error(`process group ${child.pid}: kill(-${child.pid}, 0) returned EPERM for ${now - exitingSince} ms, past the deadline of ${exitingDeadlineMs} ms; the group is still exiting`);
        error.code = 'EPERM';
        error.pgid = child.pid;
        error.elapsedMs = now - exitingSince;
        throw error;
      }
    }
    if (!said && now - started > 1000) {
      process.stderr.write(`waiting for the processes of group ${child.pid} to exit\n`);
      said = true;
    }
    await sleep(10);
  }
}
