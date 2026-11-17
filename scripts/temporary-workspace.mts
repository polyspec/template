// The temporary workspaces of the checks and runners that compile and run generated code (T20.1). Every workspace is a
// new directory of var/tmp of the checkout, which Git ignores, so no check of tracked paths sees it, and which no crate of
// the root workspace contains, so a concurrent `cargo test` does not compile it; the run that makes it removes it. It is
// in the checkout so that cargo runs through link cargo of kit with the .links of the checkout (T28.99): a directory
// outside every checkout has no .links, and link cargo runs plain cargo there.
//
// - nodeWorkspace: an ES module directory whose node_modules holds a copy of the renderer of the installed package
//   `@polyspec/template`, so that tsc and Node.js resolve the runtime that generated code imports from it as from the
//   checkout. No symbolic link (AGENTS). Until the TypeScript backend moves to typed programs (docs/spec/compiler.md,
//   Transition), that runtime is the entry `@polyspec/template/render`.
// - rustWorkspace: a crate of its own workspace that depends on packages/rust by path, with the versions of its Cargo.lock
//   and the rust-toolchain.toml of the repository; its tests build into the target of packages/rust, the target of this
//   checkout (T18.7).
// - goWorkspace: a module that is a member of a Go workspace (go.work) together with legacy/packages/go, as the Go adapter of
//   the showcase is, so Go resolves the module of legacy/packages/go from that directory and checks its dependencies by its
//   go.sum (T25.6-1).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCargoLock, type LockPackage } from './install-workspace.mts';
import { pythonEnvironment, pythonPackageCommand } from './python-toolchain.mts';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUST = join(root, 'packages/rust');
const GO = join(root, 'legacy/packages/go');
const TEMPORARY = join(root, 'var/tmp');

/**
 * The command and arguments that run cargo with `args` in `directory` through link cargo of kit, the utility of KIT_LINK
 * that the Makefile exports: with the .links of the checkout the polyspec crates of the linked checkouts are built, without
 * it cargo runs as given (kit docs/operations/local-links.md). A cargo that CARGO names runs as given, as `make CARGO=<cargo>`
 * replaces the cargo of the Makefile, so a test gives its own cargo whatever the links of the checkout are.
 */
export function cargo(directory: string, args: readonly string[]): [string, string[]] {
  const given = process.env.CARGO;
  if (given !== undefined && given !== '') return [given, [...args]];
  const link = process.env.KIT_LINK;
  if (link === undefined || link === '') throw new Error('KIT_LINK is not set; the checks run cargo through link cargo of kit, which the Makefile names');
  return [process.execPath, [link, 'cargo', directory, ...args]];
}

/** A new directory `template-<name>-*` of var/tmp of the checkout. */
export function temporaryDirectory(name: string): string {
  mkdirSync(TEMPORARY, { recursive: true });
  return mkdtempSync(join(TEMPORARY, `template-${name}-`));
}

/**
 * A temporary ES module directory with a copy of the renderer of the installed `@polyspec/template`: its package.json and
 * its folder render, which the entries ./render and ./decode name.
 */
export function nodeWorkspace(name: string): string {
  const installed = join(root, 'node_modules/@polyspec/template');
  if (!existsSync(join(installed, 'render/render.mjs'))) throw new Error(`${relative(root, installed)} has no render; make build-ts builds it`);
  const directory = temporaryDirectory(name);
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`);
  for (const entry of ['package.json', 'render']) cpSync(join(installed, entry), join(directory, 'node_modules/@polyspec/template', entry), { recursive: true });
  return directory;
}

// The packages of a Cargo.lock by `name version` and, for a package of a registry or git, its source.
function lockPackages(text: string): Map<string, LockPackage> {
  return new Map(parseCargoLock(text).packages.map(item => [item.source === undefined ? `${item.name} ${item.version}` : `${item.name} ${item.version} ${item.source}`, item]));
}

/**
 * A temporary crate `template-generated-check` that depends on packages/rust by path;
 * its integration tests go into its directory `tests`. Its Cargo.lock starts as a copy of the root Cargo.lock, the lock of
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
  /** The cargo command and arguments that build and run the test `file` of the workspace offline, with `after` after it. */
  cargoTest: (file: string, ...after: string[]) => [string, string[]];
  /** The environment of a check run of a test: the target of packages/rust, and every warning but dead code an error. */
  checkEnv: NodeJS.ProcessEnv;
}

export function rustWorkspace(name: string): RustWorkspace {
  const directory = temporaryDirectory(name);
  const manifest = join(directory, 'Cargo.toml');
  writeFileSync(manifest, `[package]
name = "template-generated-check"
version = "0.0.0"
edition = "2024"
publish = false

# Its own workspace, not a member of the workspace of the checkout that holds it.
[workspace]

[dependencies]
polyspec-template = { path = ${JSON.stringify(RUST)} }
`);
  // rustup selects the toolchain of the nearest rust-toolchain.toml above the working directory; the workspace carries the
  // toolchain file of the repository, so it builds with the pinned Rust wherever it lies.
  cpSync(join(root, 'rust-toolchain.toml'), join(directory, 'rust-toolchain.toml'));
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src/lib.rs'), '');
  mkdirSync(join(directory, 'tests'));
  const original = readFileSync(join(root, 'Cargo.lock'), 'utf8');
  writeFileSync(join(directory, 'Cargo.lock'), original);
  const targetDirectory = join(RUST, 'target');
  const env = { ...process.env, CARGO_TARGET_DIR: targetDirectory };
  const metadata = spawnSync(...cargo(directory, ['metadata', '--offline', '--format-version', '1', '--manifest-path', manifest]), { cwd: directory, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // --offline: the crates come from the registry of CARGO_HOME, into which make install downloads every Cargo.lock.
  if (metadata.error || metadata.status !== 0) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`cargo metadata --offline of ${directory} failed; a crate of Cargo.lock is not in the registry of CARGO_HOME, run make install: ${metadata.error ? metadata.error.message : metadata.stderr}`);
  }
  const known = lockPackages(original);
  const chosen = [...lockPackages(readFileSync(join(directory, 'Cargo.lock'), 'utf8'))].filter(([key]) => !key.startsWith('template-generated-check '));
  // A package keeps its version, source and checksum; its dependencies can only lose those that only the tests of
  // packages/rust use, such as syn of polyspec-template.
  const other = chosen.filter(([key, entry]) => {
    const original = known.get(key);
    // cargo names a dependency with its version only when the lock holds several versions of it, so a dependency is
    // compared by its name.
    const names = (dependencies: readonly string[]): string[] => dependencies.map(dependency => dependency.split(' ')[0] ?? dependency);
    return !original || original.checksum !== entry.checksum || names(entry.dependencies).some(dependency => !names(original.dependencies).includes(dependency));
  }).map(([key]) => key);
  if (other.length) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`the lock of ${directory} holds packages that Cargo.lock does not: ${other.join(', ')}`);
  }
  return {
    directory, manifest, env, targetDirectory,
    test: file => join(directory, 'tests', `${file}.rs`),
    cargoTest: (file, ...after) => cargo(root, ['test', '--locked', '--offline', '--manifest-path', manifest, '--test', file, ...after]),
    checkEnv: { CARGO_TARGET_DIR: targetDirectory, RUSTFLAGS: '-Dwarnings -Adead-code' },
  };
}

/**
 * A temporary Go module that uses the module of legacy/packages/go from that directory: both are the modules of the go.work of
 * the temporary directory, so the module requires nothing and Go checks the dependencies of legacy/packages/go by its go.sum.
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
