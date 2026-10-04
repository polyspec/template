// Bounded steps of the generated conformance runners. A step runs a command in its own process
// group, or a function in a worker, and is stopped when it outlives its deadline, so one case that
// does not end fails by its name instead of stopping the run.
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

/** Progress lines on standard output: start, a line every 5 s while running, result with elapsed time. */
export function stepProgress() {
  return createProgress({ write: text => process.stdout.write(text) });
}

/**
 * Runs a command and resolves `{ status, stdout, stderr, timedOut }`. A command that runs longer
 * than `timeoutMs` is killed with its process group and resolves with `timedOut: true`.
 */
export function runBounded(command, args, { cwd, env, timeoutMs, stdio = 'pipe' }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', stdio, stdio] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr?.setEncoding('utf8').on('data', data => { stderr += data; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group has ended */ }
    }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr, timedOut }); });
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
