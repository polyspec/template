// Steps of the generated conformance runners. A long step, such as a compiler, runs without a time
// limit and is judged by its exit status. The step of one case runs a command in its own process
// group, or a function in a worker, and is stopped when it outlives its deadline, so one case that
// does not end fails by its name instead of stopping the run.
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { signalGroup, stopProcessGroup } from '../../scripts/process-group.mts';
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

/** The outcome of a bounded command: a step result and whether it outlived its deadline. */
export interface BoundedResult extends StepResult {
  timedOut: boolean;
}

/**
 * Runs a long step, such as a compiler, without a time limit and resolves
 * `{ status, stdout, stderr }`; the step is judged by its exit status and its output.
 */
export async function runStep(command: string, args: readonly string[], { cwd, env, stdio = 'pipe' }: StepOptions): Promise<StepResult> {
  const { status, stdout, stderr } = await run(command, args, { cwd, env, stdio });
  return { status, stdout, stderr };
}

/**
 * Runs the command of one case and resolves `{ status, stdout, stderr, timedOut }`. A command
 * that runs longer than `timeoutMs` is killed with its process group and resolves with
 * `timedOut: true`.
 */
export function runBounded(command: string, args: readonly string[], { cwd, env, timeoutMs, stdio = 'pipe' }: StepOptions & { timeoutMs: number }): Promise<BoundedResult> {
  return run(command, args, { cwd, env, stdio, timeoutMs });
}

/**
 * Runs the command of one case like `runBounded` and returns its result; a command that outlives `timeoutMs` throws an error
 * flagged `deadline` that names the `step`, which fails the case by its name.
 */
export async function runBoundedStep(command: string, args: readonly string[], options: StepOptions & { timeoutMs: number }, step: string): Promise<BoundedResult> {
  const result = await runBounded(command, args, options);
  if (result.timedOut) throw Object.assign(new Error(`${step} exceeded its ${seconds(options.timeoutMs)} deadline`), { deadline: true });
  return result;
}

// Runs a command in its own process group; without `timeoutMs` it has no time limit. It resolves after no process of
// the group is left, also a background process that the command started and left running (T19.13).
function run(command: string, args: readonly string[], { cwd, env, timeoutMs, stdio }: StepOptions & { timeoutMs?: number | undefined; stdio: StepStdio }): Promise<BoundedResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', stdio, stdio] });
    const pgid = child.pid;
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (data: string) => { stdout += data; });
    child.stderr?.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
    let timedOut = false;
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      // A child without a pid did not start; its error event rejects the run.
      if (pgid !== undefined) signalGroup(pgid, 'SIGKILL');
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
export function inWorker<Message>(url: URL, workerData: unknown, timeoutMs: number): Promise<Message | { timedOut: true } | { failure: string }> {
  return new Promise(resolve => {
    const worker = new Worker(url, { workerData });
    let settled = false;
    const settle = (result: Message | { timedOut: true } | { failure: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => settle({ timedOut: true }), timeoutMs);
    // The message is what the worker module posts, the type `Message` that its caller names.
    worker.once('message', (message: Message) => settle(message));
    worker.once('error', (error: Error) => settle({ failure: error.stack ?? String(error) }));
    worker.once('exit', (code: number) => settle({ failure: `the worker exited with ${code} before it reported a result` }));
  });
}

export const seconds = (milliseconds: number): string => `${milliseconds / 1000} s`;
