// The Python interpreter and the import path of the checks that run the Python package (T22.4-20, T22.5-5). The interpreter
// is var/tools/mise/shims/python3, the shim of the python of mise.toml, which `make install-tools` installs with mise at the
// digest of mise.lock (T24.12, kit K127). No check runs the `python3` of PATH or of the
// machine (AGENTS, Idempotency: Toolchains). The generated programs import the package from its sources through PYTHONPATH:
// it is pure Python and needs no build.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The sources of the Python package; PYTHONPATH of every program that imports `polyspec.template` from the checkout. */
export const pythonSources = join(root, 'packages/template-python/src');

/** The pinned interpreter of the checkout: the shim var/tools/mise/shims/python3 of the python of mise.toml. */
export const pythonInterpreter = join(root, 'var/tools/mise/shims/python3');

/** The minor release of the python of mise.toml, such as `3.14` of `python = "3.14.8"`. */
export function pythonMinor() {
  const minor = /^python = "(\d+\.\d+)\.\d+"$/m.exec(readFileSync(join(root, 'mise.toml'), 'utf8'))?.[1];
  if (!minor) throw new Error('mise.toml declares no python as an exact release such as python = "3.14.8"');
  return minor;
}

/**
 * Returns the path of `interpreter` (the pinned interpreter by default) after it ran with `--version` and reported the
 * minor release of the python of mise.toml. Fails with the path and the fix when the interpreter is missing or reports another
 * release; no other interpreter is tried.
 */
export function pythonCommand(interpreter = pythonInterpreter) {
  const minor = pythonMinor();
  const shown = relative(root, interpreter) || interpreter;
  if (!existsSync(interpreter)) throw new Error(`${shown} is missing; run make install-tools, which installs the python ${minor} of mise.toml`);
  const result = spawnSync(interpreter, ['--version'], { encoding: 'utf8' });
  if (result.error) throw new Error(`${shown} did not start (${result.error.message}); run make install-tools`);
  const reported = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0 || !reported.startsWith(`Python ${minor}.`)) throw new Error(`${shown} reported ${JSON.stringify(reported)} with exit status ${result.status}, expected Python ${minor}.x; run make install-tools`);
  return interpreter;
}

/**
 * The environment of a Python program that imports `polyspec.template` from the checkout. It writes no bytecode, so a
 * run leaves no `__pycache__` in the sources of the checkout (AGENTS, Idempotency: Shared state).
 */
export function pythonEnvironment() {
  return { PYTHONPATH: pythonSources, PYTHONDONTWRITEBYTECODE: '1' };
}
