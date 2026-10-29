// The tools of a checkout are the var/tools of its main checkout: a linked worktree installs no tool and runs the tools that
// the main checkout installed, as KIT_TOOLS of kit.mk (kit K519).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The var/tools of the main checkout of `root`, or of `root` itself when it is no Git checkout. */
export function toolsDirectory(root: string): string {
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  const folder = common.status === 0 ? common.stdout.trim() : '';
  return join(basename(folder) === '.git' ? realpathSync(dirname(folder)) : root, 'var/tools');
}
