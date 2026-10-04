#!/usr/bin/env node
// Runs the integration suite inside VS Code under the conditions of a user installation: the extension is
// installed from the .vsix into an extensions directory, workspace trust is enabled and the opened folder
// is not trusted. A second run removes `capabilities` from the installed manifest and requires the suite to
// observe that VS Code disables the extension, which shows that the first run detects that regression.
// The VS Code build is the minimum version of engines.vscode and is cached in .vscode-test at the repository root.
// Every profile installation and every VS Code launch prints its start and its result with its elapsed time, and
// is killed with its process group when it outlives its deadline.
import { spawn } from 'node:child_process';
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
// The time limits of one profile installation and of one launch, which runs every check of the suite.
const INSTALL_TIMEOUT_MS = 120_000;
const LAUNCH_TIMEOUT_MS = 300_000;
// VS Code 1.138 sometimes takes minutes to exit after the suite has ended and printed its result. The result of a
// launch is the result of its suite, so VS Code gets this long to exit after the suite line before it is killed.
const EXIT_GRACE_MS = 20_000;
const SUITE_RESULT = /\[suite\] (\d+) of (\d+) checks passed/;

const executable = await downloadAndUnzipVSCode({ version, cachePath: join(root, '..', '..', '.vscode-test') });
const cli = resolveCliPathFromVSCodeExecutablePath(executable);
// VS Code creates its IPC socket in the user data directory; a Unix socket path is limited to about 100
// bytes, so the profiles are created below /tmp instead of the longer per-user temporary directory.
const work = mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'pst-'));

// Runs a command in its own process group and resolves its exit code; the group is killed at the deadline.
// `settle` reads the output and returns the code of the step once the output decides it; the command then has
// EXIT_GRACE_MS to exit before the group is killed and the step resolves with that code.
function bounded(step, command, args, { timeoutMs, env, output, settle = () => undefined }) {
  console.log(`[integration] start - ${step} (deadline ${timeoutMs / 1000} s)`);
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    let settled;
    let grace;
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group has ended */ } };
    const read = (data, stream) => {
      output(data, stream);
      if (settled !== undefined) return;
      settled = settle(String(data));
      if (settled !== undefined) grace = setTimeout(kill, EXIT_GRACE_MS);
    };
    child.stdout.on('data', data => read(data, process.stdout));
    child.stderr.on('data', data => read(data, process.stderr));
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); clearTimeout(grace); reject(error); });
    child.on('exit', (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(grace);
      const elapsed = `${((Date.now() - started) / 1000).toFixed(1)} s`;
      let code = exitCode;
      if (settled !== undefined && signal === 'SIGKILL') {
        console.log(`[integration] ${step}: the suite ended, VS Code did not exit within ${EXIT_GRACE_MS / 1000} s and was killed`);
        code = settled;
      } else if (timedOut) {
        reject(new Error(`${step} exceeded its ${timeoutMs / 1000} s deadline and was killed (${elapsed})`));
        return;
      }
      console.log(`[integration] ${code === 0 ? 'ok' : 'not ok'} - ${step}: exit ${code} (${elapsed})`);
      resolvePromise(code);
    });
  });
}

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
  const status = await bounded(`install ${name}`, cli, [`--extensions-dir=${extensions}`, `--user-data-dir=${userData}`, '--install-extension', vsix, '--force'], {
    timeoutMs: INSTALL_TIMEOUT_MS,
    env: process.env,
    output: data => { text += data; },
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
  return bounded(`launch ${name}, expect ${expect}`, executable, args, {
    timeoutMs: LAUNCH_TIMEOUT_MS,
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
