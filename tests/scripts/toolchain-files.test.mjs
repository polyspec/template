// Tests that the toolchains of the recipes are the ones that the files of the checkout declare (T13.1-4, T19.2), each
// with the expected and the actual version on failure:
// - Node.js is the version of `.node-version`, and every CI job takes Node.js from it;
// - npm is the version of `packageManager` in package.json, installed by `make install-tools TOOLS=npm` into var/tools/bin,
//   and Go the go of mise.toml, which the go directive of packages/go/go.mod equals, installed by `make
//   install-tools` with mise and run by its shim of var/tools/mise/shims (T24.12); kit.mk puts both directories first on
//   PATH, and the Makefile exports GOTOOLCHAIN=local, so go never downloads another toolchain;
// - Rust is the toolchain of `rust-toolchain.toml` with the components that `make lint` and `make test-rust` use,
//   installed by one explicit step, never by rustup on the first cargo: several processes that start cargo at once, as
//   the files of one `node --test` run do, each installed it and broke the installs of the others (T18.7-1);
// - make install downloads the crates of every Cargo.lock, which the checks resolve with cargo --offline (T20.1-1), and
//   every other recipe runs cargo, go and npm offline (T20.1-2);
// - PHP is one of the minor versions of config/toolchain.json: setup-php cannot pin a patch, so the minor is the pin and
//   var/full-run.json records the patch of each run; Composer is the exact release of mise.toml, and setup-php installs
//   no tools;
// - every action of a workflow is pinned by its commit and every job runs on ubuntu-24.04;
// - the last job of ci.yml is ci-passed, the check of ci.yml that a release requires: it runs after every other
//   job (`if: ${{ always() }}`), needs every other job, runs on their runner and runs make ci-passed with the JSON of
//   needs, so it passes only when every other job passed (T22.1-3);
// - release.yml is the release workflow that kit copies (T24.1); kit tests it and make kit-check compares the copy.
// make itself is not pinned: the recipes use no construct newer than GNU Make 3.81, and make 3.81 and GNU Make 4.4.1
// print the same commands for every target (T17.1-4).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { compareText } from '../../scripts/compare-text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
// The workflows of template; a workflow that kit copies (kit.copies of @polyspec/kit) is kit's, and make kit-check compares it.
const KIT_COPIES = new Set(Object.keys(JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('@polyspec/kit/package.json')), 'utf8')).kit.copies));
const WORKFLOWS = readdirSync(path.join(ROOT, '.github/workflows')).filter(name => name.endsWith('.yml')).map(name => `.github/workflows/${name}`).filter(file => !KIT_COPIES.has(file));
const TOOLCHAIN = JSON.parse(read('config/toolchain.json'));
const SHIMS = path.join(ROOT, 'var/tools/mise/shims');
// The tools of mise.toml, read with a TOML parser.
const MISE_TOOLS = parse(read('mise.toml')).tools;

// The jobs of a workflow with their text.
function jobs(file) {
  return jobsOf(read(file));
}

function jobsOf(text) {
  const [, body] = text.split(/\njobs:\n/);
  return body.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).map(job => ({ name: job.trim().split(':')[0], text: job }));
}

// The job ci-passed of ci.yml runs only make ci-passed, which reads the results of the other jobs: it installs nothing,
// runs no check of the suite and writes no report.
const CI_PASSED = 'ci-passed';
const CI_PASSED_RUN = "make ci-passed RESULTS='${{ toJSON(needs) }}'";

// Each broken rule of the job ci-passed of the text of ci.yml (T22.1-3).
export function ciPassedViolations(text) {
  const all = jobsOf(text);
  const job = all.find(entry => entry.name === CI_PASSED);
  if (!job) return [`ci.yml: the job ${CI_PASSED} is missing; a release requires it as the check of ci.yml`];
  const found = [];
  const others = all.filter(entry => entry.name !== CI_PASSED);
  const key = (entry, name) => new RegExp(`^ {4}${name}: (.*)$`, 'm').exec(entry.text)?.[1].trim() ?? '';
  if (all.at(-1).name !== CI_PASSED) found.push(`ci.yml: the job ${CI_PASSED} is not the last job; the jobs are ${all.map(entry => entry.name).join(', ')}`);
  if (key(job, 'if') !== '${{ always() }}') found.push(`ci.yml: the job ${CI_PASSED} has if: '${key(job, 'if')}', not '\${{ always() }}'; it must run after a failed, skipped or cancelled job too`);
  const needs = key(job, 'needs').replace(/^\[|\]$/g, '').split(',').map(name => name.trim()).filter(Boolean);
  if (JSON.stringify([...needs].sort()) !== JSON.stringify(others.map(entry => entry.name).sort())) {
    found.push(`ci.yml: the job ${CI_PASSED} needs [${needs.join(', ')}], not every other job [${others.map(entry => entry.name).join(', ')}]`);
  }
  const runners = [...new Set(others.map(entry => key(entry, 'runs-on')))].sort(compareText);
  if (JSON.stringify([key(job, 'runs-on')]) !== JSON.stringify(runners)) found.push(`ci.yml: the job ${CI_PASSED} runs on '${key(job, 'runs-on')}', not on the runner of the other jobs ${runners.join(', ')}`);
  const runs = [...job.text.matchAll(/^ {6}(?:- )? {0,2}run: (.*)$/gm)].map(match => match[1]);
  const steps = job.text.split(/\n(?= {6}- )/).slice(1);
  if (JSON.stringify(runs) !== JSON.stringify([CI_PASSED_RUN]) || !/run: /.test(steps.at(-1) ?? '') || /\n {8}if:/.test(steps.at(-1) ?? '')) {
    found.push(`ci.yml: the job ${CI_PASSED} runs [${runs.join(', ')}], not the last step ${CI_PASSED_RUN} without a condition of its own`);
  }
  return found;
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

test('Node.js is the version of .node-version, which engines.node of package.json names as its floor', () => {
  const version = read('.node-version').trim();
  const engines = JSON.parse(read('package.json')).engines.node;
  // The floor equals the pin of kit, which .node-version declares (T24.3); make toolchain-check checks every manifest.
  assert.equal(engines, `>=${version}`, `package.json engines.node ${engines} is not >=${version} (.node-version)`);
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

test('every recipe line runs the npm of var/tools/bin and the go of mise, with every make on PATH', { timeout: 240_000 }, () => {
  // GNU Make 3.81 starts a line without shell syntax itself, with the PATH that make started with, also when SHELL names
  // another shell: the line `npm --version` printed the npm of the machine. The recipes start npm as $(NPM), the path of
  // its wrapper, and go and gofmt only in lines with shell syntax, which the shell runs with the exported PATH.
  // gmake is GNU Make 4 where it is installed beside make 3.81.
  const makes = ['make', ...(spawnSync('gmake', ['--version']).status === 0 ? ['gmake'] : [])];
  const npm = JSON.parse(read('package.json')).packageManager.replace('npm@', '');
  const go = `go${/^go (\S+)$/m.exec(read('packages/go/go.mod'))[1]}`;
  for (const make of makes) {
    assert.equal(recipe('$(NPM) --version', {}, make), npm, `${make}: the recipe line $(NPM) --version runs another npm than ${npm} of var/tools/bin`);
    assert.equal(recipe('cd packages/go && go env GOVERSION', {}, make), go, `${make}: a shell line with go runs another go than ${go} of the shims of mise`);
  }
  const simple = read('Makefile').split('\n').filter(line => /^\t@?(npm|go|gofmt)\b/.test(line) && !/[;&|<>$`'"(){}*?[\]\\#=~]/.test(line));
  assert.deepEqual(simple, [], 'recipe lines without shell syntax that start npm, go or gofmt with the PATH that make started with');
});

test('the path of every Go module that go get resolves names its directory in the repository (T22.1-2)', () => {
  // go get github.com/polyspec/template/<directory> finds the module only in that directory of the repository; a module
  // path without a dot in its first element is local to the repository and is never resolved.
  // The fixture of tests/kit is a repository of its own, which the copy of kit tests; it is not a module or a lock of this one.
  const modules = spawnSync('git', ['ls-files', '*go.mod'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.ok(modules.length > 0, 'git ls-files listed no go.mod');
  for (const file of modules) {
    const module = /^module (\S+)$/m.exec(read(file))?.[1];
    assert.ok(module, `${file} declares no module`);
    if (!module.split('/')[0].includes('.')) continue;
    assert.equal(module, `github.com/polyspec/template/${path.dirname(file)}`, `${file}: module ${module}, expected the path of its directory`);
  }
});

test('Go is the go of mise.toml, which the go directive of packages/go/go.mod equals, and go downloads no other toolchain', () => {
  const expected = `go${/^go (\S+)$/m.exec(read('packages/go/go.mod'))[1]}`;
  assert.equal(`go${MISE_TOOLS.go}`, expected, 'the go of mise.toml differs from the go directive of packages/go/go.mod');
  for (const tool of ['go', 'gofmt']) assert.equal(recipe(`command -v ${tool} || true`), path.join(SHIMS, tool), `${tool} of the recipes is not the shim of mise; run make install-tools`);
  const actual = recipe('cd . && go env GOVERSION', { GOTOOLCHAIN: 'auto' });
  assert.equal(actual, expected, `go of the recipes: expected ${expected} (packages/go/go.mod), actual ${actual}; run make install-tools`);
  assert.equal(recipe('echo "$GOTOOLCHAIN"', { GOTOOLCHAIN: 'auto' }), 'local', 'the recipes of the Makefile let go download a toolchain');
});

test('go builds into the build cache of the checkout, and no script names another one', () => {
  // T19.14: the generated checks set GOCACHE to the fixed /tmp/template-go-cache, which every checkout and run shared.
  assert.equal(recipe('echo "$GOCACHE"', { GOCACHE: '/tmp/elsewhere' }), path.join(ROOT, 'var/go/cache'), 'the recipes of the Makefile use another Go build cache');
  // The copies of kit under scripts/kit are kit's: its mise bootstrap keeps the Go cache of mise under var/tools.
  const named = spawnSync('git', ['grep', '-n', 'GOCACHE', '--', 'scripts', 'tests/runner', 'tools', ':!scripts/kit'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
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

test('PHP is a minor version of config/toolchain.json, also in every CI job, and Composer the release of mise.toml', () => {
  const actual = recipe('cd . && php -r "echo PHP_MAJOR_VERSION, \'.\', PHP_MINOR_VERSION;"');
  assert.ok(TOOLCHAIN.php.includes(actual), `php of the recipes: expected a minor version of ${TOOLCHAIN.php.join(', ')} (config/toolchain.json), actual ${actual}`);
  const declared = MISE_TOOLS['http:composer']?.version;
  assert.equal(recipe('command -v composer || true'), path.join(SHIMS, 'composer'), 'composer of the recipes is not the shim of mise; run make install-tools');
  const composer = /Composer version (\S+)/.exec(recipe('composer --version --no-ansi 2>/dev/null'))?.[1];
  assert.equal(composer, declared, `composer of the recipes: expected ${declared} (mise.toml), actual ${composer}`);
  for (const file of WORKFLOWS) {
    const text = read(file);
    for (const match of text.matchAll(/php-version: '([^']*)'/g)) assert.ok(TOOLCHAIN.php.includes(match[1]), `${file}: php-version ${match[1]}, expected one of ${TOOLCHAIN.php.join(', ')}`);
    for (const match of text.matchAll(/php: \[([^\]]*)\]/g)) assert.deepEqual(JSON.parse(`[${match[1].replaceAll("'", '"')}]`), TOOLCHAIN.php, `${file}: the PHP matrix differs from config/toolchain.json`);
    // Composer is a tool of mise.toml, so setup-php installs no tools of its own (T24.12).
    for (const match of text.matchAll(/tools: (\S+)/g)) assert.equal(match[1], 'none', `${file}: setup-php installs tools ${match[1]}; make install-tools installs Composer from mise.toml`);
  }
});

test('make install installs the tools of the checkout, the Rust toolchain and the crates of every Cargo.lock, and no make or CI job lets rustup install it on the first cargo', () => {
  const install = spawnSync('make', ['--no-print-directory', '-n', 'install'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(install.status, 0, install.stderr);
  // The checks resolve crates with cargo --offline, so make install downloads the crates of every Cargo.lock (T20.1-1)
  // with cargo-downloads-fetch of kit. The build requirements of the Python package go to var/python/wheelhouse, which the
  // package install check reads (T22.4-20-5). Only the commands that download leave the offline settings of the recipes
  // (T20.1-2). npm and the packages of package-lock.json are installed before, by make install-tools TOOLS=npm and make
  // install-packages, which install @polyspec/kit (T24.1).
  const online = 'env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK';
  const kit = 'node_modules/@polyspec/kit/dist';
  // make prints the empty TOOLS of install-tools of kit as a trailing space.
  assert.deepEqual(install.stdout.split('\n').filter(Boolean).map(line => line.trimEnd()), [`${online} node ${kit}/install-tools.mjs`, 'rustup toolchain install --no-self-update', `${online} node ${kit}/check-cargo-downloads.mjs --fetch`, `${online} node scripts/composer-install.mjs packages/php`, `${online} node scripts/composer-install.mjs packages/php-ext`, `${online} node scripts/python-wheelhouse.mjs`]);
  assert.equal(recipe('echo "RUSTUP_AUTO_INSTALL=$RUSTUP_AUTO_INSTALL"', { RUSTUP_AUTO_INSTALL: '1' }), 'RUSTUP_AUTO_INSTALL=0', 'the recipes of the Makefile let rustup install a toolchain on the first cargo');
  for (const file of WORKFLOWS) {
    const text = read(file);
    assert.match(text, /\nenv:\n {2}RUSTUP_AUTO_INSTALL: '0'\n/, `${file} does not set RUSTUP_AUTO_INSTALL to 0 for its jobs`);
    assert.doesNotMatch(text, /rustup show/, `${file} runs rustup show, which installs the toolchain as a side effect`);
  }
});

test('every recipe runs cargo, go, npm and Composer offline, so no check reaches a registry', () => {
  const offline = { CARGO_NET_OFFLINE: 'false', GOPROXY: 'https://proxy.golang.org', npm_config_offline: 'false', COMPOSER_DISABLE_NETWORK: '0' };
  assert.equal(recipe('echo "$CARGO_NET_OFFLINE $GOPROXY $npm_config_offline $COMPOSER_DISABLE_NETWORK"', offline), 'true off true 1', 'a recipe of the Makefile lets cargo, go, npm or Composer reach a registry');
  const npm = recipe('$(NPM) config get offline', offline);
  assert.equal(npm, 'true', `npm of the recipes: expected offline true, actual ${npm}`);
  const go = recipe('go env GOPROXY', offline);
  assert.equal(go, 'off', `go of the recipes: expected GOPROXY off, actual ${go}`);
});

test('every CI job installs with make install-tools TOOLS=npm, make install-packages and make install, and sets up no Go', () => {
  for (const file of WORKFLOWS) {
    const text = read(file);
    const direct = /- run: (npm ci|npm install|rustup )[^\n]*/.exec(text);
    assert.equal(direct?.[0], undefined, `${file} installs without make install`);
    for (const job of jobs(file)) {
      if (!/- run: .*\bmake /.test(job.text) || (file.endsWith('/ci.yml') && job.name === CI_PASSED)) continue;
      // make install-tools installs the Go and the Python of mise.toml, so no job sets up a Go or a Python of its own (T24.1, T24.12).
      assert.doesNotMatch(job.text, /uses: actions\/setup-(go|python)@/, `${file} job ${job.name} sets up a Go or a Python of PATH; make install-tools installs those of mise.toml`);
      if (file.endsWith('/ci.yml')) assert.match(job.text, /- run: make install-tools TOOLS=npm\n(?:.*\n)*?\s+- run: make install-packages\n(?:.*\n)*?\s+- run: make install\n/, `${file} job ${job.name} does not install with make install-tools TOOLS=npm, make install-packages and make install`);
    }
  }
});

// The targets that a step of make names, also those of `make ci-targets TARGETS="..."`.
function makeTargets(step) {
  return step.replace(/^.*\bmake\b/, '').replace(/TARGETS="([^"]*)"/, '$1').split(/\s+/).filter(word => /^[a-z][\w-]*$/.test(word));
}

// The targets that `make <targets>` runs: the targets, their prerequisites and, for `check`, the full suite.
function reached(targets) {
  const makefile = read('Makefile');
  const prerequisites = new Map();
  for (const line of makefile.split('\n')) {
    const rule = /^([a-z][\w-]*(?: [a-z][\w-]*)*):(?!=)\s*([^#]*)/.exec(line);
    if (rule) for (const name of rule[1].split(' ')) prerequisites.set(name, rule[2].trim().split(/\s+/).filter(Boolean));
  }
  const suite = /^CHECK_TARGETS := (.*)$/m.exec(makefile)[1].split(/\s+/).filter(Boolean);
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const next of [...(prerequisites.get(name) ?? []), ...(name === 'check' ? suite : [])]) visit(next);
  };
  for (const target of targets) visit(target);
  return seen;
}

test('only the CI jobs that run the VS Code integration test install VS Code, before they run it', () => {
  const install = spawnSync('make', ['--no-print-directory', '-n', 'install'], { cwd: ROOT, encoding: 'utf8' });
  assert.doesNotMatch(install.stdout, /install-vscode/, 'make install downloads VS Code for every job');
  for (const job of jobs('.github/workflows/ci.yml')) {
    const steps = [...job.text.matchAll(/- run: (.*)\n/g)].map(match => match[1]);
    const runs = steps.findIndex(step => /\bmake\b/.test(step) && reached(makeTargets(step)).has('test-vscode-integration'));
    const installs = steps.indexOf('make install-vscode');
    if (runs === -1) assert.equal(installs, -1, `ci.yml job ${job.name} installs VS Code and runs no VS Code integration test`);
    else assert.ok(installs !== -1 && installs < runs, `ci.yml job ${job.name} runs the VS Code integration test without make install-vscode before it`);
  }
});

test('every CI step runs its tools through make, so the recipes give them their offline settings and checks', () => {
  const direct = [];
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      for (const [, block] of job.text.matchAll(/- run: (\|\n(?:\s{10,}.*\n?)+|.*)/g)) {
        for (const line of block.replace(/^\|\n/, '').split('\n').map(line => line.trim()).filter(Boolean)) {
          const command = line.replace(/^xvfb-run(?: -\S+)* /, '');
          if (/^(?:node|npm|npx|cargo|go|php|composer|rustup)\b/.test(command)) direct.push(`${file} job ${job.name}: ${line}`);
        }
      }
    }
  }
  assert.deepEqual(direct, [], 'CI steps that start a tool without make; run it through its make target');
});

test('every CI job runs its targets past failures and uploads their report, also after a failure', () => {
  const SETUP = new Set(['install', 'install-tools', 'install-packages', 'install-vscode', 'install-browsers']);
  const REPORTS = { check: 'var/report/full-run/', 'ci-targets': 'var/report/ci-targets/' };
  const problems = [];
  for (const job of jobs('.github/workflows/ci.yml').filter(entry => entry.name !== CI_PASSED)) {
    const lines = [...job.text.matchAll(/- run: (\|\n(?:\s{10,}.*\n?)+|.*)/g)].flatMap(([, block]) => block.replace(/^\|\n/, '').split('\n').map(line => line.trim()).filter(Boolean));
    const runners = new Set();
    for (const line of lines.filter(line => /\bmake\b/.test(line))) {
      const [target] = makeTargets(line);
      if (target in REPORTS) runners.add(target);
      else if (!SETUP.has(target)) problems.push(`${job.name}: \`${line}\` runs a check without make check or make ci-targets, so it stops at a failure and leaves no report`);
    }
    if (runners.size === 0) problems.push(`${job.name}: no step runs make check or make ci-targets`);
    for (const runner of runners) {
      const upload = new RegExp(`- uses: actions/upload-artifact@\\S+.*\\n\\s+if: \\$\\{\\{ !cancelled\\(\\) \\}\\}\\n\\s+with:\\n\\s+name: report-.+\\n\\s+path: (?:\\|\\n(?:\\s+.*\\n)*?\\s+${REPORTS[runner].replace(/[/.]/g, '\\$&')}\\n|${REPORTS[runner].replace(/[/.]/g, '\\$&')}\\n)\\s+if-no-files-found: error\\n`);
      if (!upload.test(job.text)) problems.push(`${job.name}: no upload of ${REPORTS[runner]} under if: !cancelled() with if-no-files-found: error`);
    }
  }
  assert.deepEqual(problems, []);
});

test('a job of a matrix runs every combination to its end, also after another combination failed (T20.1-13)', () => {
  // GitHub cancels the other jobs of a matrix at the first failure unless fail-fast is false; CI lost the
  // result of PHP 8.5 that way when PHP 8.2 failed.
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      if (!/\n {4}strategy:\n/.test(job.text)) continue;
      assert.match(job.text, /\n {4}strategy:\n {6}fail-fast: false\n/, `${file} job ${job.name} has a matrix that cancels its other jobs at the first failure`);
    }
  }
});

test('no push cancels the running CI of an earlier push (T17.1-7)', () => {
  // The run of a push to main is the evidence of the commit that a release tags, so a newer push does not replace it.
  for (const file of WORKFLOWS) {
    const text = read(file);
    const [, triggers = ''] = /\non:\n((?: {2}.*\n|\s*\n)+)/.exec(`\n${text}`) ?? [];
    // A tag push runs a release, which no later push replaces.
    if (!/^ {2}push:/m.test(triggers) || /^ {4}tags:/m.test(triggers)) continue;
    assert.match(text, /\nconcurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: false\n/, `${file} has no concurrency group of its workflow and ref that cancels no run`);
  }
});

test('each workflow of template declares exactly its triggers: CI and the site on a push to main and on a manual run (T17.1-7, T17.1-9)', () => {
  const triggers = {
    '.github/workflows/ci.yml': 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
    '.github/workflows/pages.yml': 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
    '.github/workflows/dependency-review.yml': "on:\n  schedule:\n    - cron: '17 3 * * *'\n  workflow_dispatch:\n",
  };
  assert.deepEqual([...WORKFLOWS].sort(), Object.keys(triggers).sort());
  for (const [file, block] of Object.entries(triggers)) {
    const [, declared = ''] = /\n(on:\n(?: .*\n)+)/.exec(`\n${read(file)}`) ?? [];
    assert.equal(declared, block, `${file} declares other triggers`);
  }
});

test('ci-passed is the last job of ci.yml, runs always, needs every other job and runs make ci-passed (T22.1-3)', () => {
  const text = read('.github/workflows/ci.yml');
  assert.deepEqual(ciPassedViolations(text), []);
  const [head] = text.split('\n  ci-passed:\n');
  const job = text.slice(head.length);
  const broken = {
    missing: [`${head}\n`, 'the job ci-passed is missing'],
    'not last': [head.replace('\njobs:\n', `\njobs:\n${job.replace(/^\n/, '')}\n`), 'the job ci-passed is not the last job'],
    'not always': [text.replace('    if: ${{ always() }}\n', '    if: ${{ success() }}\n'), "the job ci-passed has if: '${{ success() }}'"],
    'needs one job': [text.replace(/ {4}needs: \[[^\]]*\]\n/, '    needs: [release]\n'), 'the job ci-passed needs [release], not every other job'],
    'another runner': [`${head}${job.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-26.04')}`, "the job ci-passed runs on 'ubuntu-26.04'"],
    'another step': [text.replace(CI_PASSED_RUN, 'make ci-passed'), 'the job ci-passed runs [make ci-passed], not the last step'],
    'skippable step': [text.replace(`        run: ${CI_PASSED_RUN}\n`, `        if: \${{ !cancelled() }}\n        run: ${CI_PASSED_RUN}\n`), 'without a condition of its own'],
  };
  for (const [name, [brokenText, message]] of Object.entries(broken)) {
    assert.notEqual(brokenText, text, name);
    const found = ciPassedViolations(brokenText);
    assert.ok(found.some(issue => issue.includes(message)), `${name}: ${found.join('; ')}`);
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

// The python job of ci.yml runs one interpreter, the python of mise.toml (T22.4-12, T24.12): requires-python is its minor
// (python-requires.test.mjs), so the job has no matrix and no floor job on another interpreter. The interpreter is the
// pinned Python that make install installs (T22.5-5), so the job sets up no Python of its own.
test('the python job of ci.yml runs make install for the pinned interpreter and has no matrix (T22.4-12, T22.5-5)', () => {
  const job = read('.github/workflows/ci.yml').match(/^  python:\n([\s\S]*?)(?=^  [a-z-]+:\n)/m)?.[1];
  assert.ok(job, 'ci.yml has no python job; the check verified nothing');
  assert.ok(!/^\s+matrix:/m.test(job), 'the python job of ci.yml has a matrix; it runs the python of mise.toml only');
  assert.ok(job.includes('run: make install\n'), 'the python job runs make install, which installs the pinned Python');
  assert.ok(!job.includes('actions/setup-python'), 'the python job sets up a Python of PATH; it runs the pinned interpreter');
});

// The python job of ci.yml runs the unit tests, the conformance suite and the generated conformance suite of Python, and
// ci-passed needs the job, so a failing Python run fails the check that the release requires (T22.4-7).
test('the python job of ci.yml runs the Python suites and ci-passed needs it (T22.4-7)', () => {
  const text = read('.github/workflows/ci.yml');
  const job = text.match(/^  python:\n([\s\S]*?)(?=^  [a-z-]+:\n)/m);
  assert.ok(job, 'ci.yml has no python job; the check verified nothing');
  const targets = job[1].match(/make ci-targets TARGETS="([^"]*)"/);
  assert.ok(targets, 'the python job runs no make ci-targets step');
  const run = targets[1].split(/\s+/);
  for (const target of ['test-python', 'conformance-python', 'conformance-generated-python']) {
    assert.ok(run.includes(target), `the python job runs ${run.join(' ')}, expected ${target} among them`);
  }
  const needs = text.match(/^  ci-passed:[\s\S]*?needs: \[([^\]]*)\]/m);
  assert.ok(needs, 'ci.yml has no ci-passed job with needs');
  assert.ok(needs[1].split(',').map(name => name.trim()).includes('python'), `ci-passed needs ${needs[1]}, expected python among them`);
});

// ruff and vulture are tools of mise.toml, which make install installs with the Python of mise.toml (T22.4-33, T24.12),
// so the job that runs lint-python runs make install before it.
test('the job that runs lint-python installs the tools of mise.toml before it, with no setup-python', () => {
  for (const job of jobs('.github/workflows/ci.yml')) {
    if (!/\bTARGETS="[^"]*\blint-python\b/.test(job.text)) continue;
    const install = job.text.indexOf('run: make install\n');
    const lint = job.text.indexOf('lint-python');
    assert.ok(install !== -1 && install < lint, `job ${job.name} runs lint-python without make install before it`);
    assert.ok(!job.text.includes('actions/setup-python'), `job ${job.name} sets up a Python of PATH for ruff`);
  }
});

test('make dependency-review installs the Rust toolchain before cargo-audit and its workflow sets up no Python of PATH', () => {
  const recipe = spawnSync('make', ['--no-print-directory', '-n', 'dependency-review'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.equal(recipe[0], 'rustup toolchain install --no-self-update');
  assert.match(recipe[1], /install-tools\.mjs $/);
  assert.ok(!read('.github/workflows/dependency-review.yml').includes('actions/setup-python'), 'dependency-review.yml sets up a Python of PATH; install-tools installs the pinned one');
});

test('the unit tests of the Python package run in var/python/venv, which python-venv of kit makes from the python of mise.toml', () => {
  // T23.2: the package is installed editable into that environment, so the tests import it with no changed import path (S3).
  const makefile = read('Makefile');
  assert.match(makefile, /^PYTHON_VENV := \$\(shell node scripts\/python-venv\.mjs\)$/m);
  assert.ok(!makefile.includes('var/python/venv'), 'the Makefile restates the environment that config/parity.json declares');
  assert.match(makefile, /^\t\$\(MAKE\) python-venv DIR=\$\(PYTHON_VENV\)$/m);
  assert.match(makefile, /^test-python: python-package .*\n\tnode \$\(KIT\)\/run-tests\.\$\(KIT_EXT\) python --venv \$\(PYTHON_VENV\) -- /m);
});
