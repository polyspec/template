// Steps of the generated conformance runners. A long step, such as a compiler, runs without a time
// limit and is judged by its exit status. The step of one case runs a command in its own process
// group, or a function in a worker, and is stopped when it outlives its deadline, so one case that
// does not end fails by its name instead of stopping the run.
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { stopProcessGroup } from '../../scripts/process-group.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

/** Progress lines on standard output: start, a line every 5 s while running, result with elapsed time. */
export function stepProgress() {
  return createProgress({ write: text => process.stdout.write(text) });
}

/**
 * Runs a long step, such as a compiler, without a time limit and resolves
 * `{ status, stdout, stderr }`; the step is judged by its exit status and its output.
 */
export async function runStep(command, args, { cwd, env, stdio = 'pipe' }) {
  const { status, stdout, stderr } = await run(command, args, { cwd, env, stdio });
  return { status, stdout, stderr };
}

/**
 * Runs the command of one case and resolves `{ status, stdout, stderr, timedOut }`. A command
 * that runs longer than `timeoutMs` is killed with its process group and resolves with
 * `timedOut: true`.
 */
export function runBounded(command, args, { cwd, env, timeoutMs, stdio = 'pipe' }) {
  return run(command, args, { cwd, env, stdio, timeoutMs });
}

// Runs a command in its own process group; without `timeoutMs` it has no time limit. It resolves after no process of
// the group is left, also a background process that the command started and left running (T19.13).
function run(command, args, { cwd, env, timeoutMs, stdio }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', stdio, stdio] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr?.setEncoding('utf8').on('data', data => { stderr += data; });
    let timedOut = false;
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group has ended */ }
    }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (status) => {
      clearTimeout(timer);
      stopProcessGroup(child).then(() => resolve({ status, stdout, stderr, timedOut }), reject);
    });
  });
}

/**
 * Runs the worker module `url` with `workerData` and resolves the first message it posts, or
 * `{ timedOut: true }` when it posts none within `timeoutMs`; the worker is then terminated.
 */
export function inWorker(url, workerData, timeoutMs) {
  return new Promise(resolve => {
    const worker = new Worker(url, { workerData });
    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => settle({ timedOut: true }), timeoutMs);
    worker.once('message', message => settle(message));
    worker.once('error', error => settle({ failure: error.stack ?? String(error) }));
    worker.once('exit', code => settle({ failure: `the worker exited with ${code} before it reported a result` }));
  });
}

export const seconds = milliseconds => `${milliseconds / 1000} s`;
