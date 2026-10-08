// The Python interpreter and the import path of the checks that run the Python package (T22.4-20). The interpreter is
// `python<minor>` for the minor release in `.python-version`, so a check runs the Python of the checkout and never the
// `python3` of the machine, which may be another minor release (AGENTS, Idempotency: Toolchains). The generated
// programs import the package from its sources through PYTHONPATH: it is pure Python and needs no build.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The sources of the Python package; PYTHONPATH of every program that imports `polyspec.template` from the checkout. */
export const pythonSources = join(root, 'packages/template-python/src');

/** The minor release of `.python-version`, such as `3.14`. */
export function pythonMinor() {
  const minor = readFileSync(join(root, '.python-version'), 'utf8').trim();
  if (!/^3\.\d+$/.test(minor)) throw new Error(`.python-version holds ${JSON.stringify(minor)}, expected a Python minor release such as 3.14`);
  return minor;
}

/**
 * Returns the command `python<minor>` after it ran with `--version` and reported that minor release. Fails with the
 * command and the fix when the interpreter is missing or reports another release. `env` is the environment whose PATH
 * finds the command.
 */
export function pythonCommand(env = process.env) {
  const minor = pythonMinor();
  const command = `python${minor}`;
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', env });
  if (result.error) throw new Error(`${command} is not on PATH (${result.error.message}); .python-version names Python ${minor}, install that Python and put ${command} on PATH`);
  const reported = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0 || !reported.startsWith(`Python ${minor}.`)) throw new Error(`${command} reported ${JSON.stringify(reported)} with exit status ${result.status}, expected Python ${minor}.x`);
  return command;
}

/** The environment of a Python program that imports `polyspec.template` from the checkout. */
export function pythonEnvironment() {
  return { PYTHONPATH: pythonSources };
}
