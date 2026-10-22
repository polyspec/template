// Language drivers for the conformance and parity runners.
// Each driver builds its CLI before a run, which does nothing when its inputs are unchanged, and runs `parse`, `render`,
// `tokens` or `format` (CNF-4). A build is a
// long-running step without a time limit; it prints its start, its output and its result on
// standard error, so the result lines of the runners on standard output stay in order. Each CLI
// call is a case and keeps its own timeout.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishBuild } from '../../scripts/publish-build.mts';
import { pythonPackageCommand } from '../../scripts/python-toolchain.mts';
import { runStepSync } from '../../scripts/test-progress/step.mts';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = join(root, 'packages');

const environment = (): NodeJS.ProcessEnv => ({ ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` });

// The time limit of one CLI call.
const INVOKE_TIMEOUT_MS = 10_000;

/**
 * Builds the CLI of the driver `name` as a logged step; throws when the build fails.
 * @public tests/scripts/long-steps.test.mts imports it in the code of a child process, which knip does not read.
 */
export function build(name: string, command: string, args: readonly string[], cwd: string): void {
  runStepSync(`build ${name}`, command, args, { cwd, env: environment() });
}

// The runs execute the builds published to var/build, which changes only when the bytes of a build change: cargo
// links target/release again on every build, and macOS checks a new executable file on its first run, which outlived
// the 10 s limit of a call on a loaded machine (T19.6-1). `make build-go`, `make build-rust` publish to var/build and
// `make build-php-ext` (kit, S10) publishes the PHP extension to var/php-ext.
const published = {
  go: join(root, 'var', 'build', 'template-go'),
  rust: join(root, 'var', 'build', 'template-rust'),
  'php-ext': join(root, 'var', 'php-ext', 'polyspec_template.so'),
};

/** A language driver: its package directory, the build of its CLI and the command line of a CLI call. */
export interface Driver {
  dir: string;
  build(): void;
  command(args: readonly string[]): [string, readonly string[]];
}

/** The languages that have a driver. */
export type Language = 'ts' | 'go' | 'rust' | 'php' | 'python' | 'php-ext';

/** @public the tests of tests/scripts import a copy of this module by a computed path, which knip does not resolve. */
export const drivers: Record<Language, Driver> = {
  ts: {
    dir: join(packages, 'ts'),
    // make template-build-language builds the template package first and then the formatter package.
    build() {
      build('ts', 'make', ['template-build-language'], root);
    },
    // The formatter of TypeScript is the package packages/language, which depends on the template package, so its
    // command template-language runs `format` and the command template runs the other subcommands (CNF-5).
    command(args) {
      if (args[0] === 'format') return ['node', [join(packages, 'language', 'bin', 'template-language.mjs'), ...args]];
      return ['node', [join(packages, 'ts', 'bin', 'template.mjs'), ...args]];
    },
  },
  go: {
    dir: join(packages, 'go'),
    build() {
      build('go', 'go', ['build', '-o', 'template', './cmd/template'], join(packages, 'go'));
      publishBuild(join(packages, 'go', 'template'), published.go);
    },
    command(args) {
      return [published.go, args];
    },
  },
  rust: {
    dir: join(packages, 'rust'),
    build() {
      build('rust', 'cargo', ['build', '--locked', '--release', '--bin', 'template'], join(packages, 'rust'));
      publishBuild(join(packages, 'rust', 'target', 'release', 'template'), published.rust);
    },
    command(args) {
      return [published.rust, args];
    },
  },
  php: {
    dir: join(packages, 'php'),
    build() {
      build('php', process.execPath, [join(root, 'scripts/composer-install.mts'), root], root);
      // The command line package installs its own vendor directory, which its bin runs on.
      build('php', process.execPath, [join(root, 'scripts/composer-install.mts'), join(root, 'packages', 'cli', 'php')], root);
    },
    command(args) {
      // The command line is the bin of its own package (packages/cli/php), which runs on the autoloader of that package.
      return ['php', [join(root, 'packages', 'cli', 'php', 'bin', 'template.php'), ...args]];
    },
  },
  // The command is the python of var/python/venv, where make python-package installs packages/python editable, so
  // it imports polyspec.template from the sources of the checkout with no changed import path (PRINCIPLES S3). The build is make
  // python-package, which makes that environment and does nothing when it is current.
  python: {
    dir: join(packages, 'python'),
    build() {
      build('python', 'make', ['python-package'], root);
    },
    command(args) {
      return [pythonPackageCommand(), ['-m', 'polyspec.template.cli', ...args]];
    },
  },
  'php-ext': {
    dir: join(packages, 'php-ext'),
    build() {
      // The bin of the command line package runs the library's command line on the classes of the extension.
      build('php-ext', process.execPath, [join(root, 'scripts/composer-install.mts'), root], root);
      build('php-ext', process.execPath, [join(root, 'scripts/composer-install.mts'), join(root, 'packages', 'cli', 'php')], root);
      // The C extension is built by kit's make build-php-ext (S10): phpize, configure and make, publishing its library itself.
      build('php-ext', 'make', ['build-php-ext'], root);
    },
    command(args) {
      return ['php', [`-dextension=${published['php-ext']}`, join(root, 'packages', 'cli', 'php', 'bin', 'template.php'), ...args]];
    },
  },
};

/** Whether `name` is a language that has a driver. */
function isLanguage(name: string): name is Language {
  return Object.hasOwn(drivers, name);
}

/** The driver of the language `name`; an unknown name is an error. */
function driverOf(name: string): Driver {
  if (!isLanguage(name)) throw new Error(`unknown language: ${name} (known: ${Object.keys(drivers).join(', ')})`);
  return drivers[name];
}

/**
 * Builds the CLI of the language `name` before a run. The build runs every time, because a present binary may be
 * built from older sources (T19.6); each build does nothing when its inputs are unchanged: make build-ts and
 * scripts/build-package.mts, go build, cargo build, composer install, make build-php-ext and make python-package.
 */
export function prepare(name: string): void {
  const driver = driverOf(name);
  if (!existsSync(driver.dir)) throw new Error(`${name}: package directory is absent (${driver.dir})`);
  driver.build();
}

// Runs one CLI invocation and returns {status, stdout, stderr}. A call that outlives its limit (`timeoutMs`, 10 s by
// default) returns status -1 with the command and the limit (T19.10).
export function invoke(name: string, args: readonly string[], cwd?: string, { timeoutMs = INVOKE_TIMEOUT_MS }: { timeoutMs?: number } = {}): { status: number | null; stdout: string; stderr: string } {
  const [command, argv] = driverOf(name).command(args);
  const result = spawnSync(command, argv, { encoding: 'utf8', timeout: timeoutMs, cwd: cwd ?? root, env: environment(), maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    const call = [command, ...argv].join(' ');
    const stderr = 'code' in result.error && result.error.code === 'ETIMEDOUT' ? `${call} did not finish within its limit of ${timeoutMs / 1000} s` : `${call} failed: ${result.error.message}`;
    return { status: -1, stdout: '', stderr };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function selectLanguages(option: string | undefined): string[] {
  const all = Object.keys(drivers);
  // Every language runs unless the option names the languages; prepare fails on an absent package (T19.4).
  if (!option) return all;
  const names = option.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of names) {
    if (!isLanguage(name)) throw new Error(`unknown language: ${name} (known: ${all.join(', ')})`);
  }
  return names;
}
