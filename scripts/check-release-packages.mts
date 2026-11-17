#!/usr/bin/env node
// Checks the packages.json of the Composer packages of a release (T28.149): every dist names its shasum, so that a
// consumer can check the archive that PIE or Composer downloads against an integrity pin (HR-80). The 0.0.29 release
// named the php-ext zip of polyspec/hyper-native without a shasum, and no check of the release looked at it.
//
// usage: node scripts/check-release-packages.mts <packages.json>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
if (positionals.length !== 1) {
  console.error('check-release-packages: one argument, the packages.json of the release');
  process.exit(2);
}
const file = positionals[0];
const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
const packages = typeof manifest === 'object' && manifest !== null && 'packages' in manifest ? manifest.packages : undefined;
assert.equal(typeof packages, 'object', `${file} names no packages`);
const unchecked: string[] = [];
let dists = 0;
for (const [name, versions] of Object.entries(packages as Record<string, Record<string, { dist?: { url?: unknown; shasum?: unknown } }>>)) {
  for (const [version, meta] of Object.entries(versions)) {
    dists += 1;
    const dist = meta.dist;
    if (typeof dist?.url !== 'string' || typeof dist.shasum !== 'string' || !/^[0-9a-f]{40}$/.test(dist.shasum)) unchecked.push(`${name} ${version}`);
  }
}
assert.ok(dists > 0, `${file} names no dist`);
assert.deepEqual(unchecked, [], 'every dist of packages.json names a url and a sha1 shasum');
console.error(`[release-packages] ${dists} dists of ${file} name their shasum`);
