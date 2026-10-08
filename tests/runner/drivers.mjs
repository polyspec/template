// Language drivers for the conformance and parity runners.
// Each driver builds its CLI before a run, which does nothing when its inputs are unchanged, and runs `parse` or `render`. A build is a
// long-running step without a time limit; it prints its start, its output and its result on
// standard error, so the result lines of the runners on standard output stay in order. Each CLI
// call is a case and keeps its own timeout.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishBuild } from '../../scripts/publish-build.mjs';
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

// The runs execute the builds published to var/build, which changes only when the bytes of a build change: cargo
// links target/release again on every build, and macOS checks a new executable file on its first run, which outlived
// the 10 s limit of a call on a loaded machine (T19.6-1). `make build-go`, `make build-rust` and `make ext` publish to
// the same files.
export const published = {
  go: join(root, 'var', 'build', 'template-go'),
  rust: join(root, 'var', 'build', 'template-rust'),
  'php-ext': join(root, 'var', 'build', 'polyspec_template.so'),
};

export const drivers = {
  ts: {
    dir: join(packages, 'template-ts'),
    build() {
      build('ts', 'make', ['build-ts'], root);
    },
    command(args) {
      return ['node', [join(packages, 'template-ts', 'bin', 'template.mjs'), ...args]];
    },
  },
  go: {
    dir: join(packages, 'template-go'),
    build() {
      build('go', 'go', ['build', '-o', 'template', './cmd/template'], join(packages, 'template-go'));
      publishBuild(join(packages, 'template-go', 'template'), published.go);
    },
    command(args) {
      return [published.go, args];
    },
  },
  rust: {
    dir: join(packages, 'template-rust'),
    build() {
      build('rust', 'cargo', ['build', '--locked', '--release', '--bin', 'template'], join(packages, 'template-rust'));
      publishBuild(join(packages, 'template-rust', 'target', 'release', 'template'), published.rust);
    },
    command(args) {
      return [published.rust, args];
    },
  },
  php: {
    dir: join(packages, 'template-php'),
    build() {
      build('php', process.execPath, [join(root, 'scripts/composer-install.mjs'), join(packages, 'template-php')], root);
    },
    command(args) {
      return ['php', [join(packages, 'template-php', 'bin', 'template.php'), ...args]];
    },
  },
  python: {
    dir: join(packages, 'template-python'),
    build() {
      build('python', 'python3', ['-m', 'compileall', '-q', join(packages, 'template-python', 'src')], root);
    },
    command(args) {
      return ['python3', ['-m', 'polyspec.template.cli', ...args]];
    },
    env: { PYTHONPATH: join(packages, 'template-python', 'src') },
  },
  'php-ext': {
    dir: join(packages, 'template-php-ext'),
    build() {
      // The C extension builds with phpize, configure and make and publishes its library itself (T21.4).
      build('php-ext', process.execPath, [join(root, 'scripts/build-php-extension.mjs'), join(packages, 'template-php-ext', 'src'), published['php-ext']], root);
    },
    command(args) {
      return ['php', [`-dextension=${published['php-ext']}`, join(packages, 'template-php-ext', 'bin', 'template-ext.php'), ...args]];
    },
  },
};

/**
 * Builds the CLI of the language `name` before a run. The build runs every time, because a present binary may be
 * built from older sources (T19.6); each build does nothing when its inputs are unchanged: make build-ts and
 * scripts/build-package.mjs, go build, cargo build, composer install and scripts/build-php-extension.mjs.
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
  const driver = drivers[name];
  const base = environment();
  const env = driver.env
    ? { ...base, ...Object.fromEntries(Object.entries(driver.env).map(([key, value]) => [key, base[key] ? `${value}:${base[key]}` : value])) }
    : base;
  const result = spawnSync(command, argv, { encoding: 'utf8', timeout: timeoutMs, cwd: cwd ?? root, env, maxBuffer: 64 * 1024 * 1024 });
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
