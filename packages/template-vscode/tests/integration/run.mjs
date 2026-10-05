#!/usr/bin/env node
// Runs the integration suite inside VS Code under the conditions of a user installation: the extension is
// installed from the .vsix into an extensions directory, workspace trust is enabled and the opened folder
// is not trusted. A second run removes `capabilities` from the installed manifest and requires the suite to
// observe that VS Code disables the extension, which shows that the first run detects that regression.
// The VS Code build is the minimum version of engines.vscode, installed by `make install-vscode` (scripts/install-vscode.mjs)
// into the tools directory of the required option --vscode (`make test-vscode-integration` names var/tools/vscode). The
// run only reads that copy and never downloads; without it, it fails with `run make install-vscode` (T20.1-4, T20.1-6).
// Every profile installation and every VS Code launch is a step without a time limit (step.mjs): it
// prints its start, a line every 10 s while it runs and its result with its elapsed time, and is judged by its
// exit code or by the result of its suite.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';

import { installedExecutable } from '../../../../scripts/install-vscode.mjs';
import { runStep } from './step.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const extensionId = `${manifest.publisher}.${manifest.name}`;
const vsix = join(root, 'dist', `${manifest.name}.vsix`);
const SUITE_RESULT = /\[suite\] (\d+) of (\d+) checks passed/;
const { values } = parseArgs({ options: { vscode: { type: 'string' } } });
if (!values.vscode) throw new Error('--vscode <directory> is required');
const executable = installedExecutable(values.vscode);
console.log(`[integration] VS Code ${executable}`);
const cli = resolveCliPathFromVSCodeExecutablePath(executable);
// VS Code creates its IPC socket in the user data directory; a Unix socket path is limited to about 100
// bytes, so the profiles are created below /tmp instead of the longer per-user temporary directory.
const work = mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'pst-'));

// Installs the .vsix into a new profile and returns its directories.
async function installProfile(name) {
  const extensions = join(work, name, 'extensions');
  const userData = join(work, name, 'user-data');
  mkdirSync(join(userData, 'User'), { recursive: true });
  // Keep trust enabled and the folder untrusted; only the startup dialog is suppressed.
  writeFileSync(join(userData, 'User', 'settings.json'), JSON.stringify({
    'security.workspace.trust.enabled': true,
    'security.workspace.trust.startupPrompt': 'never',
  }));
  let text = '';
  const status = await runStep(`install ${name}`, cli, [`--extensions-dir=${extensions}`, `--user-data-dir=${userData}`, '--install-extension', vsix, '--force'], {
    env: process.env,
    output: (data, stream) => { text += data; stream.write(data); },
  });
  if (status !== 0) throw new Error(`installing ${vsix} failed: ${text}`);
  return { extensions, userData };
}

function launch(name, profile, expect) {
  const args = [
    join(here, 'workspace'),
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--no-cached-data',
    `--extensions-dir=${profile.extensions}`,
    `--user-data-dir=${profile.userData}`,
    `--extensionDevelopmentPath=${join(here, 'harness')}`,
    `--extensionTestsPath=${join(here, 'suite', 'index.cjs')}`,
  ];
  return runStep(`launch ${name}, expect ${expect}`, executable, args, {
    env: { ...process.env, POLYSPEC_TEMPLATE_EXPECT: expect, POLYSPEC_TEMPLATE_EXTENSION: extensionId },
    output: (data, stream) => stream.write(data),
    settle: text => {
      const result = SUITE_RESULT.exec(text);
      return result ? (result[1] === result[2] ? 0 : 1) : undefined;
    },
  });
}

let failed = false;
try {
  const installed = await installProfile('installed');
  console.log(`[integration] installed ${extensionId} from ${vsix}`);
  const supported = await launch('installed', installed, 'enabled');
  console.log(`[integration] installed extension in an untrusted workspace: exit ${supported}`);
  failed ||= supported !== 0;

  const stripped = await installProfile('without-capability');
  const directory = readdirSync(stripped.extensions).find(entry => entry.startsWith(`${extensionId}-`));
  if (directory === undefined) throw new Error(`${extensionId} is not in ${stripped.extensions}`);
  const strippedManifestPath = join(stripped.extensions, directory, 'package.json');
  const strippedManifest = JSON.parse(readFileSync(strippedManifestPath, 'utf8'));
  delete strippedManifest.capabilities;
  writeFileSync(strippedManifestPath, JSON.stringify(strippedManifest, null, 2));
  const restricted = await launch('without-capability', stripped, 'disabled');
  console.log(`[integration] extension without capabilities in an untrusted workspace: exit ${restricted}`);
  failed ||= restricted !== 0;
} catch (error) {
  console.error(`[integration] ${error instanceof Error ? error.message : String(error)}`);
  failed = true;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
