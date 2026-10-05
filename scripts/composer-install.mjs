#!/usr/bin/env node
// Installs the Composer packages of composer.lock into vendor of a package (T20.1-3):
//
//   node scripts/composer-install.mjs <directory>
//
// make install runs it with the network, and every other recipe with COMPOSER_DISABLE_NETWORK=1 of the Makefile, so a
// check installs only from vendor and the Composer cache and never reads Packagist. With an unchanged lock it installs
// nothing. A failure names the directory and, when the network is disabled, the fix: run make install.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const directory = process.argv[2];
if (!directory || process.argv.length !== 3) {
  console.error('usage: node scripts/composer-install.mjs <directory>');
  process.exit(2);
}
const run = spawnSync('composer', ['install', '--no-interaction', '--quiet'], { cwd: resolve(directory), stdio: 'inherit' });
if (run.error || run.status !== 0) {
  const cause = run.error ? run.error.message : `exit ${run.status ?? run.signal}`;
  const offline = process.env.COMPOSER_DISABLE_NETWORK === '1'
    ? '; the network is disabled (COMPOSER_DISABLE_NETWORK=1), so a package of composer.lock that is in neither vendor nor the Composer cache fails here: run make install'
    : '';
  console.error(`composer install in ${directory} failed with ${cause}${offline}`);
  process.exit(1);
}
