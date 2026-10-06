#!/usr/bin/env node
// Builds the C PHP extension of packages/template-php-ext and publishes its shared library (T21.1):
//
//   node scripts/build-php-extension.mjs <source directory> <destination>
//   node scripts/build-php-extension.mjs --arginfo <source directory>
//
// The build copies the sources into a temporary directory of the run outside the checkout, runs phpize, configure and
// make there with the php-config of PATH, and publishes modules/<name>.so to <destination> with
// scripts/publish-build.mjs: through a temporary file and a rename, and only when its bytes change. It runs only when
// its inputs change: the hash of the sources, the stub and the identity of the PHP build (php-config --version, --vernum,
// --include-dir, --extension-dir and --configure-options) is recorded in <destination>.inputs.json, and a build with the same
// hash and a present destination prints that the destination is current.
//
// The arginfo header is generated from the stub by gen_stub.php of the PHP build and committed, because a PIE build
// from the package does not run gen_stub. The build fails when the stub hash that the header records differs from the
// hash of the stub, and names `make ext-arginfo`, which runs this script with --arginfo to generate the header again.
//
// php-config and php must be one PHP: the tests load the library into the php of PATH, so a library built against the
// headers of another version would not load. The build fails with both versions when they differ.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishBuild } from './publish-build.mjs';
import { temporaryDirectory } from './temporary-workspace.mjs';
import { runStepSync } from './test-progress/step.mjs';

// Compiler flags of the checks: every warning of the C sources fails the build. config.m4 adds none, so a PIE build
// with another compiler is not stopped by a new warning.
export const CHECK_CFLAGS = '-O2 -Wall -Wextra -Wno-unused-parameter -Werror';

/** The files of the source directory that the build reads, sorted by name. */
export function sourceFiles(source) {
  return readdirSync(source)
    .filter(name => /\.(c|h)$/.test(name) || name === 'config.m4' || name.endsWith('.stub.php'))
    .sort();
}

/** The stub of the source directory and its generated arginfo header. */
export function stubFiles(source) {
  const stubs = readdirSync(source).filter(name => name.endsWith('.stub.php'));
  if (stubs.length !== 1) throw new Error(`${source} holds ${stubs.length} stub files; the extension has exactly one`);
  const stub = join(source, stubs[0]);
  return { stub, arginfo: stub.replace(/\.stub\.php$/, '_arginfo.h') };
}

/** The hash that gen_stub.php records for a stub: sha1 of the text with LF line ends. */
export function stubHash(text) {
  return createHash('sha1').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

/** Fails with the fix when the arginfo header was not generated from the current stub. */
export function checkArginfo(source) {
  const { stub, arginfo } = stubFiles(source);
  if (!existsSync(arginfo)) throw new Error(`${arginfo} is missing; run make ext-arginfo, which generates it from ${stub}`);
  const recorded = /\* Stub hash: ([0-9a-f]+) \*/.exec(readFileSync(arginfo, 'utf8'))?.[1];
  const expected = stubHash(readFileSync(stub, 'utf8'));
  if (recorded !== expected) {
    throw new Error(`${arginfo} records the stub hash ${recorded ?? '(none)'}, but ${stub} has the hash ${expected}; run make ext-arginfo, which generates the header from the stub`);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`${[command, ...args].join(' ')} failed: ${result.error?.message ?? result.stderr.trim() ?? `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

/** The identity of the PHP build that compiles the extension; fails when php-config and php are not one PHP. */
export function phpIdentity() {
  const config = Object.fromEntries(['version', 'vernum', 'include-dir', 'extension-dir', 'configure-options'].map(option => [option, capture('php-config', [`--${option}`])]));
  const php = capture('php', ['-r', 'echo PHP_VERSION;']);
  if (php !== config.version) {
    throw new Error(`php-config of PATH is PHP ${config.version}, but php of PATH is PHP ${php}; the tests load the extension into php, so both must be one PHP`);
  }
  return config;
}

/** The hash of every input of the build. */
export function inputsHash(source, identity) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ identity, cflags: CHECK_CFLAGS }));
  for (const name of sourceFiles(source)) {
    hash.update(`\0${name}\0`);
    hash.update(readFileSync(join(source, name)));
  }
  return hash.digest('hex');
}

function extensionName(source) {
  const match = /PHP_NEW_EXTENSION\(\[?(\w+)/.exec(readFileSync(join(source, 'config.m4'), 'utf8'));
  if (!match) throw new Error(`${join(source, 'config.m4')} declares no PHP_NEW_EXTENSION`);
  return match[1];
}

/** Builds the extension of `source` into `destination` when its inputs changed. */
export function buildExtension(source, destination) {
  checkArginfo(source);
  const identity = phpIdentity();
  const hash = inputsHash(source, identity);
  const stamp = `${destination}.inputs.json`;
  if (existsSync(destination) && existsSync(stamp) && JSON.parse(readFileSync(stamp, 'utf8')).hash === hash) {
    console.log(`build-php-extension: ${destination} is current with ${source} for PHP ${identity.version}`);
    return false;
  }
  const directory = temporaryDirectory('php-ext');
  try {
    for (const name of sourceFiles(source)) copyFileSync(join(source, name), join(directory, name));
    const env = { ...process.env, CFLAGS: CHECK_CFLAGS };
    runStepSync('phpize', 'phpize', [], { cwd: directory, env });
    runStepSync('configure', './configure', ['--with-php-config=php-config'], { cwd: directory, env });
    runStepSync('make', 'make', [], { cwd: directory, env });
    const library = join(directory, 'modules', `${extensionName(source)}.so`);
    const changed = publishBuild(library, destination);
    const next = `${stamp}.next-${process.pid}`;
    writeFileSync(next, `${JSON.stringify({ hash, php: identity.version }, null, 2)}\n`);
    renameSync(next, stamp);
    console.log(`build-php-extension: ${destination} ${changed ? 'now holds the new build' : 'is current'} of ${source} for PHP ${identity.version}`);
    return changed;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Generates the arginfo header of the stub with gen_stub.php of the PHP build. */
export function generateArginfo(source) {
  const { stub } = stubFiles(source);
  const prefix = capture('php-config', ['--prefix']);
  const candidates = [join(prefix, 'lib/php/build/gen_stub.php'), join(capture('php-config', ['--extension-dir']), 'build/gen_stub.php')];
  const genStub = candidates.find(existsSync);
  if (!genStub) throw new Error(`gen_stub.php of the PHP build is in none of ${candidates.join(', ')}`);
  runStepSync('gen_stub', 'php', [genStub, '--force-regeneration', stub]);
  checkArginfo(source);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--arginfo' && args.length === 2) {
      generateArginfo(args[1]);
    } else if (args.length === 2 && !args[0].startsWith('--')) {
      buildExtension(args[0], args[1]);
    } else {
      console.error(`usage: node scripts/${basename(fileURLToPath(import.meta.url))} <source directory> <destination> | --arginfo <source directory>`);
      process.exit(2);
    }
  } catch (error) {
    console.error(`build-php-extension: ${error.message}`);
    process.exit(1);
  }
}
