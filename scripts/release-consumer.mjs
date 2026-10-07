#!/usr/bin/env node
// The consumer projects of the release assets (T22.3-1, T22.3-2): an npm project and a Composer project, each a committed
// manifest and lock under tests/fixtures/release-consumer, that install the archives of the packages of the tree in a
// directory outside the repository.
//
//   node scripts/release-consumer.mjs lock     write the lock of each consumer project from its manifest
//
// packTree packs the archives of the built packages of the tree with packArchives of scripts/release.mjs, the step of
// `make release-assets`, for the tag of the version of the tree at HEAD. The npm project installs every npm package of the
// release, so its lock pins the registry packages that they depend on, the peer dependencies of
// @polyspec/template-codemirror included, by exact version and integrity; the Composer project requires polyspec/template.
// The archives under test are built in the same run, so the locks record them by name and version only: no `integrity`
// for an npm package of @polyspec and an empty `shasum` for a Composer package of polyspec. A lock then changes only with a
// version or a dependency, and a release that changes the version changes the locks in the same commit
// (`make release-consumer-lock`).
//
// install copies the manifest and the lock of a consumer project and the archives into a directory and runs `npm ci` with
// an empty cache and the scope @polyspec on an unreachable registry, or `composer install` with an empty COMPOSER_HOME and
// cache and an `artifact` repository of the zips: a polyspec package comes only from its archive, and a registry package is
// downloaded only as the lock pins it. `lock` runs `npm install` and `composer update` the same way, which resolve version
// ranges, so `make release-consumer-lock` runs it with $(ONLINE) and no check runs it.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packArchives } from './release.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = 'tests/fixtures/release-consumer';
// The lock of each consumer project.
export const LOCKS = { npm: 'package-lock.json', composer: 'composer.lock' };
const MANIFESTS = { npm: 'package.json', composer: 'composer.json' };
// A registry for the scope @polyspec that refuses every connection.
export const UNREACHABLE = 'http://127.0.0.1:9/';

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  if (result.error || result.status !== 0) {
    throw new Error(`${[command, ...args].join(' ')} in ${cwd} failed: ${result.error?.message ?? `exit ${result.status}`}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

/** The archives of the built packages of the tree in folder/assets: { directory, version, tag, names }. */
export function packTree(folder, root = ROOT) {
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tag = `v${version}`;
  const directory = path.join(folder, 'assets');
  mkdirSync(directory, { recursive: true });
  const names = packArchives(root, 'HEAD', tag, directory);
  return { directory, version, tag, names };
}

/** A consumer project of kind in project: its manifest, its lock unless without, and the archives that it installs. */
export function consumerProject(kind, project, packed, { root = ROOT, withLock = true } = {}) {
  mkdirSync(project, { recursive: true });
  const fixture = path.join(root, FIXTURES, kind);
  copyFileSync(path.join(fixture, MANIFESTS[kind]), path.join(project, MANIFESTS[kind]));
  if (withLock) copyFileSync(path.join(fixture, LOCKS[kind]), path.join(project, LOCKS[kind]));
  const extension = kind === 'npm' ? '.tgz' : '.zip';
  const target = kind === 'npm' ? project : path.join(project, 'artifacts');
  mkdirSync(target, { recursive: true });
  for (const name of packed.names.filter(file => file.endsWith(extension))) copyFileSync(path.join(packed.directory, name), path.join(target, name));
}

/** Install the consumer project of kind in project with empty caches under folder: `npm ci` or `composer install`. */
export function install(kind, project, folder, command = kind === 'npm' ? 'ci' : 'install') {
  if (kind === 'npm') {
    // The Makefile runs npm offline; a download that the lock pins by version and integrity is installation (AGENTS).
    return run('npm', [command, '--offline=false', '--cache', path.join(folder, 'npm-cache'), `--@polyspec:registry=${UNREACHABLE}`, '--ignore-scripts', '--no-audit', '--no-fund'], project);
  }
  return run('composer', [command, '--no-interaction', '--no-progress', '--no-plugins', '--no-scripts'], project,
    { COMPOSER_HOME: path.join(folder, 'composer-home'), COMPOSER_CACHE_DIR: path.join(folder, 'composer-cache') });
}

/** The lock of kind without the hashes of the polyspec archives, which each run builds again. */
export function withoutArchiveHashes(kind, lock) {
  if (kind === 'npm') {
    for (const [key, entry] of Object.entries(lock.packages)) if (key.startsWith('node_modules/@polyspec/')) delete entry.integrity;
  } else {
    for (const entry of [...lock.packages, ...(lock['packages-dev'] ?? [])]) if (entry.name.startsWith('polyspec/')) entry.dist.shasum = '';
  }
  return lock;
}

/** Write the lock of each consumer project from its manifest and the archives of packTree. */
export function lock(root = ROOT) {
  const folder = mkdtempSync(path.join(tmpdir(), 'template-release-consumer-'));
  try {
    const packed = packTree(folder, root);
    for (const kind of Object.keys(LOCKS)) {
      const project = path.join(folder, `${kind}-project`);
      consumerProject(kind, project, packed, { root, withLock: false });
      install(kind, project, folder, kind === 'npm' ? 'install' : 'update');
      const written = withoutArchiveHashes(kind, JSON.parse(readFileSync(path.join(project, LOCKS[kind]), 'utf8')));
      writeFileSync(path.join(root, FIXTURES, kind, LOCKS[kind]), `${JSON.stringify(written, null, kind === 'npm' ? 2 : 4)}\n`);
      console.log(`[release-consumer] wrote ${FIXTURES}/${kind}/${LOCKS[kind]} for ${packed.tag}`);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(' ') !== 'lock') {
    console.error('usage: node scripts/release-consumer.mjs lock');
    process.exitCode = 2;
  } else {
    lock();
  }
}
