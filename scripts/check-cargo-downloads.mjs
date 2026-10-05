#!/usr/bin/env node
// Checks that the crates of every tracked Cargo.lock are in the registry of CARGO_HOME before a check runs cargo
// offline (T20.1-5): `cargo fetch --locked --offline` of each manifest reads no network and fails on a missing crate.
// cargo itself answers a missing crate offline with "retry without --offline", which a check must not do; this check
// names the lock and the fix, run make install, which downloads the crates. Every target that runs cargo depends on it.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CARGO = process.env.CARGO ?? join(process.env.HOME ?? '', '.cargo/bin/cargo');
const listed = spawnSync('git', ['ls-files', '*Cargo.lock'], { cwd: root, encoding: 'utf8' });
if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
const locks = listed.stdout.split('\n').filter(Boolean);
if (locks.length === 0) throw new Error('git ls-files listed no Cargo.lock');
const missing = [];
for (const lock of locks) {
  const fetch = spawnSync(CARGO, ['fetch', '--locked', '--offline', '--manifest-path', join(dirname(lock), 'Cargo.toml')], { cwd: root, encoding: 'utf8' });
  // The first error line of cargo names the crate; its help, to retry without --offline, is not the fix of a check.
  if (fetch.error || fetch.status !== 0) missing.push(`${lock}: ${fetch.error?.message ?? fetch.stderr.split('\n').find(line => line.startsWith('error')) ?? `exit ${fetch.status}`}`);
}
if (missing.length) {
  console.error(`the crates of ${missing.length} of ${locks.length} Cargo.lock files are not in the registry of CARGO_HOME:\n${missing.join('\n')}\nrun make install, which downloads them`);
  process.exit(1);
}
console.log(`[cargo-downloads] the crates of ${locks.length} Cargo.lock files are in the registry of CARGO_HOME`);
