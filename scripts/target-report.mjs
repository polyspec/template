// The report of a run of make targets (T20.1-9), so that one CI run leaves the reason of every failure:
//
//   <directory>/targets/<target>.log   the whole output of `make -k <target>`
//   <directory>/summary.md             each target with its result and time, the version of each toolchain of the
//                                      run, and for each failed target its first failure lines and the path of its
//                                      log; in CI also the job summary
//   <directory>/toolchains.json        the version of each toolchain of the run (toolchainVersions)
//
// `make check` (scripts/full-run.mjs) writes var/report/full-run and `make ci-targets` (scripts/ci-targets.mjs)
// var/report/ci-targets, and every CI job uploads its report under `if: !cancelled()`.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The number of failure lines of a failed target in the summary.
export const FAILURE_LINES = 20;
// A line that reports a failure in the output of the runners, make and the tools of the checks.
const FAILURE = /✖|\bnot ok\b|\*\*\*|\bError\b|\berror\b|\bFAIL|\bfailed\b|AssertionError|panicked/;

export const logPath = (directory, target) => path.join(directory, 'targets', `${target}.log`);

// The commands that print the version of each toolchain of a run.
const VERSION_COMMANDS = {
  node: ['node', ['--version']],
  npm: ['npm', ['--version']],
  go: ['go', ['env', 'GOVERSION']],
  cargo: ['cargo', ['--version']],
  php: ['php', ['-r', 'echo PHP_VERSION;']],
  composer: ['composer', ['--version', '--no-ansi']],
};

/**
 * The version of each toolchain on PATH in `root`, as the commands print it, or `unavailable: <reason>`. The report of
 * each CI job and the record of a full run keep them as evidence of what the run ran on: config/toolchain.json pins PHP
 * by its minor version, because setup-php cannot pin a patch, so the patch of each run is recorded here (T19.2).
 */
export function toolchainVersions(root) {
  const versions = {};
  for (const [name, [command, args]] of Object.entries(VERSION_COMMANDS)) {
    const run = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
    const line = (run.stdout ?? '').trim().split('\n')[0];
    versions[name] = run.error ? `unavailable: ${run.error.message}` : run.status === 0 ? line : `unavailable: ${command} exited with ${run.status}`;
  }
  return versions;
}

/** Starts the report of a run: the directory holds only the files of this run. */
export function startReport(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(path.join(directory, 'targets'), { recursive: true });
}

/**
 * Runs `make -k <target>` in `root`, which keeps going after a failed prerequisite (T19.8), prints its output as it
 * arrives and writes it to the log of the target; resolves whether it ended with status 0.
 */
export function runLogged(root, target, directory) {
  mkdirSync(path.join(directory, 'targets'), { recursive: true });
  const log = createWriteStream(logPath(directory, target));
  return new Promise((resolve, reject) => {
    const child = spawn('make', ['-k', target], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { process.stdout.write(data); log.write(data); });
    child.stderr.on('data', data => { process.stderr.write(data); log.write(data); });
    child.once('error', error => log.end(() => reject(error)));
    child.once('close', (status, signal) => {
      log.write(`\n[report] make -k ${target} ended with ${signal ? `signal ${signal}` : `status ${status}`}\n`);
      log.end(() => resolve(status === 0));
    });
  });
}

/** The first failure lines of a log, or its last lines when no line reports a failure. */
export function failureLines(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const failures = lines.filter(line => FAILURE.test(line));
  return (failures.length ? failures : lines.slice(-FAILURE_LINES)).slice(0, FAILURE_LINES);
}

const seconds = milliseconds => (milliseconds == null ? '-' : `${(milliseconds / 1000).toFixed(1)} s`);

/**
 * Writes summary.md of `results` ({ name, status, elapsedMs }) and of the toolchain versions `environment`, and appends
 * it to the job summary of GitHub Actions when GITHUB_STEP_SUMMARY names one; returns the text.
 */
export function writeSummary(directory, title, results, environment) {
  const failed = results.filter(result => result.status !== 'passed');
  const lines = [`# ${title}`, '', `${results.length - failed.length} of ${results.length} targets passed.`, '', '| Target | Result | Time |', '| --- | --- | --- |'];
  for (const result of results) lines.push(`| ${result.name} | ${result.status} | ${seconds(result.elapsedMs)} |`);
  lines.push('', '| Toolchain | Version |', '| --- | --- |', ...Object.entries(environment).map(([name, version]) => `| ${name} | ${version} |`));
  for (const result of failed) {
    const log = logPath(directory, result.name);
    const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
    lines.push('', `## ${result.name}: ${result.status}`, '', `Log: targets/${result.name}.log`, '', '```', ...(text ? failureLines(text) : ['the target wrote no log']), '```');
  }
  const summary = `${lines.join('\n')}\n`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  return summary;
}
