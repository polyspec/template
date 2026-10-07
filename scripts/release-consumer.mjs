#!/usr/bin/env node
// The consumer projects of the release assets (T22.3-1): an npm project and a Composer project, each a committed
// manifest and lock under tests/fixtures/release-consumer, that install the archives of `make release-assets` in a
// directory outside the repository.
//
//   node scripts/release-consumer.mjs lock     write the lock of each consumer project from its manifest
//
// packTreeAssets builds a Git repository with the manifests of the packages of the tree, one placeholder file for each
// path that a package.json names and for the sources of each Composer package, commits it at a fixed date and runs the
// `assets` step of scripts/release.mjs for the tag of the version of the tree. The archives then depend only on the
// manifests of the tree, so the integrity that a lock records changes only with them, and a release that changes the
// version changes the locks in the same commit (`make release-consumer-lock`).
//
// install copies the manifest and the lock of a consumer project and the archives into a directory and runs `npm ci` with
// an empty cache and the scope @polyspec on an unreachable registry, or `composer install` with an empty COMPOSER_HOME and
// cache and an `artifact` repository of the zips: a polyspec package comes only from its archive, and a package of a
// registry only as the lock pins it. `lock` runs `npm install` and `composer update` the same way and copies the lock back.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSETS, PACKAGES, assets } from './release.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = 'tests/fixtures/release-consumer';
// The lock of each consumer project.
export const LOCKS = { npm: 'package-lock.json', composer: 'composer.lock' };
const MANIFESTS = { npm: 'package.json', composer: 'composer.json' };
// The date of the commit of packTreeAssets, which git archive writes into each zip.
const DATE = '2000-01-01T00:00:00Z';
// A registry for the scope @polyspec that refuses every connection.
export const UNREACHABLE = 'http://127.0.0.1:9/';

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  if (result.error || result.status !== 0) {
    throw new Error(`${[command, ...args].join(' ')} in ${cwd} failed: ${result.error?.message ?? `exit ${result.status}`}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

/** The archives of the manifests of the tree in a repository under folder: { directory, version, tag, names }. */
export function packTreeAssets(folder, root = ROOT) {
  const repository = path.join(folder, 'repository');
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const [kind, directory] of PACKAGES) {
    const manifest = MANIFESTS[kind];
    const data = JSON.parse(readFileSync(path.join(root, directory, manifest), 'utf8'));
    mkdirSync(path.join(repository, directory), { recursive: true });
    copyFileSync(path.join(root, directory, manifest), path.join(repository, directory, manifest));
    const files = kind === 'npm' ? [...Object.values(data.bin ?? {}), 'dist/index.mjs'] : [...(data.bin ?? []), 'src/Placeholder.php'];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(repository, directory, file)), { recursive: true });
      writeFileSync(path.join(repository, directory, file), kind === 'npm' ? 'export {};\n' : '<?php\n');
    }
  }
  const identity = { GIT_AUTHOR_NAME: 'release', GIT_AUTHOR_EMAIL: 'release@example.com', GIT_AUTHOR_DATE: DATE,
    GIT_COMMITTER_NAME: 'release', GIT_COMMITTER_EMAIL: 'release@example.com', GIT_COMMITTER_DATE: DATE };
  run('git', ['init', '--quiet', '--initial-branch=main'], repository);
  run('git', ['add', '-A'], repository);
  run('git', ['commit', '--quiet', '--no-gpg-sign', '-m', 'release'], repository, identity);
  const tag = `v${version}`;
  run('git', ['tag', '-a', '--no-sign', tag, '-m', tag], repository, identity);
  const names = assets(repository, tag);
  return { directory: path.join(repository, ASSETS), version, tag, names };
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
    return run('npm', [command, '--cache', path.join(folder, 'npm-cache'), `--@polyspec:registry=${UNREACHABLE}`, '--ignore-scripts', '--no-audit', '--no-fund'], project);
  }
  return run('composer', [command, '--no-interaction', '--no-progress', '--no-plugins', '--no-scripts'], project,
    { COMPOSER_HOME: path.join(folder, 'composer-home'), COMPOSER_CACHE_DIR: path.join(folder, 'composer-cache') });
}

/** Write the lock of each consumer project from its manifest and the archives of packTreeAssets. */
export function lock(root = ROOT) {
  const folder = mkdtempSync(path.join(tmpdir(), 'template-release-consumer-'));
  try {
    const packed = packTreeAssets(folder, root);
    for (const kind of Object.keys(LOCKS)) {
      const project = path.join(folder, `${kind}-project`);
      consumerProject(kind, project, packed, { root, withLock: false });
      install(kind, project, folder, kind === 'npm' ? 'install' : 'update');
      copyFileSync(path.join(project, LOCKS[kind]), path.join(root, FIXTURES, kind, LOCKS[kind]));
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
