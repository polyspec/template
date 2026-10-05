// Creates and removes the temporary directory of the package install check.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Creates a new temporary directory for one install project run. */
export function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'template-installs-'));
}

/**
 * Returns the Go environment that keeps the module cache inside the workspace. Go creates module
 * cache files read-only; `-modcacherw` creates them writable so that the workspace removal can
 * remove them.
 */
export function goModuleEnvironment(workspace) {
  return { GOMODCACHE: join(workspace, 'go-module-cache'), GOFLAGS: '-modcacherw' };
}

/** Removes the workspace of one install project run and fails with its path when the removal fails. */
export function removeWorkspace(workspace) {
  try {
    rmSync(workspace, { recursive: true });
  } catch (error) {
    throw new Error(`failed to remove the install project workspace ${workspace}: ${error.message}`, { cause: error });
  }
}

/**
 * Parses the text of a Cargo.lock: its header lines and its packages, each with its name, version, optional source and
 * checksum, and its dependencies as cargo writes them (`name`, `name version` or `name version (source)`).
 */
export function parseCargoLock(text) {
  const [header, ...blocks] = text.split(/^\[\[package\]\]\n/m);
  const packages = blocks.map((block) => {
    const field = key => new RegExp(`^${key} = "([^"]*)"$`, 'm').exec(block)?.[1];
    const list = /^dependencies = \[\n((?: "[^"]*",\n)*)\]$/m.exec(block)?.[1] ?? '';
    return { name: field('name'), version: field('version'), source: field('source'), checksum: field('checksum'), dependencies: [...list.matchAll(/ "([^"]*)",/g)].map(match => match[1]) };
  });
  return { header: header.trimEnd(), packages };
}

/**
 * Derives the lock of an install project from the lock of the package that it uses (T19.1): the install project `name`
 * `version` depends on `dependencies`, the packages that the install project reaches keep their locked versions and checksums,
 * `removed` names the dependencies to drop from a package, such as the development dependencies of a path dependency,
 * which cargo does not resolve for an install project, and every dependency is written as cargo writes it: by name when the lock
 * holds one version of it, by name and version otherwise. Cargo compares the text of the lock that it would write with
 * the file, so `cargo --locked` accepts the derived lock exactly when it is the lock of the install project.
 */
export function installCargoLock(text, { name, version, dependencies, removed, lockPath }) {
  const lock = parseCargoLock(text);
  const find = (reference) => {
    const [dependency, pinned] = reference.split(' ');
    const matches = lock.packages.filter(item => item.name === dependency && (pinned === undefined || item.version === pinned));
    if (matches.length !== 1) throw new Error(`${reference}: ${lockPath} holds ${matches.length ? `${matches.length} packages` : 'no package'} of that name${matches.length ? '; name the version' : ''}`);
    return matches[0];
  };
  const project = { name, version, dependencies };
  const reached = new Map();
  const visit = (item) => {
    const key = `${item.name} ${item.version}`;
    if (reached.has(key)) return;
    const kept = item.dependencies.filter(reference => !(removed[item.name] ?? []).includes(reference.split(' ')[0]));
    const entries = kept.map(find);
    reached.set(key, { ...item, entries });
    entries.forEach(visit);
  };
  visit({ ...project, entries: [] });
  const packages = [...reached.values()];
  const versions = name => packages.filter(item => item.name === name).length;
  const reference = item => (versions(item.name) > 1 ? `${item.name} ${item.version}` : item.name);
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  packages.sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version));
  const blocks = packages.map((item) => {
    const lines = [`name = "${item.name}"`, `version = "${item.version}"`];
    if (item.source) lines.push(`source = "${item.source}"`);
    if (item.checksum) lines.push(`checksum = "${item.checksum}"`);
    if (item.entries.length) lines.push('dependencies = [', ...item.entries.map(reference).sort(compare).map(entry => ` "${entry}",`), ']');
    return `[[package]]\n${lines.join('\n')}\n`;
  });
  return `${lock.header}\n\n${blocks.join('\n')}`;
}
