// Creates and removes the temporary directory of the package install check.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { tomlArray, tomlString, tomlTable } from './toml.mts';
import { temporaryDirectory } from './temporary-workspace.mts';

/** Creates a new temporary directory for one install project run. */
export function createWorkspace(): string {
  return temporaryDirectory('installs');
}

/**
 * Returns the Go environment that keeps the module cache inside the workspace. Go creates module
 * cache files read-only; `-modcacherw` creates them writable so that the workspace removal can
 * remove them. GOWORK=off: an install project is a module of its own, as a consumer's is, and its workspace lies in var/tmp of
 * the checkout (T28.99), below the go.work of the checkout, which does not list it.
 */
export function goModuleEnvironment(workspace: string): { GOMODCACHE: string; GOFLAGS: string; GOWORK: string } {
  return { GOMODCACHE: join(workspace, 'go-module-cache'), GOFLAGS: '-modcacherw', GOWORK: 'off' };
}

/** Removes the workspace of one install project run and fails with its path when the removal fails. */
export function removeWorkspace(workspace: string): void {
  try {
    rmSync(workspace, { recursive: true });
  } catch (error) {
    throw new Error(`failed to remove the install project workspace ${workspace}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** A package of a Cargo.lock: its name, version, optional source and checksum, and its dependencies as cargo writes them. */
export interface LockPackage {
  name: string;
  version: string;
  source: string | undefined;
  checksum: string | undefined;
  dependencies: string[];
}

/**
 * Parses the text of a Cargo.lock with smol-toml: its packages, each with its name, version, optional source and
 * checksum, and its dependencies as cargo writes them (`name`, `name version` or `name version (source)`), and its header,
 * the text before the first package.
 */
export function parseCargoLock(text: string): { header: string; packages: LockPackage[] } {
  const start = text.search(/^\[\[package\]\]$/m);
  const header = start === -1 ? text : text.slice(0, start);
  const packages = tomlArray(parse(text).package, 'the packages of the Cargo.lock').map((value, index): LockPackage => {
    const item = tomlTable(value, `package ${index} of the Cargo.lock`);
    const optional = (key: string): string | undefined => (item[key] === undefined ? undefined : tomlString(item[key], `the ${key} of package ${index} of the Cargo.lock`));
    return {
      name: tomlString(item.name, `the name of package ${index} of the Cargo.lock`),
      version: tomlString(item.version, `the version of package ${index} of the Cargo.lock`),
      source: optional('source'),
      checksum: optional('checksum'),
      dependencies: item.dependencies === undefined ? [] : tomlArray(item.dependencies, `the dependencies of package ${index} of the Cargo.lock`)
        .map(dependency => tomlString(dependency, `a dependency of package ${index} of the Cargo.lock`)),
    };
  });
  return { header: header.trimEnd(), packages };
}

