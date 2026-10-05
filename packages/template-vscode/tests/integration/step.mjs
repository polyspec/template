// A step of the integration runner: the download of VS Code, a profile installation or a VS Code
// launch. A step is a long-running operation, so it has no time limit; it prints its start, a line
// every 10 s while it runs and its result with its elapsed time, and is judged by its exit code or
// by the result of its suite.
import { spawn } from 'node:child_process';

import { stopProcessGroup } from '../../../../scripts/process-group.mjs';

// VS Code 1.138 sometimes takes minutes to exit after the suite has ended and printed its result. The result of a
// launch is the result of its suite, so VS Code gets this long to exit after the suite line before it is killed.
// The grace starts after the result has been printed; it ends VS Code and does not decide the result.
export const EXIT_GRACE_MS = 20_000;

const seconds = milliseconds => `${(milliseconds / 1000).toFixed(1)} s`;

/** Prints the start, the still-running lines and the end of an operation of this process. */
export async function logged(step, operation, { log = console.log, heartbeatMs = 10_000 } = {}) {
  log(`[integration] start - ${step}`);
  const started = Date.now();
  const heartbeat = setInterval(() => log(`[integration] … ${step} still running (${seconds(Date.now() - started)})`), heartbeatMs);
  try {
    const result = await operation();
    log(`[integration] ok - ${step} (${seconds(Date.now() - started)})`);
    return result;
  } catch (error) {
    log(`[integration] not ok - ${step} (${seconds(Date.now() - started)})`);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Runs a command in its own process group and resolves its exit code. `output` receives the output of the command.
 * `settle` reads the output and returns the code of the step once the output decides it; the command then has
 * `graceMs` to exit before the group is killed and the step resolves with that code.
 */
export function runStep(step, command, args, { env, output, settle = () => undefined, graceMs = EXIT_GRACE_MS, log = console.log, heartbeatMs = 10_000 }) {
  log(`[integration] start - ${step}`);
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled;
    let grace;
    const heartbeat = setInterval(() => log(`[integration] … ${step} still running (${seconds(Date.now() - started)})`), heartbeatMs);
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group has ended */ } };
    const read = (data, stream) => {
      output(data, stream);
      if (settled !== undefined) return;
      settled = settle(String(data));
      if (settled !== undefined) grace = setTimeout(kill, graceMs);
    };
    child.stdout.on('data', data => read(data, process.stdout));
    child.stderr.on('data', data => read(data, process.stderr));
    const stop = () => { clearInterval(heartbeat); clearTimeout(grace); };
    child.on('error', error => { stop(); reject(error); });
    child.on('exit', (exitCode, signal) => {
      stop();
      let code = exitCode ?? 1;
      if (settled !== undefined && signal === 'SIGKILL') {
        log(`[integration] ${step}: the suite ended, VS Code did not exit within ${graceMs / 1000} s and was killed`);
        code = settled;
      } else if (signal) {
        log(`[integration] ${step}: the process ended on ${signal}`);
      }
      log(`[integration] ${code === 0 ? 'ok' : 'not ok'} - ${step}: exit ${code} (${seconds(Date.now() - started)})`);
      // The processes that VS Code started in its group, such as its helpers, may still write into the profile that the
      // caller removes next; the step resolves after no process of the group is left (T19.13).
      stopProcessGroup(child).then(() => resolvePromise(code), reject);
    });
  });
}
