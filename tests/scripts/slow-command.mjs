// A test fixture for long-running steps: a command of the same name as a real command that waits
// and then runs the real command, so a step takes longer than a small limit and still succeeds.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes the command `name` into `directory`; it waits `delaySeconds` and then runs the real
 * `name` found on PATH. Returns the PATH that puts `directory` first.
 */
export function slowCommandPath(directory, name, delaySeconds) {
  const real = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
  writeFileSync(path.join(directory, name), `#!/bin/sh\nsleep ${delaySeconds}\nexec "${real}" "$@"\n`, { mode: 0o755 });
  return `${directory}${path.delimiter}${process.env.PATH}`;
}
