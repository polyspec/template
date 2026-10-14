// Tests the state semantics of scripts/process-group.mts (T22.5-7) with an injected kill. ESRCH means the group has
// ended. EPERM means a member of the group is in exit: no signal can reach it, so no signal is sent, and the wait
// continues until ESRCH. An EPERM that persists past the deadline is an error that names the pgid and the errno.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { stopProcessGroup, type Kill } from '../../scripts/process-group.mts';

// An exited child, so that stopProcessGroup only waits for the group. Its PID is never signaled: the fake kill
// receives every call. The fake allows at most 200 calls; a caller that still waits after that is reported as
// `capped` instead of running on, so that a failing test ends.
const exitedChild = () => Object.assign(new EventEmitter(), { pid: 4242, exitCode: 0, signalCode: null });

interface KillCall {
  pid: number;
  signal: NodeJS.Signals | number;
}

function fakeKill(behave: (n: number, signal: NodeJS.Signals | number) => string | undefined) {
  const calls: KillCall[] = [];
  const kill: Kill = (pid, signal) => {
    calls.push({ pid, signal });
    if (calls.length > 200) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    const error = behave(calls.length, signal);
    if (error) throw Object.assign(new Error(`kill ${error}`), { code: error });
  };
  return { kill, calls, capped: () => calls.length > 200 };
}

const signals = (calls: KillCall[]) => calls.filter(call => call.signal !== 0);

test('EPERM on the group probe means exiting: no signal is sent, and the wait ends at ESRCH', { timeout: 5000 }, async () => {
  const fake = fakeKill(n => (n <= 3 ? 'EPERM' : 'ESRCH'));
  await stopProcessGroup(exitedChild(), 'SIGKILL', fake.kill);
  assert.equal(fake.capped(), false, 'the wait kept probing after the group had ended');
  assert.deepEqual(signals(fake.calls), [], 'a signal was sent to a group that is exiting');
  assert.equal(fake.calls.length, 4, 'the wait did not probe again after EPERM until ESRCH');
});

test('EPERM on the signal after a successful probe sends no further signal, and the wait ends at ESRCH', { timeout: 5000 }, async () => {
  const fake = fakeKill((n, signal) => {
    if (n === 1) return undefined;
    if (signal === 'SIGKILL') return 'EPERM';
    return n <= 4 ? 'EPERM' : 'ESRCH';
  });
  await stopProcessGroup(exitedChild(), 'SIGKILL', fake.kill);
  assert.equal(fake.capped(), false, 'the wait kept probing after the group had ended');
  assert.equal(signals(fake.calls).length, 1, 'a signal was sent after the group reported EPERM');
});

test('ESRCH on the group probe means the group has ended, so no signal is sent', { timeout: 5000 }, async () => {
  const fake = fakeKill(() => 'ESRCH');
  await stopProcessGroup(exitedChild(), 'SIGKILL', fake.kill);
  assert.equal(fake.capped(), false, 'the wait kept probing a group that had ended');
  assert.deepEqual(signals(fake.calls), []);
});

test('EPERM that persists past the deadline is an error naming the pgid, the errno and the elapsed time', { timeout: 5000 }, async () => {
  const fake = fakeKill(() => 'EPERM');
  const error = await stopProcessGroup(exitedChild(), 'SIGKILL', fake.kill, 50).then(() => undefined, (rejection: unknown) => rejection);
  assert.equal(fake.capped(), false, 'the wait did not stop at its deadline');
  assert.ok(error instanceof Error, 'a group that stays exiting must not resolve as ended');
  assert.ok('code' in error && 'pgid' in error, `the error names no code and pgid: ${error.message}`);
  assert.equal(error.code, 'EPERM');
  assert.equal(error.pgid, 4242);
  assert.match(error.message, /process group 4242: kill\(-4242, 0\) returned EPERM for \d+ ms/);
  assert.deepEqual(signals(fake.calls), [], 'a signal was sent to a group that is exiting');
});

test('any other error of the group probe is thrown', { timeout: 5000 }, async () => {
  const fake = fakeKill(() => 'EINVAL');
  await assert.rejects(stopProcessGroup(exitedChild(), 'SIGKILL', fake.kill), { code: 'EINVAL' });
});
