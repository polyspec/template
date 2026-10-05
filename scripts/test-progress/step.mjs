// A long-running step of a check, such as a build, an installation or a package command. A step
// has no time limit: it prints its start and its result with its elapsed time on standard error,
// the output of its command arrives on standard error while it runs, and the step is judged by
// the exit status of its command.
import { spawnSync } from 'node:child_process';

const seconds = milliseconds => `${(milliseconds / 1000).toFixed(1)}s`;

/**
 * Runs `command` with `args` as the step `label` and returns its standard output when `capture`
 * is set. Throws when the command cannot start or exits with a nonzero status.
 */
export function runStepSync(label, command, args, { cwd, env, capture = false } = {}) {
  const step = `${label}: ${[command, ...args].join(' ')}`;
  process.stderr.write(`▶ ${step}\n`);
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', capture ? 'pipe' : 2, 2], maxBuffer: 64 * 1024 * 1024 });
  const elapsed = seconds(Date.now() - started);
  if (result.error || result.status !== 0) {
    const reason = result.error ? `failed to start: ${result.error.message}` : result.signal ? `ended on ${result.signal}` : `exited with ${result.status}`;
    process.stderr.write(`✖ ${step} ${reason} (${elapsed})\n`);
    throw new Error(`${step} ${reason}`);
  }
  process.stderr.write(`✔ ${step} (${elapsed})\n`);
  return capture ? result.stdout : '';
}
