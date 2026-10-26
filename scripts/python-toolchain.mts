// The Python interpreters of the checks that run Python (T22.4-20, T22.5-5). The interpreter is
// var/tools/mise/shims/python3, the shim of the python of mise.toml, which `make install-tools` installs with mise at the
// digest of mise.lock (T24.12, kit K127). No check runs the `python3` of PATH or of the machine (AGENTS, Idempotency:
// Toolchains). A program that imports `polyspec.template` runs the python of packages/python/.venv, where `make python-package`
// installs packages/python editable, so it imports the package from the sources of the checkout through its
// environment, with no changed import path (PRINCIPLES S3).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readToml, tomlTable } from './toml.mts';
import { pythonPackageCommandPath } from './python-venv.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The pinned interpreter of the checkout: the shim var/tools/mise/shims/python3 of the python of mise.toml. */
export const pythonInterpreter = join(root, 'var/tools/mise/shims/python3');

/** The python of the environment of config/parity.json, where `make python-package` installs packages/python. */
export const pythonPackageInterpreter = join(root, pythonPackageCommandPath());

/** The minor release of the python of mise.toml, such as `3.14` of `python = "3.14.8"`. */
export function pythonMinor(): string {
  const tools = tomlTable(readToml(join(root, 'mise.toml')).tools, 'the [tools] of mise.toml');
  const python = tools.python;
  const minor = typeof python === 'string' ? /^(\d+\.\d+)\.\d+$/.exec(python)?.[1] : undefined;
  if (!minor) throw new Error('mise.toml declares no python as an exact release such as python = "3.14.8"');
  return minor;
}

/**
 * Returns the path of `interpreter` (the pinned interpreter by default) after it ran with `--version` and reported the
 * minor release of the python of mise.toml. Fails with the path and `fix` when the interpreter is missing, and with
 * make install-tools when it reports another release; no other interpreter is tried.
 */
export function pythonCommand(interpreter: string = pythonInterpreter, fix: string = 'make install-tools'): string {
  const minor = pythonMinor();
  const shown = relative(root, interpreter) || interpreter;
  if (!existsSync(interpreter)) throw new Error(`${shown} is missing; run ${fix}, which installs the python ${minor} of mise.toml`);
  const result = spawnSync(interpreter, ['--version'], { encoding: 'utf8' });
  if (result.error) throw new Error(`${shown} did not start (${result.error.message}); run ${fix}`);
  const reported = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0 || !reported.startsWith(`Python ${minor}.`)) throw new Error(`${shown} reported ${JSON.stringify(reported)} with exit status ${result.status}, expected Python ${minor}.x; run make install-tools`);
  return interpreter;
}

/** The python of packages/python/.venv, checked as pythonCommand checks it; missing, it fails with the fix make python-package. */
export function pythonPackageCommand(): string {
  return pythonCommand(pythonPackageInterpreter, 'make python-package');
}

/**
 * The environment of a Python program. It writes no bytecode, so a run leaves no `__pycache__` in the sources of the
 * checkout, which the editable install imports (AGENTS, Idempotency: Shared state).
 */
export function pythonEnvironment(): { PYTHONDONTWRITEBYTECODE: string } {
  return { PYTHONDONTWRITEBYTECODE: '1' };
}
