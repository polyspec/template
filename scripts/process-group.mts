// Stops a process group and waits until no process of it is left (T20.3, T19.13). A caller that started a
// command in its own group (`detached: true`) and removes the command's directory afterwards must wait: SIGKILL ends
// the processes of the group soon, not at once, and a process that is still running writes into the directory while it
// is removed, which fails with ENOTEMPTY.
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// A group whose probe answers EPERM has a member in exit, which the kernel refuses to signal; the group ends when that
// member has exited. Exits take milliseconds. A group that is still exiting after this long is an error, not an ended
// group, so a hang is reported with its pgid, errno and elapsed time.
export const EXITING_DEADLINE_MS = 10_000;

/** Sends a signal to a process or, with a negative pid, to a process group, as process.kill does. */
export type Kill = (pid: number, signal: NodeJS.Signals | number) => void;

/** The state of a process group after a signal or a probe. */
export type GroupState = 'sent' | 'ended' | 'exiting';

const signalProcess: Kill = (pid, signal) => {
  process.kill(pid, signal);
};

/**
 * Sends `signal` to the group `pgid` through `kill` and reports the state of the group: 'sent' when the group received
 * it, 'ended' when no process has the ID (ESRCH), and 'exiting' when a member is in exit (EPERM; observed on macOS while
 * a member has left the process table and still answers kill(pid, 0)). A caller sends no further signal after 'exiting'.
 * Any other error is thrown.
 */
export function signalGroup(pgid: number, signal: NodeJS.Signals | number, kill: Kill = signalProcess): GroupState {
  try {
    kill(-pgid, signal);
    return 'sent';
  } catch (error) {
    // process.kill throws an errno error; a test's kill throws an object with the same code.
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'ESRCH') return 'ended';
    if (code === 'EPERM') return 'exiting';
    throw error;
  }
}

/**
 * Lists the processes whose process group is `pgid`, one ps line each, with the pid, parent, group, state, elapsed
 * time and command. A group that the probe still sees is listed here, so a group whose members this process did not
 * start can be told apart from its own members. A failing ps is reported in the text, not hidden.
 */
export function groupMembers(pgid: number): string {
  const result = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,etime=,command='], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return `ps could not list the processes (${result.error?.message ?? `exit status ${result.status}: ${result.stderr}`.trim()})`;
  }
  const lines = result.stdout.split('\n').filter(line => line.trim().split(/\s+/)[2] === String(pgid));
  return lines.length > 0 ? lines.join('\n') : `ps lists no process of group ${pgid}`;
}

/**
 * Sends `signal` to the process group of `child`, whose process leads it, and resolves when `child` has exited and the
 * group has ended (ESRCH). The group is probed until ESRCH because no event reports the end of a group of processes
 * that are not children of this process. While the probe answers 'sent', the loop sends `signal` to the group again on
 * each probe, so a member that was created while the first signal was delivered, and so missed it, is signaled too. A
 * process group id is not reused while one of its members exists, and the loop stops sending once the probe answers
 * ESRCH; the only window is between a successful probe and the next signal, in which the last member may exit and a new
 * group may take the id. While it waits longer than a second it says so once on stderr, with the processes of the group
 * that ps lists. A group that stays 'exiting' longer than `exitingDeadlineMs` rejects with an error that names its pgid,
 * the errno and the elapsed time. `kill` sends the signal (`process.kill` by default).
 */
/** The parts of a child process that stopProcessGroup reads: its pid, its exit state and its exit event. */
export interface GroupLeader {
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  once(event: 'exit', listener: () => void): unknown;
}

export async function stopProcessGroup(child: GroupLeader, signal: NodeJS.Signals | number = 'SIGKILL', kill: Kill = signalProcess, exitingDeadlineMs: number = EXITING_DEADLINE_MS): Promise<void> {
  const pgid = child.pid;
  if (pgid === undefined) throw new Error('the child process has no pid; it did not start, so it leads no process group');
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>(resolve => child.once('exit', () => resolve()));
  if (signalGroup(pgid, 0, kill) === 'sent') signalGroup(pgid, signal, kill);
  await exited;
  const started = Date.now();
  let said = false;
  let exitingSince: number | undefined;
  for (let state = signalGroup(pgid, 0, kill); state !== 'ended'; state = signalGroup(pgid, 0, kill)) {
    const now = Date.now();
    if (state === 'exiting') {
      exitingSince ??= now;
      if (now - exitingSince > exitingDeadlineMs) {
        throw Object.assign(
          new Error(`process group ${pgid}: kill(-${pgid}, 0) returned EPERM for ${now - exitingSince} ms, past the deadline of ${exitingDeadlineMs} ms; the group is still exiting`),
          { code: 'EPERM', pgid, elapsedMs: now - exitingSince },
        );
      }
    }
    if (state === 'sent') signalGroup(pgid, signal, kill);
    if (!said && now - started > 1000) {
      process.stderr.write(`waiting for the processes of group ${pgid} to exit\n${groupMembers(pgid)}\n`);
      said = true;
    }
    await sleep(10);
  }
}
