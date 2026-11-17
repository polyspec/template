#!/usr/bin/env node
// Checks the packages.json of the Composer packages of a candidate (T28.149) before the tag, by the names of its
// pre-packaged PHP extension (kit release.mjs composerRepository, K1261): PIE replaces such a dist by the platform zip of
// the consumer, so the dist names no shasum, and the name of each platform zip must be the one that the release makes.
//
// Two sets of names must be equal, the names of the platform zips that the packages.json implies and the names that the
// release makes: the dist url basename (the label of the archive) with -php<minor>-<platform>.zip for every pair of the
// php job of assets.yml (platform x PHP minor), against the rule of make release-php-ext in packages/release.mk
// (polyspec-template-php-ext-<version>-php<minor>-<platform>.zip). The pairs must also be the PHP minors of
// config/toolchain.json times the platforms of packages/release.mk. The files of the assets are not looked at: the
// consumer's install checks each platform zip by the digest of its release asset (hyper H35.51).
//
// Every other dist names the sha1 shasum of its archive, as before.
//
// usage: node scripts/check-release-packages.mts <packages.json>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
if (positionals.length !== 1) {
  console.error('check-release-packages: one argument, the packages.json of the candidate');
  process.exit(2);
}
const file = resolve(positionals[0]);
const root = resolve(new URL('..', import.meta.url).pathname);
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
const packages = typeof manifest === 'object' && manifest !== null && 'packages' in manifest ? manifest.packages : undefined;
assert.equal(typeof packages, 'object', `${file} names no packages`);

// The names that the php job of assets.yml builds: its matrix holds platform and php pairs, in lines of their own.
const phpJob = read('.github/workflows/assets.yml').split(/^  php:$/m)[1]?.split(/^    runs-on:/m)[0] ?? '';
const matrix = [...phpJob.matchAll(/- platform: (\S+)\n(?:\s+\S+: .*\n)*?\s+php: '([0-9.]+)'/g)].map(([, platform, minor]) => ({ platform, minor }));
assert.ok(matrix.length > 0, 'assets.yml names no php matrix');
// The platforms that make release-php-ext names, and the PHP minors of config/toolchain.json.
const platforms = [...new Set([...read('packages/release.mk').matchAll(/platform=(\S+) ;;/g)].map(([, platform]) => platform))].sort();
const minors = (JSON.parse(read('config/toolchain.json')) as { phpExtension: { minors: string[] } }).phpExtension.minors;
const pairKey = (platform: string, minor: string): string => `${platform} php${minor}`;
assert.deepEqual(
  matrix.map(({ platform, minor }) => pairKey(platform, minor)).sort(),
  platforms.flatMap(platform => minors.map(minor => pairKey(platform, minor))).sort(),
  'the php job of assets.yml holds every platform of release-php-ext and every PHP minor of config/toolchain.json',
);

const implied: string[] = [];
const made: string[] = [];
let dists = 0;
const failures: string[] = [];
for (const [name, versions] of Object.entries(packages as Record<string, Record<string, { dist?: { url?: unknown; shasum?: unknown }; 'php-ext'?: { 'download-url-method'?: string[] } }>>)) {
  for (const [tag, meta] of Object.entries(versions)) {
    dists += 1;
    const dist = meta.dist;
    if (typeof dist?.url !== 'string') {
      failures.push(`${name} ${tag}: no url`);
      continue;
    }
    if (typeof dist.shasum === 'string' && /^[0-9a-f]{40}$/.test(dist.shasum)) continue;
    if (meta['php-ext']?.['download-url-method']?.includes('pre-packaged-binary') !== true) {
      failures.push(`${name} ${tag}: no sha1 shasum and no pre-packaged-binary php-ext`);
      continue;
    }
    const base = decodeURIComponent(new URL(dist.url).pathname.split('/').pop() ?? '').replace(/\.zip$/, '');
    const version = tag.replace(/^v/, '');
    for (const { platform, minor } of matrix) {
      implied.push(`${base}-php${minor}-${platform}.zip`);
      made.push(`polyspec-template-php-ext-${version}-php${minor}-${platform}.zip`);
    }
  }
}
assert.ok(dists > 0, `${file} names no dist`);
assert.deepEqual(failures, [], 'every dist names its sha1 shasum, or is a pre-packaged php-ext');
assert.deepEqual(implied.sort(), made.sort(), 'the platform zips that the packages.json implies are the names that make release-php-ext makes');
console.error(`[release-packages] ${dists} dists of ${file}; ${implied.length} platform zip names agree with release-php-ext`);
