#!/usr/bin/env node
// Installs the npm and Go toolchains of this checkout into var/tools (T19.2), which the Makefile puts first on PATH:
//
//   node scripts/install-tools.mjs
//
// npm is the version of `packageManager` in package.json, installed with the npm of the machine into var/tools/npm.
// Go is the version of the go directive of packages/template-go/go.mod, downloaded as the module
// golang.org/toolchain@v0.0.1-go<version>.<os>-<arch> with the Go of the machine into the module cache var/tools/go.
// Each tool gets a wrapper script in var/tools/bin that starts the installed file by its absolute path; there is no
// symbolic link. An install is skipped when the exact version is present, so a second run changes nothing. The npm and
// Go of the machine are not changed. The script prints a line for each step and has no time limit.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOOLS = 'var/tools';
const GO_ARCH = { x64: 'amd64', arm64: 'arm64' };

/** The npm version that `packageManager` of package.json names. */
export function npmVersion(root = ROOT) {
  const manager = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).packageManager ?? '';
  const version = /^npm@(\d+\.\d+\.\d+)$/.exec(manager)?.[1];
  if (!version) throw new Error(`package.json packageManager is ${JSON.stringify(manager)}, expected npm@<major>.<minor>.<patch>`);
  return version;
}

/** The Go version of the go directive of packages/template-go/go.mod. */
export function goVersion(root = ROOT) {
  const version = /^go (\d+\.\d+\.\d+)$/m.exec(readFileSync(path.join(root, 'packages/template-go/go.mod'), 'utf8'))?.[1];
  if (!version) throw new Error('packages/template-go/go.mod has no go directive <major>.<minor>.<patch>');
  return version;
}

/** The module version of the Go toolchain `version` for this platform. */
export function goToolchainModule(version, platform = process.platform, arch = process.arch) {
  if (!GO_ARCH[arch]) throw new Error(`no Go toolchain module for the architecture ${arch}`);
  return `golang.org/toolchain@v0.0.1-go${version}.${platform}-${GO_ARCH[arch]}`;
}

// The environment of the bootstrap npm and Go: the PATH without var/tools/bin, so that a wrapper of an earlier install
// never installs its own replacement.
function bootstrapEnvironment(root) {
  const bin = path.join(root, TOOLS, 'bin');
  const PATH = (process.env.PATH ?? '').split(path.delimiter).filter(entry => path.resolve(entry) !== bin).join(path.delimiter);
  return { ...process.env, PATH };
}

function run(command, args, options) {
  console.log(`[install-tools] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}; install ${command} on the machine to bootstrap ${TOOLS}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
}

// Quotes a path for sh.
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;

// Writes the file through a temporary file and a rename, so a reader never finds it half written.
function writeAtomic(file, text, mode) {
  writeFileSync(`${file}.next-${process.pid}`, text, { mode });
  chmodSync(`${file}.next-${process.pid}`, mode);
  renameSync(`${file}.next-${process.pid}`, file);
}

function wrapper(root, name, text) {
  const file = path.join(root, TOOLS, 'bin', name);
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, text, 0o755);
  console.log(`[install-tools] wrote ${path.relative(root, file)}`);
}

function installNpm(root) {
  const version = npmVersion(root);
  const directory = path.join(root, TOOLS, 'npm');
  const cli = path.join(directory, 'node_modules/npm/bin/npm-cli.js');
  const manifest = path.join(directory, 'node_modules/npm/package.json');
  const present = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : null;
  if (present === version) {
    console.log(`[install-tools] npm ${version} is installed in ${path.relative(root, directory)}`);
  } else {
    // A new install goes into a directory of its own and replaces the previous one with a rename.
    const next = `${directory}.next-${process.pid}`;
    rmSync(next, { recursive: true, force: true });
    mkdirSync(next, { recursive: true });
    writeFileSync(path.join(next, 'package.json'), '{ "private": true }\n');
    run('npm', ['install', '--prefix', next, '--no-save', '--no-package-lock', '--no-bin-links', '--no-audit', '--no-fund', `npm@${version}`], { cwd: next, env: bootstrapEnvironment(root) });
    rmSync(directory, { recursive: true, force: true });
    renameSync(next, directory);
    console.log(`[install-tools] installed npm ${version} in ${path.relative(root, directory)}${present ? ` (was ${present})` : ''}`);
  }
  wrapper(root, 'npm', `#!/bin/sh\n# npm ${version} of this checkout (scripts/install-tools.mjs).\nexec node ${quote(cli)} "$@"\n`);
}

function installGo(root) {
  const version = goVersion(root);
  const module = goToolchainModule(version);
  const cache = path.join(root, TOOLS, 'go');
  const goroot = path.join(cache, module);
  const present = existsSync(path.join(goroot, 'VERSION')) ? readFileSync(path.join(goroot, 'VERSION'), 'utf8').split('\n')[0] : null;
  if (present === `go${version}`) {
    console.log(`[install-tools] Go ${version} is installed in ${path.relative(root, goroot)}`);
  } else {
    mkdirSync(cache, { recursive: true });
    // The module cache of var/tools is writable (-modcacherw), so removing var/ needs no change of permissions.
    run('go', ['mod', 'download', '-x', module], {
      cwd: cache,
      env: { ...bootstrapEnvironment(root), GOMODCACHE: cache, GOFLAGS: '-modcacherw', GOTOOLCHAIN: 'local', GOWORK: 'off', GO111MODULE: 'on' },
    });
    const installed = readFileSync(path.join(goroot, 'VERSION'), 'utf8').split('\n')[0];
    if (installed !== `go${version}`) throw new Error(`${module} holds ${installed}, expected go${version}`);
    console.log(`[install-tools] installed Go ${version} in ${path.relative(root, goroot)}`);
  }
  executable(goroot);
  for (const name of ['go', 'gofmt']) {
    wrapper(root, name, `#!/bin/sh\n# ${name} of Go ${version} of this checkout (scripts/install-tools.mjs).\nGOTOOLCHAIN=local exec ${quote(path.join(goroot, 'bin', name))} "$@"\n`);
  }
}

// The module zip of a Go toolchain keeps no file modes; like the toolchain switch of go, make the commands of bin and
// pkg/tool executable.
function executable(goroot) {
  const tool = path.join(goroot, 'pkg/tool');
  const directories = [path.join(goroot, 'bin'), ...readdirSync(tool).map(name => path.join(tool, name))];
  for (const directory of directories) {
    for (const name of readdirSync(directory)) {
      const file = path.join(directory, name);
      if (statSync(file).isFile() && (statSync(file).mode & 0o111) !== 0o111) chmodSync(file, 0o755);
    }
  }
}

/** Installs npm and Go into var/tools of `root` and writes their wrappers. */
export function installTools(root = ROOT) {
  installNpm(root);
  installGo(root);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    installTools();
  } catch (error) {
    console.error(`[install-tools] ${error.message}`);
    process.exitCode = 1;
  }
}
