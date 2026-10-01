#!/usr/bin/env node
// Runs the integration suite inside VS Code under the conditions of a user installation: the extension is
// installed from the .vsix into an extensions directory, workspace trust is enabled and the opened folder
// is not trusted. A second run removes `capabilities` from the installed manifest and requires the suite to
// observe that VS Code disables the extension, which shows that the first run detects that regression.
// The VS Code build is the minimum version of engines.vscode and is cached in .vscode-test at the repository root.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const extensionId = `${manifest.publisher}.${manifest.name}`;
const vsix = join(root, 'dist', `${manifest.name}.vsix`);
const version = manifest.engines.vscode.replace(/^\^/, '');

const executable = await downloadAndUnzipVSCode({ version, cachePath: join(root, '..', '..', '.vscode-test') });
const cli = resolveCliPathFromVSCodeExecutablePath(executable);
// VS Code creates its IPC socket in the user data directory; a Unix socket path is limited to about 100
// bytes, so the profiles are created below /tmp instead of the longer per-user temporary directory.
const work = mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'pst-'));

// Installs the .vsix into a new profile and returns its directories.
function installProfile(name) {
  const extensions = join(work, name, 'extensions');
  const userData = join(work, name, 'user-data');
  mkdirSync(join(userData, 'User'), { recursive: true });
  // Keep trust enabled and the folder untrusted; only the startup dialog is suppressed.
  writeFileSync(join(userData, 'User', 'settings.json'), JSON.stringify({
    'security.workspace.trust.enabled': true,
    'security.workspace.trust.startupPrompt': 'never',
  }));
  const install = spawnSync(cli, [`--extensions-dir=${extensions}`, `--user-data-dir=${userData}`, '--install-extension', vsix, '--force'], { encoding: 'utf8' });
  if (install.status !== 0) throw new Error(`installing ${vsix} failed: ${install.stderr}${install.stdout}`);
  return { extensions, userData };
}

function launch(profile, expect) {
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
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { env: { ...process.env, POLYSPEC_TEMPLATE_EXPECT: expect, POLYSPEC_TEMPLATE_EXTENSION: extensionId } });
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', reject);
    child.on('exit', code => resolvePromise(code));
  });
}

let failed = false;
try {
  const installed = installProfile('installed');
  console.log(`[integration] installed ${extensionId} from ${vsix}`);
  const supported = await launch(installed, 'enabled');
  console.log(`[integration] installed extension in an untrusted workspace: exit ${supported}`);
  failed ||= supported !== 0;

  const stripped = installProfile('without-capability');
  const directory = readdirSync(stripped.extensions).find(entry => entry.startsWith(`${extensionId}-`));
  if (directory === undefined) throw new Error(`${extensionId} is not in ${stripped.extensions}`);
  const strippedManifestPath = join(stripped.extensions, directory, 'package.json');
  const strippedManifest = JSON.parse(readFileSync(strippedManifestPath, 'utf8'));
  delete strippedManifest.capabilities;
  writeFileSync(strippedManifestPath, JSON.stringify(strippedManifest, null, 2));
  const restricted = await launch(stripped, 'disabled');
  console.log(`[integration] extension without capabilities in an untrusted workspace: exit ${restricted}`);
  failed ||= restricted !== 0;
} catch (error) {
  console.error(`[integration] ${error instanceof Error ? error.message : String(error)}`);
  failed = true;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
