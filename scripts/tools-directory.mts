// The tools of a checkout are the var/tools of its main checkout: a linked worktree installs no tool and runs the tools that
// the main checkout installed, as KIT_TOOLS of kit.mk (kit K519), and reads the downloads of its main checkout.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The main checkout of `root`, or `root` itself when it is no Git checkout, as KIT_MAIN_CHECKOUT of kit.mk. */
function mainCheckout(root: string): string {
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  const folder = common.status === 0 ? common.stdout.trim() : '';
  return basename(folder) === '.git' ? realpathSync(dirname(folder)) : root;
}

/** The var/tools of the main checkout of `root`. */
export const toolsDirectory = (root: string): string => join(mainCheckout(root), 'var/tools');

/** The wheelhouse of the main checkout of `root`, which make install fills with the build requirements of the wheel. */
export const wheelhouseDirectory = (root: string): string => join(mainCheckout(root), 'var/python/wheelhouse');
