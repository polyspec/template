// Tests that the check of the packages.json of a candidate (scripts/check-release-packages.mts, T28.149) agrees with the
// names of the platform zips of a pre-packaged PHP extension: the candidate of the release passes, and a candidate that
// names one of its platform zips differently fails with the names that differ. The test writes the packages.json it reads.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(new URL('../..', import.meta.url).pathname);
const URL_PREFIX = 'https://github.com/polyspec/template/releases/download/v0.0.30/';

function candidate(archive: string): unknown {
  return {
    packages: {
      'polyspec/template': {
        'v0.0.30': {
          name: 'polyspec/template',
          version: 'v0.0.30',
          dist: { type: 'zip', url: URL_PREFIX + archive },
          'php-ext': { 'extension-name': 'polyspec_template', 'download-url-method': ['pre-packaged-binary'] },
        },
      },
    },
  };
}

function check(manifest: unknown): { status: number | null; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'template-release-packages-'));
  try {
    const file = join(dir, 'packages.json');
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'check-release-packages.mts'), file], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the candidate names its platform zips as release-php-ext makes them', () => {
  const result = check(candidate('polyspec-template-php-ext-0.0.30.zip'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /6 platform zip names agree with release-php-ext/);
});

test('a candidate with one platform zip name misspelled fails and names the zips that differ', () => {
  const result = check(candidate('polyspec-template-php_ext-0.0.30.zip'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /polyspec-template-php_ext-0\.0\.30-php8\.4-darwin-arm64\.zip/);
  assert.match(result.stderr, /AssertionError/);
});
