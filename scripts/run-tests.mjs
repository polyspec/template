#!/usr/bin/env node
// The test runner of the repository. A test target runs its test tool through this script, which
// prints each test as it starts, keeps running, passes, fails or is skipped, with the elapsed
// time, and gives every test its own timeout.
//
//   node scripts/run-tests.mjs <tool> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]
//
// The arguments after the runner's options go to the tool.
//
// Tools: node (node --test), vitest, go (go test), cargo (cargo test) and phpunit. node and
// vitest stop a test at its timeout themselves; for go, cargo and phpunit this runner stops the
// tool when a test outlives it. No tool has a time limit on a package, a file or a whole run.
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { vitest } from './tools.mjs';

import { createProgress } from './test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node scripts/run-tests.mjs <node|vitest|go|cargo|phpunit> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]';
const DEFAULT_TIMEOUT_SECONDS = 30;
// A line in which a tool reports an error: `error: ...` and `error[E0425]: ...` of cargo and rustc, `fatal error: ...`,
// `panic: ...` of Go and `PHP Fatal error: ...`.
const ERROR_LINE = /^(?:error(?:\[\w+\])?:|fatal error:|panic:|PHP Fatal error:)/i;

export function parseArguments(argv) {
  const [tool, ...rest] = argv;
  if (!['node', 'vitest', 'go', 'cargo', 'phpunit'].includes(tool)) throw new Error(USAGE);
  const options = { tool, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS, cwd: ROOT, args: [] };
  let index = 0;
  for (; index < rest.length; index += 2) {
    const [flag, value] = [rest[index], rest[index + 1]];
    if (flag === '--timeout') {
      if (!/^[1-9]\d*$/.test(value ?? '')) throw new Error(USAGE);
      options.timeoutSeconds = Number(value);
    } else if (flag === '--cwd') {
      if (!value) throw new Error(USAGE);
      options.cwd = path.resolve(ROOT, value);
    } else break;
  }
  options.args = rest.slice(rest[index] === '--' ? index + 1 : index);
  return options;
}

/** The command of a tool with its progress and timeout arguments. */
export function toolCommand({ tool, timeoutSeconds, cwd, args }) {
  const milliseconds = String(timeoutSeconds * 1000);
  switch (tool) {
    case 'node':
      return {
        command: process.execPath,
        // A timed-out test can leave work pending; the file's process ends when its tests end.
        args: ['--test', '--test-force-exit', `--test-timeout=${milliseconds}`, `--test-reporter=${path.join(ROOT, 'scripts/test-progress/node-reporter.mjs')}`, '--test-reporter-destination=stdout', ...args],
      };
    case 'vitest':
      return {
        // npm writes no bin links (.npmrc), so the runner starts the entry of the vitest package with node.
        command: process.execPath,
        args: [vitest, 'run', `--testTimeout=${milliseconds}`, `--hookTimeout=${milliseconds}`, `--reporter=${path.join(ROOT, 'scripts/test-progress/vitest-reporter.mjs')}`, ...args],
      };
    case 'go':
      // go test has no per-test limit; this runner applies it. -timeout=0 removes the limit of
      // go test on a whole test binary, a package.
      return { command: 'go', args: ['test', '-json', '-count=1', '-timeout=0', ...args] };
    case 'cargo':
      // One test at a time, so each test prints its start before its result.
      return { command: 'cargo', args: ['test', ...splitCargo(args).cargo, '--', '--test-threads=1', ...splitCargo(args).harness] };
    case 'phpunit':
      return { command: path.join(cwd, 'vendor/bin/phpunit'), args: ['--teamcity', ...args] };
  }
  throw new Error(USAGE);
}

function splitCargo(args) {
  const index = args.indexOf('--');
  return index === -1 ? { cargo: args, harness: [] } : { cargo: args.slice(0, index), harness: args.slice(index + 1) };
}

/**
 * Read go test -json events into progress lines; a test's output is shown only when it fails. The compiler output of a
 * package that does not build arrives as `build-output` events and its end as a `build-fail` event: both are printed,
 * and the error lines are added to `build` for the summary (T19.3).
 */
export function goEvents(progress, build = []) {
  const output = new Map();
  return line => {
    let event;
    try { event = JSON.parse(line); } catch { return progress.line(line); }
    if (event.Action === 'build-output') {
      for (const text of String(event.Output ?? '').split('\n').filter(Boolean)) {
        progress.line(text);
        if (!text.startsWith('#')) build.push(text.trim());
      }
      return undefined;
    }
    if (event.Action === 'build-fail') return progress.line(`✖ build of ${event.ImportPath} failed`);
    const id = event.Test ? `${event.Package} › ${event.Test.replaceAll('/', ' › ')}` : event.Package;
    const group = !event.Test;
    switch (event.Action) {
      case 'start': return progress.start(id, { group: true });
      case 'run': return group ? undefined : progress.start(id);
      case 'output': {
        if (group) { if (!/^(?:ok|PASS|FAIL|\?)\s/.test(event.Output)) process.stdout.write(event.Output); return; }
        output.set(id, (output.get(id) ?? '') + event.Output);
        return;
      }
      case 'pass': output.delete(id); return group ? progress.pass(id, event.Elapsed * 1000) : progress.pass(id, event.Elapsed * 1000);
      case 'skip': output.delete(id); return progress.skip(id);
      case 'fail': {
        const text = (output.get(id) ?? '').split('\n').filter(entry => !/^\s*(?:=== RUN|--- FAIL|=== (?:PAUSE|CONT))/.test(entry)).join('\n');
        output.delete(id);
        return progress.fail(id, (event.Elapsed ?? 0) * 1000, text);
      }
      default: return undefined;
    }
  };
}

/**
 * Read serial libtest output into progress lines. A test prints `test <name> ... ` when it
 * starts and its result (`ok`, `FAILED` or `ignored`) when it ends; cargo names each test binary
 * on standard error before running it.
 */
export function cargoEvents(progress) {
  let binary = 'cargo';
  let current;
  let buffer = '';
  const start = name => {
    const id = `${binary} › ${name}`;
    if (current === id) return;
    current = id;
    progress.start(id);
  };
  const line = text => {
    const result = /^test (\S+) \.\.\. (ok|FAILED|ignored)\b/.exec(text);
    if (!result) {
      if (text.trim() && !/^(?:running \d+ tests?$|test result:|failures:$|successes:$)/.test(text.trim())) progress.line(`  ${text}`);
      return;
    }
    start(result[1]);
    if (result[2] === 'ok') progress.pass(current);
    else if (result[2] === 'ignored') progress.skip(current);
    else progress.fail(current);
    current = undefined;
  };
  return {
    stdout(data) {
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      const started = /^test (\S+) \.\.\. $/.exec(buffer);
      if (started) start(started[1]);
    },
    stderr(text) {
      const running = /^\s*(?:Running|Doc-tests)\s+(?:unittests\s+)?(\S+)/.exec(text);
      if (running) binary = running[1];
      if (text.trim()) progress.line(text.trim());
    },
  };
}

const unescapeTeamcity = value => value.replace(/\|(['|\][nr])/g, (match, character) => ({ n: '\n', r: '\r' })[character] ?? character);

/**
 * Read PHPUnit TeamCity messages into progress lines. Other lines, such as the summary with the
 * warnings that fail the run under failOnWarning, are printed as they are.
 */
export function phpunitEvents(progress) {
  const failures = new Map();
  // A test is named by its class and method; testFinished repeats only the method name.
  const ids = new Map();
  // Suites without a location (the configuration and the test suites) are printed as groups. A
  // class or a data provider method has a location on its start only, so its finish is matched
  // by this set.
  const groups = new Set();
  const qualified = attributes => {
    const hint = /::\\?([^:]+)::(.+)$/.exec(attributes.locationHint ?? '');
    return hint ? `${hint[1].split('\\').pop()}::${hint[2]}` : attributes.name;
  };
  return line => {
    const message = /^##teamcity\[(\w+)((?: \w+='(?:[^'|]|\|.)*')*)\]$/.exec(line.trim());
    if (!message) return line.trim() ? progress.line(line) : undefined;
    const attributes = Object.fromEntries([...message[2].matchAll(/ (\w+)='((?:[^'|]|\|.)*)'/g)].map(([, key, value]) => [key, unescapeTeamcity(value)]));
    if (message[1] === 'testStarted') ids.set(attributes.name, qualified(attributes));
    const id = ids.get(attributes.name) ?? attributes.name;
    switch (message[1]) {
      case 'testSuiteStarted': {
        if (attributes.locationHint) return undefined;
        groups.add(id);
        return progress.start(id, { group: true });
      }
      case 'testSuiteFinished': return groups.delete(id) ? progress.pass(id) : undefined;
      case 'testStarted': return progress.start(id);
      // PHPUnit reports a test that ran out of its time limit and also made no assertion twice.
      case 'testFailed': failures.set(id, [failures.get(id), attributes.message ?? '', attributes.details ?? ''].filter(Boolean).join('\n')); return undefined;
      case 'testIgnored': return progress.skip(id);
      case 'testFinished': {
        const duration = Number(attributes.duration);
        if (failures.has(id)) { const text = failures.get(id); failures.delete(id); return progress.fail(id, duration, text); }
        return progress.pass(id, duration);
      }
      default: return undefined;
    }
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { command, args } = toolCommand(options);
  const label = `${options.tool} ${path.relative(ROOT, options.cwd) || '.'}${options.args.length ? ` ${options.args.join(' ')}` : ''}`;
  process.stdout.write(`▶ ${label} (each test ${options.timeoutSeconds}s)\n`);
  const reads = ['go', 'cargo', 'phpunit'].includes(options.tool);
  const cargo = options.tool === 'cargo';
  // A runner started from inside node --test must not join that run as its child.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(command, args, { cwd: options.cwd, env, stdio: ['ignore', reads ? 'pipe' : 'inherit', cargo ? 'pipe' : 'inherit'], detached: reads });
  let timedOut = false;
  const progress = reads ? createProgress({
    write: text => process.stdout.write(text),
    timeoutMs: options.timeoutSeconds * 1000,
    onTimeout: () => { timedOut = true; process.kill(-child.pid, 'SIGTERM'); },
  }) : undefined;
  // The error lines of the tool, which the summary names when the tool exits without a failing test.
  const errors = [];
  // The compiler errors of a Go package that does not build, which the summary names.
  const build = [];
  const noting = handle => (text) => {
    if (ERROR_LINE.test(text.trim())) errors.push(text.trim());
    handle(text);
  };
  if (cargo) {
    const events = cargoEvents(progress);
    child.stdout.setEncoding('utf8').on('data', events.stdout);
    readline.createInterface({ input: child.stderr }).on('line', noting(events.stderr));
  } else if (reads) {
    readline.createInterface({ input: child.stdout }).on('line', noting(options.tool === 'go' ? goEvents(progress, build) : phpunitEvents(progress)));
  }
  const { status, signal } = await new Promise(resolve => child.on('close', (status, signal) => resolve({ status, signal })));
  const code = status ?? (signal ? 1 : 0);
  if (progress) {
    const summary = progress.close(label, { exitCode: timedOut ? 0 : code, errors, build });
    process.exitCode = summary.ok && !timedOut ? 0 : 1;
  } else {
    // node --test and vitest print their summary from inside the tool; a tool that then ends on a
    // signal or a nonzero code fails the run, and this line names why.
    if (code !== 0) process.stdout.write(`✖ ${label}: the tool ended ${signal ? `on ${signal}` : `with exit code ${status}`}\n`);
    process.exitCode = code;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
