#!/usr/bin/env node
// Checks the packages.json of the Composer packages of a release (T28.149) against the assets of the release.
//
// Every dist names the sha1 shasum of its archive, so that a consumer can check what Composer downloads against an
// integrity pin (HR-80). The one exception is a dist of a PHP extension whose php-ext.download-url-method holds
// pre-packaged-binary: PIE replaces that dist by the platform zip of the consumer, so the shasum of the source zip would
// name the wrong file (kit release.mjs composerRepository, K1261). For that dist the check requires the platform zips
// instead: one per PHP minor of config/toolchain.json and per native platform of the release, with the label that
// make release-php-ext names them by. Consumers then check each platform zip against the digest of its release asset.
//
// usage: node scripts/check-release-packages.mts <packages.json> <assets folder>
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
if (positionals.length !== 2) {
  console.error('check-release-packages: two arguments, the packages.json of the release and the folder of its assets');
  process.exit(2);
}
const [file, assets] = [resolve(positionals[0]), resolve(positionals[1])];
const root = resolve(new URL('..', import.meta.url).pathname);
const PLATFORMS = ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-arm64'];

const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
const packages = typeof manifest === 'object' && manifest !== null && 'packages' in manifest ? manifest.packages : undefined;
assert.equal(typeof packages, 'object', `${file} names no packages`);
const toolchain: { phpExtension: { minors: string[] } } = JSON.parse(readFileSync(join(root, 'config', 'toolchain.json'), 'utf8'));
const minors = toolchain.phpExtension.minors;

const failures: string[] = [];
let dists = 0;
let platformChecks = 0;
for (const [name, versions] of Object.entries(packages as Record<string, Record<string, { version?: string; dist?: { url?: unknown; shasum?: unknown }; 'php-ext'?: { 'download-url-method'?: string[] } }>>)) {
  for (const [tag, meta] of Object.entries(versions)) {
    dists += 1;
    const dist = meta.dist;
    if (typeof dist?.url !== 'string') {
      failures.push(`${name} ${tag}: no url`);
      continue;
    }
    if (typeof dist.shasum === 'string' && /^[0-9a-f]{40}$/.test(dist.shasum)) continue;
    const prePackaged = meta['php-ext']?.['download-url-method']?.includes('pre-packaged-binary') === true;
    if (!prePackaged) {
      failures.push(`${name} ${tag}: no sha1 shasum and no pre-packaged-binary php-ext`);
      continue;
    }
    // The platform zips are named by the label of the archive of the dist, with the PHP minor and the platform after it:
    // <label>-php<minor>-<platform>.zip (make release-php-ext names them polyspec-template-php-ext-<version>-php<minor>-<platform>).
    const label = decodeURIComponent(new URL(dist.url).pathname.split('/').pop() ?? '').replace(/\.zip$/, '');
    for (const minor of minors) {
      for (const platform of PLATFORMS) {
        platformChecks += 1;
        const zip = `${label}-php${minor}-${platform}.zip`;
        if (!existsSync(join(assets, zip))) failures.push(`${name} ${tag}: the platform zip ${zip} is no asset of the release`);
      }
    }
  }
}
assert.ok(dists > 0, `${file} names no dist`);
assert.deepEqual(failures, [], 'every dist names its shasum, or is a pre-packaged php-ext whose platform zips are assets');
console.error(`[release-packages] ${dists} dists of ${file}; ${platformChecks} platform zips of ${assets} present`);
