// The temporary workspaces of the checks and runners that compile and run generated code (T20.1). Every workspace is a
// new directory of the system temporary directory, never a directory of the checkout: the test files of one
// `node --test` run start these checks at once, and files that a check writes into the checkout are seen by the other
// checks, such as the owner check of every tracked path, and compiled by a concurrent `cargo test` of the crate.
//
// - nodeWorkspace: an ES module directory whose node_modules holds copies of installed packages of this repository, so
//   that tsc and Node.js resolve `@polyspec/template` from it as from the checkout. No symbolic link (AGENTS).
// - rustWorkspace: a crate that depends on packages/rust by path, with the versions of its Cargo.lock and the
//   rust-toolchain.toml of the repository; its tests build into the target of packages/rust, the target of this
//   checkout (T18.7).
// - goWorkspace: a module that is a member of a Go workspace (go.work) together with packages/go, as the Go adapter of
//   the showcase is, so Go resolves the module of packages/go from that directory and checks its dependencies by its
//   go.sum (T25.6-1).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCargoLock, type LockPackage } from './install-workspace.mts';
import { pythonEnvironment, pythonPackageCommand } from './python-toolchain.mts';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUST = join(root, 'packages/rust');
const GO = join(root, 'packages/go');
function home(): string {
  const value = process.env.HOME;
  if (value === undefined) throw new Error('HOME is not set; the cargo of the checks is $HOME/.cargo/bin/cargo');
  return value;
}
export const CARGO = resolve(home(), '.cargo/bin/cargo');

/** A new directory `template-<name>-*` of the system temporary directory. */
export function temporaryDirectory(name: string): string {
  return mkdtempSync(join(tmpdir(), `template-${name}-`));
}

/** A temporary ES module directory with copies of the installed `packages`. */
export function nodeWorkspace(name: string, packages: readonly string[] = ['@polyspec/template']): string {
  const directory = temporaryDirectory(name);
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`);
  for (const name of packages) {
    const installed = join(root, 'node_modules', name);
    if (!existsSync(join(installed, 'dist'))) throw new Error(`${relative(root, installed)} has no dist; make build-ts builds and installs it`);
    cpSync(installed, join(directory, 'node_modules', name), { recursive: true });
  }
  return directory;
}

// The packages of a Cargo.lock by `name version` and, for a package of a registry or git, its source.
function lockPackages(text: string): Map<string, LockPackage> {
  return new Map(parseCargoLock(text).packages.map(item => [item.source === undefined ? `${item.name} ${item.version}` : `${item.name} ${item.version} ${item.source}`, item]));
}

/**
 * A temporary crate `template-generated-check` that depends on packages/rust by path and on its serde_json;
 * its integration tests go into its directory `tests`. Its Cargo.lock starts as a copy of the lock of
 * packages/rust; cargo adds the crate and drops the dependencies that only the tests of packages/rust use, and
 * the workspace fails when cargo chose any other package or version. Returns the directory, its manifest, the path of
 * the integration test `<test>.rs` and the environment of its cargo commands.
 */
export interface RustWorkspace {
  directory: string;
  manifest: string;
  env: NodeJS.ProcessEnv;
  targetDirectory: string;
  test: (file: string) => string;
}

export function rustWorkspace(name: string): RustWorkspace {
  const directory = temporaryDirectory(name);
  const manifest = join(directory, 'Cargo.toml');
  writeFileSync(manifest, `[package]
name = "template-generated-check"
version = "0.0.0"
edition = "2024"
publish = false

[dependencies]
polyspec-template = { path = ${JSON.stringify(RUST)} }
serde_json = { version = "1", features = ["preserve_order", "arbitrary_precision"] }
`);
  // rustup selects the toolchain of the nearest rust-toolchain.toml above the working directory; the workspace is outside
  // the checkout, so it carries the toolchain file of the repository and builds with the pinned Rust.
  cpSync(join(root, 'rust-toolchain.toml'), join(directory, 'rust-toolchain.toml'));
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src/lib.rs'), '');
  mkdirSync(join(directory, 'tests'));
  const original = readFileSync(join(RUST, 'Cargo.lock'), 'utf8');
  writeFileSync(join(directory, 'Cargo.lock'), original);
  const targetDirectory = join(RUST, 'target');
  const env = { ...process.env, CARGO_TARGET_DIR: targetDirectory };
  const metadata = spawnSync(CARGO, ['metadata', '--offline', '--format-version', '1', '--manifest-path', manifest], { cwd: directory, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // --offline: the crates come from the registry of CARGO_HOME, into which make install downloads every Cargo.lock.
  if (metadata.error || metadata.status !== 0) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`cargo metadata --offline of ${directory} failed; a crate of packages/rust/Cargo.lock is not in the registry of CARGO_HOME, run make install: ${metadata.error ? metadata.error.message : metadata.stderr}`);
  }
  const known = lockPackages(original);
  const chosen = [...lockPackages(readFileSync(join(directory, 'Cargo.lock'), 'utf8'))].filter(([key]) => !key.startsWith('template-generated-check '));
  // A package keeps its version, source and checksum; its dependencies can only lose those that only the tests of
  // packages/rust use, such as syn of polyspec-template.
  const other = chosen.filter(([key, entry]) => {
    const original = known.get(key);
    return !original || original.checksum !== entry.checksum || entry.dependencies.some(dependency => !original.dependencies.includes(dependency));
  }).map(([key]) => key);
  if (other.length) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`the lock of ${directory} holds packages that packages/rust/Cargo.lock does not: ${other.join(', ')}`);
  }
  return { directory, manifest, env, targetDirectory, test: file => join(directory, 'tests', `${file}.rs`) };
}

/**
 * A temporary Go module that uses the module of packages/go from that directory: both are the modules of the go.work of
 * the temporary directory, so the module requires nothing and Go checks the dependencies of packages/go by its go.sum.
 */
export function goWorkspace(name: string): string {
  const directory = temporaryDirectory(name);
  const module = readFileSync(join(GO, 'go.mod'), 'utf8');
  const version = module.match(/^go (\S+)$/m)?.[1];
  if (version === undefined) throw new Error(`${relative(root, join(GO, 'go.mod'))} names no go version`);
  writeFileSync(join(directory, 'go.mod'), `module polyspec.invalid/generated\n\ngo ${version}\n`);
  writeFileSync(join(directory, 'go.work'), `go ${version}\n\nuse .\nuse ${JSON.stringify(GO)}\n`);
  return directory;
}

/** Runs `command` in `cwd` with `env` added to the environment and returns its output; a status other than 0 fails with the command and its output. */
export function runChecked(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

/**
 * Writes `files` (names and texts) into the new directory `python` of `workspace` and runs its `check.py` with the python of the
 * package (scripts/python-toolchain.mts); returns the output of the script.
 */
export function runPythonCheck(workspace: string, files: Record<string, string>): string {
  const directory = join(workspace, 'python');
  mkdirSync(directory);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return runChecked(pythonPackageCommand(), ['check.py'], directory, pythonEnvironment());
}
