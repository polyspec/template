// Tests that the package install check (scripts/check-package-installs.mjs, T19.1) gives the same result at any time
// and on any machine: the Go install project resolves modules only from the proxy of the run, verifies no checksum against a
// database of the network and uses the installed Go toolchain; the Rust install project builds with the toolchain of
// rust-toolchain.toml and with a lock derived from packages/template-rust/Cargo.lock; the PHP install project reads no
// repository other than the package of the run. The commands npm, node, go, composer, php and cargo are stubs that
// record their arguments, their environment and the files of their working directory; nothing is built or downloaded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { installCargoLock, parseCargoLock } from '../../scripts/install-workspace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

// A stub command: it appends one JSON line with its name, arguments, working directory, environment and the files of
// its working directory to STUB_LOG, and creates what the check reads from it.
const STUB = `
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const file = item => (fs.existsSync(item) ? fs.readFileSync(item, 'utf8') : null);
const env = Object.fromEntries(['GOPROXY', 'GOSUMDB', 'GONOSUMDB', 'GOTOOLCHAIN', 'GOFLAGS', 'RUSTUP_TOOLCHAIN', 'COMPOSER_DISABLE_NETWORK'].map(key => [key, process.env[key] ?? null]));
const files = { 'go.mod': file('go.mod'), 'Cargo.toml': file('Cargo.toml'), 'Cargo.lock': file('Cargo.lock'), 'rust-toolchain.toml': file('rust-toolchain.toml'), 'composer.json': file('composer.json') };
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ name, args, cwd: process.cwd(), env, files }) + '\\n');
if (name === 'npm' && args[0] === 'pack') {
  const destination = args[args.indexOf('--pack-destination') + 1];
  fs.writeFileSync(path.join(destination, 'polyspec-template-0.0.1.tgz'), '');
  process.stdout.write('polyspec-template-0.0.1.tgz\\n');
}
if (name === 'go' && args[0] === 'env') process.stdout.write('go1.0.0\\n');
if (name === 'cargo' && args[0] === 'package') {
  const target = path.join(process.env.CARGO_TARGET_DIR, 'package');
  const source = path.join(target, 'polyspec-template-0.0.1');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'Cargo.toml'), '');
  execFileSync('tar', ['-czf', path.join(target, 'polyspec-template-0.0.1.crate'), '-C', target, 'polyspec-template-0.0.1']);
}
`;

function stubs(directory) {
  const bin = path.join(directory, 'bin');
  const cargoBin = path.join(directory, 'home', '.cargo', 'bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(cargoBin, { recursive: true });
  for (const [where, name] of [[bin, 'npm'], [bin, 'node'], [bin, 'go'], [bin, 'composer'], [bin, 'php'], [bin, 'cargo'], [cargoBin, 'cargo']]) {
    writeFileSync(path.join(where, name), `#!${process.execPath}\n${STUB}`, { mode: 0o755 });
  }
  return { bin, home: path.join(directory, 'home'), log: path.join(directory, 'calls.jsonl') };
}

test('the install projects read no network source and use the pinned toolchains and locks', { timeout: 60_000 }, (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-installs-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const stub = stubs(directory);
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-package-installs.mjs')], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, HOME: stub.home, PATH: `${stub.bin}${path.delimiter}${process.env.PATH}`, STUB_LOG: stub.log },
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const calls = readFileSync(stub.log, 'utf8').trim().split('\n').map(line => JSON.parse(line));

  const goCalls = calls.filter(call => call.name === 'go');
  assert.ok(goCalls.length > 0, 'the check started no go command');
  const goVersion = /^go (\S+)$/m.exec(read('packages/template-go/go.mod'))[1];
  for (const call of goCalls) {
    assert.match(call.env.GOPROXY ?? '', /^file:\/\/[^,|]+$/, `go ${call.args.join(' ')} has GOPROXY ${call.env.GOPROXY}, expected only the file proxy of the run`);
    assert.equal(call.env.GOSUMDB, 'off', `go ${call.args.join(' ')} has GOSUMDB ${call.env.GOSUMDB}`);
    assert.equal(call.env.GOTOOLCHAIN, 'local', `go ${call.args.join(' ')} has GOTOOLCHAIN ${call.env.GOTOOLCHAIN}`);
    assert.match(call.files['go.mod'] ?? '', new RegExp(`^go ${goVersion.replaceAll('.', '\\.')}$`, 'm'), `the install project go.mod names another Go version than packages/template-go/go.mod (${goVersion}):\n${call.files['go.mod']}`);
  }

  const cargoRun = calls.filter(call => call.name === 'cargo' && call.args.includes('run'));
  assert.equal(cargoRun.length, 1, `expected one cargo run, got ${cargoRun.length}`);
  const [project] = cargoRun;
  assert.ok(project.args.includes('--locked'), `cargo ${project.args.join(' ')} runs without --locked`);
  assert.equal(project.files['rust-toolchain.toml'], read('rust-toolchain.toml'), 'the Rust install project does not build with the toolchain of rust-toolchain.toml');
  assert.ok(project.files['Cargo.lock'], 'the Rust install project has no Cargo.lock');
  const pinned = new Map(parseCargoLock(read('packages/template-rust/Cargo.lock')).packages.map(item => [`${item.name} ${item.version}`, item.checksum ?? null]));
  for (const item of parseCargoLock(project.files['Cargo.lock']).packages.filter(entry => entry.name !== 'install-check')) {
    assert.ok(pinned.has(`${item.name} ${item.version}`), `the install project lock holds ${item.name} ${item.version}, which packages/template-rust/Cargo.lock does not`);
    assert.equal(item.checksum ?? null, pinned.get(`${item.name} ${item.version}`), `the checksum of ${item.name} ${item.version} differs`);
  }

  const composer = calls.find(call => call.name === 'composer' && call.args[0] === 'install');
  assert.ok(composer, 'the check started no composer install');
  const repositories = JSON.parse(composer.files['composer.json']).repositories;
  assert.ok(repositories.some(repository => repository['packagist.org'] === false), `the PHP install project reads Packagist: ${JSON.stringify(repositories)}`);
});

test('the install project lock holds the packages that the install project reaches, in the text that cargo writes', () => {
  const lock = `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "a"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aa"
dependencies = [
 "b 2.0.0",
]

[[package]]
name = "b"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b1"

[[package]]
name = "b"
version = "2.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b2"

[[package]]
name = "dev"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "dd"
dependencies = [
 "b 1.0.0",
]

[[package]]
name = "lib"
version = "0.0.1"
dependencies = [
 "a",
 "dev",
]
`;
  const derived = installCargoLock(lock, { name: 'install-check', version: '0.0.1', dependencies: ['lib', 'a'], removed: { lib: ['dev'] }, lockPath: 'packages/template-rust/Cargo.lock' });
  assert.equal(derived, `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "a"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aa"
dependencies = [
 "b",
]

[[package]]
name = "b"
version = "2.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b2"

[[package]]
name = "install-check"
version = "0.0.1"
dependencies = [
 "a",
 "lib",
]

[[package]]
name = "lib"
version = "0.0.1"
dependencies = [
 "a",
]
`);
  assert.throws(() => installCargoLock(lock, { name: 'install-check', version: '0.0.1', dependencies: ['missing'], removed: {}, lockPath: 'packages/template-rust/Cargo.lock' }), /missing: packages\/template-rust\/Cargo\.lock holds no package of that name/);
});
