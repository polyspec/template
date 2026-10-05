#!/usr/bin/env node
// Installs the VS Code build of the integration test into a tools directory of the checkout (T20.1-4):
//
//   node scripts/install-vscode.mjs <directory>
//
// The build is the minimum version of engines.vscode in packages/template-vscode/package.json for the platform of the
// machine, in <directory>/vscode-<platform>-<version>, the layout of @vscode/test-electron. make install runs it with
// the network; `make test-vscode-integration` only reads the installed copy and never downloads. An install of a
// present copy does nothing. A new copy is downloaded into <directory>/.next-<pid> and renamed into place, so a reader
// finds either no copy or a complete one, and two installs at once keep the copy of the first.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import util from '@vscode/test-electron/out/util.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The file that @vscode/test-electron writes into a copy after its last file.
const COMPLETE = 'is-complete';

/** The version, the platform and the directory of the VS Code copy in the tools directory `base`. */
export function vscodeCopy(base, platform = util.systemDefaultPlatform) {
  const manifest = JSON.parse(readFileSync(join(root, 'packages/template-vscode/package.json'), 'utf8'));
  const version = manifest.engines.vscode.replace(/^\^/, '');
  return { version, platform, directory: join(resolve(base), `vscode-${platform}-${version}`) };
}

const complete = directory => existsSync(join(directory, COMPLETE));

/** The executable of the installed copy; fails with the fix when the copy is missing or incomplete. */
export function installedExecutable(base) {
  const { version, platform, directory } = vscodeCopy(base);
  if (!complete(directory)) throw new Error(`VS Code ${version} is not installed in ${directory}; run make install`);
  return util.downloadDirToExecutablePath(directory, platform);
}

/** Installs the copy into `base` unless it is present; `download` is downloadAndUnzipVSCode of @vscode/test-electron. */
export async function installVSCode(base, download) {
  const { version, platform, directory } = vscodeCopy(base);
  if (complete(directory)) {
    console.log(`[install-vscode] VS Code ${version} is installed in ${directory}`);
    return directory;
  }
  const next = join(resolve(base), `.next-${process.pid}`);
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next, { recursive: true });
  try {
    console.log(`[install-vscode] downloading VS Code ${version} for ${platform} into ${next}`);
    await download({ version, platform, cachePath: next });
    const downloaded = join(next, basename(directory));
    if (!complete(downloaded)) throw new Error(`the download of VS Code ${version} left no complete copy in ${downloaded}`);
    // A copy without its last file is the remainder of an interrupted install; no reader uses it.
    if (!complete(directory)) rmSync(directory, { recursive: true, force: true });
    try {
      renameSync(downloaded, directory);
    } catch (error) {
      if (!complete(directory)) throw error;
    }
    console.log(`[install-vscode] installed VS Code ${version} in ${directory}`);
    return directory;
  } finally {
    rmSync(next, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  if (!base || process.argv.length !== 3) {
    console.error('usage: node scripts/install-vscode.mjs <directory>');
    process.exit(2);
  }
  const { downloadAndUnzipVSCode } = await import('@vscode/test-electron');
  await installVSCode(base, downloadAndUnzipVSCode);
}
