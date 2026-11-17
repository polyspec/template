// Steps of the generated conformance runners. Every step, a compiler or the command of one case, runs in its own process
// group or a function in a worker, without a time limit, and is judged by its exit status, its output or the message of
// its worker; no step is cut off by time (T28.146).
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { stopProcessGroup } from '../../scripts/process-group.mts';
import { createProgress } from '@polyspec/kit/test-progress';

/** Progress lines on standard output: start, a line every 5 s while running, result with elapsed time. */
export function stepProgress(): ReturnType<typeof createProgress> {
  return createProgress({ write: text => process.stdout.write(text) });
}

/** The standard streams of a step: captured as text (`pipe`) or passed to this process (`inherit`). */
export type StepStdio = 'pipe' | 'inherit';

/** The options of a step: its working directory, environment and streams. */
export interface StepOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  stdio?: StepStdio | undefined;
}

/** The outcome of a step: its exit status (null when a signal ended it) and its captured output. */
export interface StepResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs a step without a time limit in its own process group and resolves `{ status, stdout, stderr }` after no process of
 * the group is left, also a background process that the command started and left running (T19.13); the step is judged by
 * its exit status and its output.
 */
export function runStep(command: string, args: readonly string[], { cwd, env, stdio = 'pipe' }: StepOptions): Promise<StepResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', stdio, stdio] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (data: string) => { stdout += data; });
    child.stderr?.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (status) => {
      stopProcessGroup(child).then(() => resolve({ status, stdout, stderr }), reject);
    });
  });
}

/**
 * Runs the worker module `url` with `workerData` without a time limit and resolves the first message it posts, or its
 * error or exit; the worker is then terminated.
 */
export function inWorker<Message>(url: URL, workerData: unknown): Promise<Message | { failure: string }> {
  return new Promise(resolve => {
    const worker = new Worker(url, { workerData });
    let settled = false;
    const settle = (result: Message | { failure: string }): void => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      resolve(result);
    };
    // The message is what the worker module posts, the type `Message` that its caller names.
    worker.once('message', (message: Message) => settle(message));
    worker.once('error', (error: Error) => settle({ failure: error.stack ?? String(error) }));
    worker.once('exit', (code: number) => settle({ failure: `the worker exited with ${code} before it reported a result` }));
  });
}
