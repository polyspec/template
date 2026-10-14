// Tests that the package install check (scripts/check-package-installs.mts, T19.1) gives the same result at any time
// and on any machine: the Go install project resolves modules only from the proxy of the run, verifies no checksum against a
// database of the network and uses the installed Go toolchain; the Rust install project builds with the toolchain of
// rust-toolchain.toml and with a lock derived from packages/rust/Cargo.lock; the PHP install project reads no
// repository other than the package of the run. The commands npm, node, go, composer, php and cargo are stubs that
// record their arguments, their environment and the files of their working directory; nothing is built or downloaded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { JSONSchemaType } from 'ajv';
import { installCargoLock, parseCargoLock } from '../../scripts/install-workspace.mts';
import { jsonDocument } from '../../scripts/json-document.mts';
import { captured, required } from '../../scripts/required.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// One line that a stub command appends to STUB_LOG.
interface Call {
  name: string;
  args: string[];
  cwd: string;
  env: Record<string, string | null>;
  files: Record<string, string | null>;
}

const NULLABLE_STRINGS: JSONSchemaType<Record<string, string | null>> = {
  type: 'object', required: [], additionalProperties: { type: 'string', nullable: true },
};
const CALL_SCHEMA: JSONSchemaType<Call> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
    cwd: { type: 'string' },
    env: NULLABLE_STRINGS,
    files: NULLABLE_STRINGS,
  },
  required: ['name', 'args', 'cwd', 'env', 'files'],
  additionalProperties: false,
};

const callDocument = jsonDocument<Call>('stub call', CALL_SCHEMA);

// The parts of the composer.json of the PHP install project, of the root composer.lock and of
// packages/php/composer.json that the test reads; each file holds more.
interface InstallProject { repositories: Record<string, unknown>[]; require: Record<string, string> }
const INSTALL_PROJECT_SCHEMA: JSONSchemaType<InstallProject> = {
  type: 'object',
  properties: {
    repositories: { type: 'array', items: { type: 'object', required: [] } },
    require: { type: 'object', required: [], additionalProperties: { type: 'string' } },
  },
  required: ['repositories', 'require'],
};
interface ComposerPackage { name: string; version: string }
const PACKAGE_SCHEMA: JSONSchemaType<ComposerPackage> = {
  type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' } }, required: ['name', 'version'],
};
const LOCK_SCHEMA: JSONSchemaType<{ packages: ComposerPackage[] }> = {
  type: 'object', properties: { packages: { type: 'array', items: PACKAGE_SCHEMA } }, required: ['packages'],
};

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
  // npm names the archive after the name and the version of the packed package.
  const destination = args[args.indexOf('--pack-destination') + 1];
  const packed = JSON.parse(fs.readFileSync(path.join(args[1], 'package.json'), 'utf8'));
  const archive = packed.name.replace(/^@/, '').replace('/', '-') + '-' + packed.version + '.tgz';
  fs.writeFileSync(path.join(destination, archive), '');
  // npm may print notices after the name of the archive; the check computes the name (T19.11).
  process.stdout.write(archive + '\\nnpm notice New minor version of npm available\\n');
}
if (name === 'npm' && args[0] === 'install' && !fs.existsSync(args.at(-1))) {
  process.stderr.write('npm error enoent ' + args.at(-1) + '\\n');
  process.exit(1);
}
if (name === 'go' && args[0] === 'env') process.stdout.write('go1.0.0\\n');
if (name === 'cargo' && args[0] === 'package') {
  // cargo names the package after the name and the version of the [package] section of the manifest.
  const target = path.join(process.env.CARGO_TARGET_DIR, 'package');
  const manifest = fs.readFileSync(args[args.indexOf('--manifest-path') + 1], 'utf8');
  const crate = /^name\\s*=\\s*"([^"]+)"/m.exec(manifest)[1] + '-' + /^version\\s*=\\s*"([^"]+)"/m.exec(manifest)[1];
  const source = path.join(target, crate);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'Cargo.toml'), '');
  execFileSync('tar', ['-czf', path.join(target, crate + '.crate'), '-C', target, crate]);
}
`;

function stubs(directory: string) {
  const bin = path.join(directory, 'bin');
  const cargoBin = path.join(directory, 'home', '.cargo', 'bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(cargoBin, { recursive: true });
  const commands: [string, string][] = [[bin, 'npm'], [bin, 'node'], [bin, 'go'], [bin, 'composer'], [bin, 'php'], [bin, 'cargo'], [cargoBin, 'cargo']];
  for (const [where, name] of commands) {
    writeFileSync(path.join(where, name), `#!${process.execPath}\n${STUB}`, { mode: 0o755 });
  }
  return { bin, home: path.join(directory, 'home'), log: path.join(directory, 'calls.jsonl') };
}

test('the install projects read no network source and use the pinned toolchains and locks', { timeout: 4_980_000 }, (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-installs-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const stub = stubs(directory);
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-package-installs.mts')], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, HOME: stub.home, PATH: `${stub.bin}${path.delimiter}${process.env.PATH}`, STUB_LOG: stub.log },
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const calls = readFileSync(stub.log, 'utf8').trim().split('\n').map(line => callDocument.parse(line, `the stub call ${line}`));

  const goCalls = calls.filter(call => call.name === 'go');
  assert.ok(goCalls.length > 0, 'the check started no go command');
  const goVersion = captured(/^go (\S+)$/m.exec(read('packages/go/go.mod')), 1, 'the go version of packages/go/go.mod');
  for (const call of goCalls) {
    assert.match(required(call.env.GOPROXY, `GOPROXY of go ${call.args.join(' ')}`), /^file:\/\/[^,|]+$/, `go ${call.args.join(' ')} has GOPROXY ${call.env.GOPROXY}, expected only the file proxy of the run`);
    assert.equal(call.env.GOSUMDB, 'off', `go ${call.args.join(' ')} has GOSUMDB ${call.env.GOSUMDB}`);
    assert.equal(call.env.GOTOOLCHAIN, 'local', `go ${call.args.join(' ')} has GOTOOLCHAIN ${call.env.GOTOOLCHAIN}`);
    assert.match(required(call.files['go.mod'], `the go.mod of go ${call.args.join(' ')}`), new RegExp(`^go ${goVersion.replaceAll('.', '\\.')}$`, 'm'), `the install project go.mod names another Go version than packages/go/go.mod (${goVersion}):\n${call.files['go.mod']}`);
  }

  const cargoRun = calls.filter(call => call.name === 'cargo' && call.args.includes('run'));
  assert.equal(cargoRun.length, 1, `expected one cargo run, got ${cargoRun.length}`);
  const [project] = cargoRun;
  assert.ok(project, 'the check started no cargo run');
  assert.ok(project.args.includes('--locked'), `cargo ${project.args.join(' ')} runs without --locked`);
  assert.equal(project.files['rust-toolchain.toml'], read('rust-toolchain.toml'), 'the Rust install project does not build with the toolchain of rust-toolchain.toml');
  const projectLock = project.files['Cargo.lock'];
  assert.ok(projectLock, 'the Rust install project has no Cargo.lock');
  const pinned = new Map(parseCargoLock(read('packages/rust/Cargo.lock')).packages.map(item => [`${item.name} ${item.version}`, item.checksum ?? null]));
  for (const item of parseCargoLock(projectLock).packages.filter(entry => entry.name !== 'install-check')) {
    assert.ok(pinned.has(`${item.name} ${item.version}`), `the install project lock holds ${item.name} ${item.version}, which packages/rust/Cargo.lock does not`);
    assert.equal(item.checksum ?? null, pinned.get(`${item.name} ${item.version}`), `the checksum of ${item.name} ${item.version} differs`);
  }

  const composer = calls.find(call => call.name === 'composer' && call.args[0] === 'install');
  assert.ok(composer, 'the check started no composer install');
  // The archive is installed by its own composer.json, so its require cannot drift from the manifest; the dependencies
  // resolve from the other packages of the root composer.lock, not from Packagist, and their archives come from
  // the Composer cache that make install filled, with the network disabled.
  const installManifest = composer.files['composer.json'];
  assert.ok(installManifest, 'the PHP install project has no composer.json');
  const installProject = jsonDocument<InstallProject>('install project manifest', INSTALL_PROJECT_SCHEMA).parse(installManifest, 'the composer.json of the PHP install project');
  assert.equal(composer.env.COMPOSER_DISABLE_NETWORK, '1', 'the PHP install project may read the network');
  const manifest = jsonDocument<ComposerPackage>('Composer manifest', PACKAGE_SCHEMA).read(path.join(ROOT, 'packages/php/composer.json'));
  const lockPackages = jsonDocument<{ packages: ComposerPackage[] }>('Composer lock', LOCK_SCHEMA).read(path.join(ROOT, 'composer.lock')).packages.filter(item => item.name !== manifest.name);
  assert.deepEqual(installProject.repositories.map(repository => repository.type ?? Object.keys(repository)), [['packagist.org'], 'artifact', 'package'], `the PHP install project reads ${JSON.stringify(installProject.repositories)}, not only the archive of the run and the locked packages`);
  assert.equal(installProject.repositories[0]?.['packagist.org'], false, 'the PHP install project reads Packagist');
  assert.deepEqual(installProject.repositories[2]?.package, lockPackages, 'the package repository is not the other packages of the root composer.lock');
  const locked = Object.fromEntries(lockPackages.map(item => [item.name, item.version]));
  assert.deepEqual(installProject.require, { [manifest.name]: manifest.version, ...locked });
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
  const derived = installCargoLock(lock, { name: 'install-check', version: '0.0.1', dependencies: ['lib', 'a'], removed: { lib: ['dev'] }, lockPath: 'packages/rust/Cargo.lock' });
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
  assert.throws(() => installCargoLock(lock, { name: 'install-check', version: '0.0.1', dependencies: ['missing'], removed: {}, lockPath: 'packages/rust/Cargo.lock' }), /missing: packages\/rust\/Cargo\.lock holds no package of that name/);
});
