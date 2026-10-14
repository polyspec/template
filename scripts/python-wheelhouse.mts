#!/usr/bin/env node
// Downloads the build requirements of the Python package into var/python/wheelhouse (T22.4-20-5):
//
//   node scripts/python-wheelhouse.mts
//
// packages/python/pyproject.toml builds with setuptools, which pip fetches from the network when it builds the
// package. packages/python/build-requirements.json pins each requirement by exact version, file and SHA-256
// digest. make install runs this script with the network, and the package install check builds the wheel with
// `pip wheel --no-index --find-links var/python/wheelhouse`, so a check never reads an index. A file that is present
// with the pinned digest is kept; a download whose digest differs from the pin fails and is not written. The file is
// written through a temporary file and a rename, so a reader never finds half a file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonDocument } from './json-document.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The directory that holds the downloaded build requirements. */
export const wheelhouse = join(root, 'var/python/wheelhouse');

/** A pinned build requirement of packages/python/build-requirements.json. */
export interface Requirement {
  name: string;
  version: string;
  filename: string;
  url: string;
  sha256: string;
}

// packages/python/build-requirements.json: schema 1 and at least one requirement.
const text = { type: 'string' };
const buildRequirementsDocument = jsonDocument<{ schema: 1; requirements: Requirement[] }>('build requirements of schema 1', {
  type: 'object',
  required: ['schema', 'requirements'],
  properties: {
    schema: { const: 1 },
    requirements: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: ['name', 'version', 'filename', 'url', 'sha256'], properties: { name: text, version: text, filename: text, url: text, sha256: text } },
    },
  },
});

/** The pinned build requirements of packages/python. */
export function buildRequirements(): Requirement[] {
  return buildRequirementsDocument.read(join(root, 'packages/python/build-requirements.json')).requirements;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Makes sure that `directory` holds the file of each requirement with its pinned digest. `download(url)` returns the
 * bytes of a URL. Returns the names of the files that it wrote.
 */
export async function ensureWheelhouse(requirements: Requirement[], directory: string, download: (url: string) => Promise<Uint8Array>): Promise<string[]> {
  mkdirSync(directory, { recursive: true });
  const written: string[] = [];
  for (const { name, version, filename, url, sha256: pinned } of requirements) {
    const path = join(directory, filename);
    if (existsSync(path) && sha256(readFileSync(path)) === pinned) continue;
    const bytes = await download(url);
    const actual = sha256(bytes);
    if (actual !== pinned) throw new Error(`${name} ${version}: ${url} has the SHA-256 digest ${actual}, but packages/python/build-requirements.json pins ${pinned}`);
    const next = `${path}.next-${process.pid}`;
    writeFileSync(next, bytes);
    renameSync(next, path);
    written.push(filename);
  }
  return written;
}

/** Fails with the fix when `directory` lacks a requirement file with its pinned digest; returns the directory. */
export function requireWheelhouse(requirements: Requirement[], directory: string): string {
  for (const { filename, sha256: pinned } of requirements) {
    const path = join(directory, filename);
    if (!existsSync(path)) throw new Error(`${path} is missing; run make install, which downloads the build requirements of packages/python`);
    const actual = sha256(readFileSync(path));
    if (actual !== pinned) throw new Error(`${path} has the SHA-256 digest ${actual}, but packages/python/build-requirements.json pins ${pinned}; run make install`);
  }
  return directory;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await ensureWheelhouse(buildRequirements(), wheelhouse, fetchBytes);
  console.log(`python-wheelhouse: ${written.length === 0 ? 'every build requirement is present' : `wrote ${written.join(', ')}`} in var/python/wheelhouse`);
}
