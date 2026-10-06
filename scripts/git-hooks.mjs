// The installation of the tracked Git hooks (T17.1-3). Git runs the hooks of `core.hooksPath`; the Makefile sets it to
// `.githooks` on every make invocation, `make hooks` installs and checks it, and the guard of the full suite and
// `make owner-check` refuse while it is not installed. The pre-push hook `.githooks/pre-push` runs the push gate
// scripts/push-gate.mjs.
import { spawnSync } from 'node:child_process';
import { constants, accessSync, existsSync } from 'node:fs';
import path from 'node:path';

export const HOOKS_PATH = '.githooks';
export const PRE_PUSH = '.githooks/pre-push';

/** Why the pre-push hook of the checkout `root` is not installed, with the fix, or null when it is installed. */
export function hooksIssue(root) {
  const config = spawnSync('git', ['config', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });
  const hooksPath = config.status === 0 ? config.stdout.trim() : '';
  if (hooksPath !== HOOKS_PATH) {
    return `core.hooksPath is not ${HOOKS_PATH} (${hooksPath ? `it is ${hooksPath}` : 'it is not set'}), so Git does not run ${PRE_PUSH}; run make hooks`;
  }
  const hook = path.join(root, PRE_PUSH);
  if (!existsSync(hook)) return `${PRE_PUSH} does not exist; restore it from Git and run make hooks`;
  try {
    accessSync(hook, constants.X_OK);
  } catch {
    return `${PRE_PUSH} is not executable; restore its mode 100755 from Git and run make hooks`;
  }
  return null;
}
