#!/usr/bin/env node
// Downloads the build requirements of the Python package into var/python/wheelhouse (T22.4-20-5):
//
//   node scripts/python-wheelhouse.mjs
//
// packages/template-python/pyproject.toml builds with setuptools, which pip fetches from the network when it builds the
// package. packages/template-python/build-requirements.json pins each requirement by exact version, file and SHA-256
// digest. make install runs this script with the network, and the package install check builds the wheel with
// `pip wheel --no-index --find-links var/python/wheelhouse`, so a check never reads an index. A file that is present
// with the pinned digest is kept; a download whose digest differs from the pin fails and is not written. The file is
// written through a temporary file and a rename, so a reader never finds half a file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The directory that holds the downloaded build requirements. */
export const wheelhouse = join(root, 'var/python/wheelhouse');

/** The pinned build requirements of packages/template-python. */
export function buildRequirements() {
  const lock = JSON.parse(readFileSync(join(root, 'packages/template-python/build-requirements.json'), 'utf8'));
  if (lock.schema !== 1 || !Array.isArray(lock.requirements) || lock.requirements.length === 0) throw new Error('packages/template-python/build-requirements.json has no requirements of schema 1');
  return lock.requirements;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Makes sure that `directory` holds the file of each requirement with its pinned digest. `download(url)` returns the
 * bytes of a URL. Returns the names of the files that it wrote.
 */
export async function ensureWheelhouse(requirements, directory, download) {
  mkdirSync(directory, { recursive: true });
  const written = [];
  for (const { name, version, filename, url, sha256: pinned } of requirements) {
    const path = join(directory, filename);
    if (existsSync(path) && sha256(readFileSync(path)) === pinned) continue;
    const bytes = await download(url);
    const actual = sha256(bytes);
    if (actual !== pinned) throw new Error(`${name} ${version}: ${url} has the SHA-256 digest ${actual}, but packages/template-python/build-requirements.json pins ${pinned}`);
    const next = `${path}.next-${process.pid}`;
    writeFileSync(next, bytes);
    renameSync(next, path);
    written.push(filename);
  }
  return written;
}

/** Fails with the fix when `directory` lacks a requirement file with its pinned digest; returns the directory. */
export function requireWheelhouse(requirements, directory) {
  for (const { filename, sha256: pinned } of requirements) {
    const path = join(directory, filename);
    if (!existsSync(path)) throw new Error(`${path} is missing; run make install, which downloads the build requirements of packages/template-python`);
    const actual = sha256(readFileSync(path));
    if (actual !== pinned) throw new Error(`${path} has the SHA-256 digest ${actual}, but packages/template-python/build-requirements.json pins ${pinned}; run make install`);
  }
  return directory;
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await ensureWheelhouse(buildRequirements(), wheelhouse, fetchBytes);
  console.log(`python-wheelhouse: ${written.length === 0 ? 'every build requirement is present' : `wrote ${written.join(', ')}`} in var/python/wheelhouse`);
}
