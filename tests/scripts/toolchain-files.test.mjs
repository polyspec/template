// Tests that the toolchain files name the toolchains that the repository uses (T13.1-4): `.node-version` names the
// Node.js major version of the engines of package.json and every CI job takes Node.js from it; `rust-toolchain.toml`
// names the toolchain that cargo of the Rust targets runs, with the components that `make lint` and `make test-rust`
// use, and the CI does not name another one. The Rust toolchain is installed by one explicit step, `make install` or
// `rustup toolchain install`, never by rustup on the first cargo: several processes that start cargo at once, as the
// files of one `node --test` run do, each installed it and broke the installs of the others (T18.7-1).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const WORKFLOWS = readdirSync(path.join(ROOT, '.github/workflows')).filter(name => name.endsWith('.yml')).map(name => `.github/workflows/${name}`);

// The jobs of a workflow with their text.
function jobs(file) {
  const [, body] = read(file).split(/\njobs:\n/);
  return body.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).map(text => ({ name: text.trim().split(':')[0], text }));
}

test('.node-version names the Node.js major version of the engines of package.json', () => {
  const version = read('.node-version').trim();
  const engines = JSON.parse(read('package.json')).engines.node;
  const major = /^>=(\d+)$/.exec(engines)?.[1];
  assert.ok(major, `package.json engines.node ${engines} is not >=<major>`);
  assert.equal(version.split('.')[0], major, `.node-version ${version} differs from the major version of engines.node ${engines}`);
});

test('every CI job that runs Node.js takes it from .node-version', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      if (!/\b(npm|node|make) /.test(job.text)) continue;
      assert.match(job.text, /uses: actions\/setup-node@\S+\n\s+with:\n\s+node-version-file: \.node-version\n/, `${file} job ${job.name} does not take Node.js from .node-version`);
      assert.doesNotMatch(job.text, /\bnode-version:/, `${file} job ${job.name} names a Node.js version`);
    }
  }
});

test('rust-toolchain.toml names the toolchain and the components that cargo of the Rust targets uses', () => {
  const toolchain = read('rust-toolchain.toml');
  const channel = /^channel = "([^"]+)"$/m.exec(toolchain)?.[1];
  const components = JSON.parse(/^components = (\[.*\])$/m.exec(toolchain)?.[1] ?? '[]');
  const cargo = spawnSync(path.join(homedir(), '.cargo/bin/cargo'), ['--version'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cargo.status, 0, cargo.stderr);
  assert.match(cargo.stdout, new RegExp(`^cargo ${channel.replaceAll('.', '\\.')} `), `cargo of the Rust targets is ${cargo.stdout.trim()}, rust-toolchain.toml names ${channel}`);
  for (const component of ['rustfmt', 'clippy']) assert.ok(components.includes(component), `rust-toolchain.toml does not name the component ${component}`);
  for (const file of WORKFLOWS) {
    assert.doesNotMatch(read(file), /rust-toolchain@|\btoolchain:/, `${file} names a Rust toolchain other than rust-toolchain.toml`);
  }
});

test('make install installs the Rust toolchain, and no make or CI job lets rustup install it on the first cargo', () => {
  const install = spawnSync('make', ['--no-print-directory', '-n', 'install'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(install.status, 0, install.stderr);
  assert.deepEqual(install.stdout.split('\n').filter(Boolean), ['npm ci', 'rustup toolchain install --no-self-update']);
  // A recipe of a second makefile, read after the Makefile, prints the environment that the recipes of the Makefile get.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-toolchain-probe-'));
  writeFileSync(path.join(directory, 'probe.mk'), 'toolchain-probe:\n\t@echo "RUSTUP_AUTO_INSTALL=$$RUSTUP_AUTO_INSTALL"\n');
  const probe = spawnSync('make', ['--no-print-directory', '-f', 'Makefile', '-f', path.join(directory, 'probe.mk'), 'toolchain-probe'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, RUSTUP_AUTO_INSTALL: '1' },
  });
  rmSync(directory, { recursive: true, force: true });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), 'RUSTUP_AUTO_INSTALL=0', 'the recipes of the Makefile let rustup install a toolchain on the first cargo');
  for (const file of WORKFLOWS) {
    const text = read(file);
    assert.match(text, /\nenv:\n {2}RUSTUP_AUTO_INSTALL: '0'\n/, `${file} does not set RUSTUP_AUTO_INSTALL to 0 for its jobs`);
    assert.doesNotMatch(text, /rustup show/, `${file} runs rustup show, which installs the toolchain as a side effect`);
    for (const command of text.matchAll(/rustup toolchain install[^\n]*/g)) assert.match(command[0], /--no-self-update/, `${file}: ${command[0]} may update rustup itself`);
  }
  const release = jobs('.github/workflows/ci.yml').find(job => job.name === 'release');
  assert.match(release.text, /- run: make install\n/, 'the release job does not install with make install');
});
