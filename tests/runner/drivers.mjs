// Language drivers for the conformance and parity runners.
// Each driver builds its CLI before a run, which does nothing when its inputs are unchanged, and runs `parse` or `render`. A build is a
// long-running step without a time limit; it prints its start, its output and its result on
// standard error, so the result lines of the runners on standard output stay in order. Each CLI
// call is a case and keeps its own timeout.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStepSync } from '../../scripts/test-progress/step.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = join(root, 'packages');

const environment = () => ({ ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` });

// The time limit of one CLI call.
const INVOKE_TIMEOUT_MS = 10_000;

/** Builds the CLI of the driver `name` as a logged step; throws when the build fails. */
export function build(name, command, args, cwd) {
  runStepSync(`build ${name}`, command, args, { cwd, env: environment() });
}

// The shared library of the PHP extension: .dylib on macOS, .so elsewhere.
function extensionPath() {
  const dir = join(packages, 'template-php-ext', 'target', 'release');
  const dylib = join(dir, 'libpolyspec_template.dylib');
  return existsSync(dylib) ? dylib : join(dir, 'libpolyspec_template.so');
}

export const drivers = {
  ts: {
    dir: join(packages, 'template-ts'),
    binary: join(packages, 'template-ts', 'dist', 'index.mjs'),
    build() {
      build('ts', 'make', ['build-ts'], root);
    },
    command(args) {
      return ['node', [join(packages, 'template-ts', 'bin', 'template.mjs'), ...args]];
    },
  },
  go: {
    dir: join(packages, 'template-go'),
    binary: join(packages, 'template-go', 'template'),
    build() {
      build('go', 'go', ['build', '-o', 'template', './cmd/template'], join(packages, 'template-go'));
    },
    command(args) {
      return [join(packages, 'template-go', 'template'), args];
    },
  },
  rust: {
    dir: join(packages, 'template-rust'),
    binary: join(packages, 'template-rust', 'target', 'release', 'template'),
    build() {
      build('rust', 'cargo', ['build', '--locked', '--release', '--bin', 'template'], join(packages, 'template-rust'));
    },
    command(args) {
      return [join(packages, 'template-rust', 'target', 'release', 'template'), args];
    },
  },
  php: {
    dir: join(packages, 'template-php'),
    binary: join(packages, 'template-php', 'vendor', 'autoload.php'),
    build() {
      build('php', 'composer', ['install', '--no-interaction', '--quiet'], join(packages, 'template-php'));
    },
    command(args) {
      return ['php', [join(packages, 'template-php', 'bin', 'template.php'), ...args]];
    },
  },
  'php-ext': {
    dir: join(packages, 'template-php-ext'),
    get binary() {
      return extensionPath();
    },
    build() {
      build('php-ext', `${process.env.HOME}/.cargo/bin/cargo`, ['build', '--locked', '--release'], join(packages, 'template-php-ext'));
    },
    command(args) {
      return ['php', [`-dextension=${extensionPath()}`, join(packages, 'template-php-ext', 'bin', 'template-ext.php'), ...args]];
    },
  },
};

/**
 * Builds the CLI of the language `name` before a run. The build runs every time, because a present binary may be
 * built from older sources (T19.6); each build does nothing when its inputs are unchanged: make build-ts and
 * scripts/build-package.mjs, go build, cargo build and composer install.
 */
export function prepare(name) {
  const driver = drivers[name];
  if (!existsSync(driver.dir)) throw new Error(`${name}: package directory is absent (${driver.dir})`);
  driver.build();
}

// Runs one CLI invocation and returns {status, stdout, stderr}. A call that outlives its limit (`timeoutMs`, 10 s by
// default) returns status -1 with the command and the limit (T19.10).
export function invoke(name, args, cwd, { timeoutMs = INVOKE_TIMEOUT_MS } = {}) {
  const [command, argv] = drivers[name].command(args);
  const result = spawnSync(command, argv, { encoding: 'utf8', timeout: timeoutMs, cwd: cwd ?? root, env: environment(), maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    const call = [command, ...argv].join(' ');
    const stderr = result.error.code === 'ETIMEDOUT' ? `${call} did not finish within its limit of ${timeoutMs / 1000} s` : `${call} failed: ${result.error.message}`;
    return { status: -1, stdout: '', stderr };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function selectLanguages(option) {
  const all = Object.keys(drivers);
  // Every language runs unless the option names the languages; prepare fails on an absent package (T19.4).
  if (!option) return all;
  const names = option.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of names) {
    if (!drivers[name]) throw new Error(`unknown language: ${name} (known: ${all.join(', ')})`);
  }
  return names;
}
