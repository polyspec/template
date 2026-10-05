// Tests that the toolchains of the recipes are the ones that the files of the checkout declare (T13.1-4, T19.2), each
// with the expected and the actual version on failure:
// - Node.js is the version of `.node-version`, and every CI job takes Node.js from it;
// - npm is the version of `packageManager` in package.json and Go the version of the go directive of
//   packages/template-go/go.mod, both installed by `make install-tools` into var/tools, whose wrappers the Makefile puts
//   first on PATH; the Makefile exports GOTOOLCHAIN=local, so go never downloads another toolchain;
// - Rust is the toolchain of `rust-toolchain.toml` with the components that `make lint` and `make test-rust` use,
//   installed by one explicit step, never by rustup on the first cargo: several processes that start cargo at once, as
//   the files of one `node --test` run do, each installed it and broke the installs of the others (T18.7-1);
// - make install downloads the crates of every Cargo.lock, which the checks resolve with cargo --offline (T20.1-1);
// - PHP is one of the minor versions of config/toolchain.json and Composer its exact version: setup-php cannot pin a
//   patch, so the minor is the pin and var/full-run.json records the patch of each run;
// - every action of a workflow is pinned by its commit and every job runs on ubuntu-24.04.
// make itself is not pinned: the recipes use no construct newer than GNU Make 3.81, and make 3.81 and GNU Make 4.4.1
// print the same commands for every target (T17.1-4).
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
const TOOLCHAIN = JSON.parse(read('config/toolchain.json'));

// The jobs of a workflow with their text.
function jobs(file) {
  const [, body] = read(file).split(/\njobs:\n/);
  return body.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).map(text => ({ name: text.trim().split(':')[0], text }));
}

// Runs `command` as a recipe line of a second makefile read after the Makefile, so it gets the environment and the
// variables that the recipes of the Makefile get, with `make` (default) or another make; returns its output. A line
// that depends on PATH has shell syntax, like the lines of the Makefile.
function recipe(command, env = {}, make = 'make') {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-toolchain-probe-'));
  try {
    // $(NAME) stays a make reference; every other $ reaches the shell.
    writeFileSync(path.join(directory, 'probe.mk'), `toolchain-probe:\n\t@${command.replace(/\$(?!\()/g, () => '$$')}\n`);
    const probe = spawnSync(make, ['--no-print-directory', '-f', 'Makefile', '-f', path.join(directory, 'probe.mk'), 'toolchain-probe'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env },
    });
    assert.equal(probe.status, 0, `${command} failed in a recipe of the Makefile: ${probe.stdout}${probe.stderr}`);
    return probe.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Node.js is the version of .node-version, which names the major version of the engines of package.json', () => {
  const version = read('.node-version').trim();
  const engines = JSON.parse(read('package.json')).engines.node;
  const major = /^>=(\d+)$/.exec(engines)?.[1];
  assert.ok(major, `package.json engines.node ${engines} is not >=<major>`);
  assert.equal(version.split('.')[0], major, `.node-version ${version} differs from the major version of engines.node ${engines}`);
  const actual = recipe('cd . && node --version');
  assert.equal(actual, `v${version}`, `node of the recipes: expected v${version} (.node-version), actual ${actual}`);
});

test('every CI job that runs Node.js takes it from .node-version', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      if (!/\b(npm|node|make) /.test(job.text)) continue;
      assert.match(job.text, /uses: actions\/setup-node@\S+.*\n\s+with:\n\s+node-version-file: \.node-version\n/, `${file} job ${job.name} does not take Node.js from .node-version`);
      assert.doesNotMatch(job.text, /\bnode-version:/, `${file} job ${job.name} names a Node.js version`);
    }
  }
});

test('npm is the version of packageManager in package.json, from var/tools/bin first on PATH', () => {
  const manager = JSON.parse(read('package.json')).packageManager;
  const expected = /^npm@(\d+\.\d+\.\d+)$/.exec(manager ?? '')?.[1];
  assert.ok(expected, `package.json packageManager: expected npm@<major>.<minor>.<patch>, actual ${manager}`);
  const first = recipe('echo "$PATH"').split(':')[0];
  assert.equal(first, path.join(ROOT, 'var/tools/bin'), `the first entry of PATH of the recipes: expected ${path.join(ROOT, 'var/tools/bin')}, actual ${first}`);
  assert.equal(recipe('command -v npm || true'), path.join(ROOT, 'var/tools/bin/npm'), 'npm of the recipes is not the one of var/tools/bin; run make install-tools');
  const actual = recipe('$(NPM) --version');
  assert.equal(actual, expected, `npm of the recipes: expected ${expected} (package.json packageManager), actual ${actual}; run make install-tools`);
});

test('every recipe line runs npm and go of var/tools/bin, with every make on PATH', () => {
  // GNU Make 3.81 starts a line without shell syntax itself, with the PATH that make started with, also when SHELL names
  // another shell: the line `npm --version` printed the npm of the machine. The recipes start npm as $(NPM), the path of
  // its wrapper, and go and gofmt only in lines with shell syntax, which the shell runs with the exported PATH.
  // gmake is GNU Make 4 where it is installed beside make 3.81.
  const makes = ['make', ...(spawnSync('gmake', ['--version']).status === 0 ? ['gmake'] : [])];
  const npm = JSON.parse(read('package.json')).packageManager.replace('npm@', '');
  const go = `go${/^go (\S+)$/m.exec(read('packages/template-go/go.mod'))[1]}`;
  for (const make of makes) {
    assert.equal(recipe('$(NPM) --version', {}, make), npm, `${make}: the recipe line $(NPM) --version runs another npm than ${npm} of var/tools/bin`);
    assert.equal(recipe('cd packages/template-go && go env GOVERSION', {}, make), go, `${make}: a shell line with go runs another go than ${go} of var/tools/bin`);
  }
  const simple = read('Makefile').split('\n').filter(line => /^\t@?(npm|go|gofmt)\b/.test(line) && !/[;&|<>$`'"(){}*?[\]\\#=~]/.test(line));
  assert.deepEqual(simple, [], 'recipe lines without shell syntax that start npm, go or gofmt with the PATH that make started with');
});

test('Go is the version of the go directive of packages/template-go/go.mod, and go downloads no other toolchain', () => {
  const expected = `go${/^go (\S+)$/m.exec(read('packages/template-go/go.mod'))[1]}`;
  for (const tool of ['go', 'gofmt']) assert.equal(recipe(`command -v ${tool} || true`), path.join(ROOT, `var/tools/bin/${tool}`), `${tool} of the recipes is not the one of var/tools/bin; run make install-tools`);
  const actual = recipe('cd . && go env GOVERSION', { GOTOOLCHAIN: 'auto' });
  assert.equal(actual, expected, `go of the recipes: expected ${expected} (packages/template-go/go.mod), actual ${actual}; run make install-tools`);
  assert.equal(recipe('echo "$GOTOOLCHAIN"', { GOTOOLCHAIN: 'auto' }), 'local', 'the recipes of the Makefile let go download a toolchain');
});

test('go builds into the build cache of the checkout, and no script names another one', () => {
  // T19.14: the generated checks set GOCACHE to the fixed /tmp/template-go-cache, which every checkout and run shared.
  assert.equal(recipe('echo "$GOCACHE"', { GOCACHE: '/tmp/elsewhere' }), path.join(ROOT, 'var/go/cache'), 'the recipes of the Makefile use another Go build cache');
  const named = spawnSync('git', ['grep', '-n', 'GOCACHE', '--', 'scripts', 'tests/runner', 'tools'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.deepEqual(named, [], 'scripts that set their own Go build cache');
});

test('rust-toolchain.toml names the toolchain and the components that cargo of the Rust targets uses', () => {
  const toolchain = read('rust-toolchain.toml');
  const channel = /^channel = "([^"]+)"$/m.exec(toolchain)?.[1];
  const components = JSON.parse(/^components = (\[.*\])$/m.exec(toolchain)?.[1] ?? '[]');
  const cargo = spawnSync(path.join(homedir(), '.cargo/bin/cargo'), ['--version'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cargo.status, 0, cargo.stderr);
  const actual = cargo.stdout.split(' ')[1];
  assert.equal(actual, channel, `cargo of the Rust targets: expected ${channel} (rust-toolchain.toml), actual ${actual}`);
  for (const component of ['rustfmt', 'clippy']) assert.ok(components.includes(component), `rust-toolchain.toml does not name the component ${component}`);
  for (const file of WORKFLOWS) {
    assert.doesNotMatch(read(file), /rust-toolchain@|\btoolchain:/, `${file} names a Rust toolchain other than rust-toolchain.toml`);
  }
});

test('PHP is a minor version of config/toolchain.json and Composer its exact version, also in every CI job', () => {
  const actual = recipe('cd . && php -r "echo PHP_MAJOR_VERSION, \'.\', PHP_MINOR_VERSION;"');
  assert.ok(TOOLCHAIN.php.includes(actual), `php of the recipes: expected a minor version of ${TOOLCHAIN.php.join(', ')} (config/toolchain.json), actual ${actual}`);
  const composer = /Composer version (\S+)/.exec(recipe('composer --version --no-ansi 2>/dev/null'))?.[1];
  assert.equal(composer, TOOLCHAIN.composer, `composer of the recipes: expected ${TOOLCHAIN.composer} (config/toolchain.json), actual ${composer}`);
  for (const file of WORKFLOWS) {
    const text = read(file);
    for (const match of text.matchAll(/php-version: '([^']*)'/g)) assert.ok(TOOLCHAIN.php.includes(match[1]), `${file}: php-version ${match[1]}, expected one of ${TOOLCHAIN.php.join(', ')}`);
    for (const match of text.matchAll(/php: \[([^\]]*)\]/g)) assert.deepEqual(JSON.parse(`[${match[1].replaceAll("'", '"')}]`), TOOLCHAIN.php, `${file}: the PHP matrix differs from config/toolchain.json`);
    for (const match of text.matchAll(/tools: (\S+)/g)) assert.equal(match[1], `composer:${TOOLCHAIN.composer}`, `${file}: tools ${match[1]}, expected composer:${TOOLCHAIN.composer}`);
  }
});

test('make install installs the tools of the checkout, the Rust toolchain and the crates of every Cargo.lock, and no make or CI job lets rustup install it on the first cargo', () => {
  const install = spawnSync('make', ['--no-print-directory', '-n', 'install'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(install.status, 0, install.stderr);
  // The checks resolve crates with cargo --offline, so make install downloads the crates of every Cargo.lock (T20.1-1).
  const cargo = process.env.CARGO ?? path.join(process.env.HOME, '.cargo/bin/cargo');
  const locks = spawnSync('git', ['ls-files', '*Cargo.lock'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.ok(locks.length > 0, 'git ls-files listed no Cargo.lock');
  const fetches = locks.map(lock => `${cargo} fetch --locked --manifest-path ${path.dirname(lock)}/Cargo.toml`);
  assert.deepEqual(install.stdout.split('\n').filter(Boolean), ['node scripts/install-tools.mjs', `${path.join(ROOT, 'var/tools/bin/npm')} ci`, 'rustup toolchain install --no-self-update', ...fetches]);
  assert.equal(recipe('echo "RUSTUP_AUTO_INSTALL=$RUSTUP_AUTO_INSTALL"', { RUSTUP_AUTO_INSTALL: '1' }), 'RUSTUP_AUTO_INSTALL=0', 'the recipes of the Makefile let rustup install a toolchain on the first cargo');
  for (const file of WORKFLOWS) {
    const text = read(file);
    assert.match(text, /\nenv:\n {2}RUSTUP_AUTO_INSTALL: '0'\n/, `${file} does not set RUSTUP_AUTO_INSTALL to 0 for its jobs`);
    assert.doesNotMatch(text, /rustup show/, `${file} runs rustup show, which installs the toolchain as a side effect`);
  }
});

test('every CI job installs with make install and bootstraps the tools of the checkout with Go', () => {
  for (const file of WORKFLOWS) {
    const text = read(file);
    const direct = /- run: (npm ci|npm install|rustup )[^\n]*/.exec(text);
    assert.equal(direct?.[0], undefined, `${file} installs without make install`);
    for (const job of jobs(file)) {
      if (!/- run: .*\bmake /.test(job.text)) continue;
      assert.match(job.text, /uses: actions\/setup-go@\S+.*\n\s+with:\n\s+go-version-file: packages\/template-go\/go\.mod\n/, `${file} job ${job.name} has no Go to bootstrap make install-tools`);
      if (file.endsWith('/ci.yml')) assert.match(job.text, /- run: make install\n/, `${file} job ${job.name} does not install with make install`);
    }
  }
});

test('every action of a workflow is pinned by its commit and every job runs on ubuntu-24.04', () => {
  for (const file of WORKFLOWS) {
    const text = read(file);
    for (const match of text.matchAll(/uses: (\S+)(.*)/g)) {
      assert.match(match[1], /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${file}: ${match[1]} is not pinned by a commit`);
      assert.match(match[2], /^ # v?\d+\.\d+\.\d+$/, `${file}: ${match[1]} does not name its release in a comment`);
    }
    for (const match of text.matchAll(/runs-on: (\S+)/g)) assert.equal(match[1], 'ubuntu-24.04', `${file}: runs-on ${match[1]}, expected ubuntu-24.04`);
  }
});
