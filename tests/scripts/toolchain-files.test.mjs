// Tests that the toolchains of the recipes are the ones that the files of the checkout declare (T13.1-4, T19.2), each
// with the expected and the actual version on failure:
// - Node.js is the version of `.node-version`, and every CI job takes Node.js from it;
// - npm is the version of `packageManager` in package.json and Go the version of the go directive of
//   packages/template-go/go.mod, both installed by `make install-tools` into var/tools, whose wrappers the Makefile puts
//   first on PATH; the Makefile exports GOTOOLCHAIN=local, so go never downloads another toolchain;
// - Rust is the toolchain of `rust-toolchain.toml` with the components that `make lint` and `make test-rust` use,
//   installed by one explicit step, never by rustup on the first cargo: several processes that start cargo at once, as
//   the files of one `node --test` run do, each installed it and broke the installs of the others (T18.7-1);
// - make install downloads the crates of every Cargo.lock, which the checks resolve with cargo --offline (T20.1-1), and
//   every other recipe runs cargo, go and npm offline (T20.1-2);
// - PHP is one of the minor versions of config/toolchain.json and Composer its exact version: setup-php cannot pin a
//   patch, so the minor is the pin and var/full-run.json records the patch of each run;
// - every action of a workflow is pinned by its commit and every job runs on ubuntu-24.04;
// - the last job of ci.yml is ci-passed, the check of ci.yml that the ruleset main requires: it runs after every other
//   job (`if: ${{ always() }}`), needs every other job, runs on their runner and runs make ci-passed with the JSON of
//   needs, so it passes only when every other job passed (T22.1-3);
// - release.yml runs on the push of a tag vX.Y.Z or <directory>/vX.Y.Z with the permission contents: write, in one job
//   release with the tag in its environment, the whole history checked out and the release steps last and in order
//   (T22.1-4); it is not the job release of ci.yml.
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

// The steps of release.yml in their order (scripts/release.mjs): verify the tagged commit, check the versions, build the
// archives, create the release (T22.1-4).
const RELEASE_STEPS = ['make release-verify', 'make release-versions', 'make release-assets', 'make release-publish'];

// Each broken rule of the text of release.yml (T22.1-4).
export function releaseViolations(text) {
  const found = [];
  if (!/\npermissions:\n {2}contents: write\n(?! )/.test(text)) found.push('release.yml: the permissions are not exactly contents: write, which gh release create needs');
  const all = jobsOf(text);
  if (JSON.stringify(all.map(job => job.name)) !== JSON.stringify(['release'])) {
    found.push(`release.yml: the jobs are ${all.map(job => job.name).join(', ')}, not the one job release`);
    return found;
  }
  const [job] = all;
  if (!/\n {4}env:\n(?: {6}.*\n)*? {6}TAG: \$\{\{ github\.ref_name \}\}\n/.test(job.text)) found.push('release.yml: the job release does not set TAG: ${{ github.ref_name }} in its environment');
  const steps = job.text.split(/\n(?= {6}- )/).slice(1);
  if (!/^ {6}- uses: actions\/checkout@/.test(steps[0] ?? '') || !/\n {10}fetch-depth: 0(\n|$)/.test(steps[0] ?? '')) {
    found.push('release.yml: the first step is not actions/checkout with fetch-depth: 0; the ancestry check needs origin/main');
  }
  const runs = [...job.text.matchAll(/^ {6}(?:- )? {0,2}run: (.*)$/gm)].map(match => match[1]);
  if (JSON.stringify(runs.slice(-RELEASE_STEPS.length)) !== JSON.stringify(RELEASE_STEPS)) {
    found.push(`release.yml: the steps run [${runs.join(', ')}], not the release steps [${RELEASE_STEPS.join(', ')}] last and in order`);
  }
  return found;
}

// Each broken rule of the job ci-passed of the text of ci.yml (T22.1-3).
export function ciPassedViolations(text) {
  const all = jobsOf(text);
  const job = all.find(entry => entry.name === CI_PASSED);
  if (!job) return [`ci.yml: the job ${CI_PASSED} is missing; the ruleset main requires it as the check of ci.yml`];
  const found = [];
  const others = all.filter(entry => entry.name !== CI_PASSED);
  const key = (entry, name) => new RegExp(`^ {4}${name}: (.*)$`, 'm').exec(entry.text)?.[1].trim() ?? '';
  if (all.at(-1).name !== CI_PASSED) found.push(`ci.yml: the job ${CI_PASSED} is not the last job; the jobs are ${all.map(entry => entry.name).join(', ')}`);
  if (key(job, 'if') !== '${{ always() }}') found.push(`ci.yml: the job ${CI_PASSED} has if: '${key(job, 'if')}', not '\${{ always() }}'; it must run after a failed, skipped or cancelled job too`);
  const needs = key(job, 'needs').replace(/^\[|\]$/g, '').split(',').map(name => name.trim()).filter(Boolean);
  if (JSON.stringify([...needs].sort()) !== JSON.stringify(others.map(entry => entry.name).sort())) {
    found.push(`ci.yml: the job ${CI_PASSED} needs [${needs.join(', ')}], not every other job [${others.map(entry => entry.name).join(', ')}]`);
  }
  const runners = [...new Set(others.map(entry => key(entry, 'runs-on')))].sort();
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

test('the path of every Go module that go get resolves names its directory in the repository (T22.1-2)', () => {
  // go get github.com/polyspec/template/<directory> finds the module only in that directory of the repository; a module
  // path without a dot in its first element is local to the repository and is never resolved.
  const modules = spawnSync('git', ['ls-files', '*go.mod'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.ok(modules.length > 0, 'git ls-files listed no go.mod');
  for (const file of modules) {
    const module = /^module (\S+)$/m.exec(read(file))?.[1];
    assert.ok(module, `${file} declares no module`);
    if (!module.split('/')[0].includes('.')) continue;
    assert.equal(module, `github.com/polyspec/template/${path.dirname(file)}`, `${file}: module ${module}, expected the path of its directory`);
  }
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
  // Only the commands that download leave the offline settings of the recipes (T20.1-2).
  const online = 'env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK';
  const fetches = locks.map(lock => `${online} ${cargo} fetch --locked --manifest-path ${path.dirname(lock)}/Cargo.toml`);
  assert.deepEqual(install.stdout.split('\n').filter(Boolean), [`${online} node scripts/install-tools.mjs`, `${online} ${path.join(ROOT, 'var/tools/bin/npm')} ci`, 'rustup toolchain install --no-self-update', `${online} node scripts/composer-install.mjs packages/template-php`, `${online} node scripts/composer-install.mjs packages/template-php-ext`, ...fetches]);
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

test('every CI job installs with make install and bootstraps the tools of the checkout with Go', () => {
  for (const file of WORKFLOWS) {
    const text = read(file);
    const direct = /- run: (npm ci|npm install|rustup )[^\n]*/.exec(text);
    assert.equal(direct?.[0], undefined, `${file} installs without make install`);
    for (const job of jobs(file)) {
      if (!/- run: .*\bmake /.test(job.text) || (file.endsWith('/ci.yml') && job.name === CI_PASSED)) continue;
      assert.match(job.text, /uses: actions\/setup-go@\S+.*\n\s+with:\n\s+go-version-file: packages\/template-go\/go\.mod\n/, `${file} job ${job.name} has no Go to bootstrap make install-tools`);
      if (file.endsWith('/ci.yml')) assert.match(job.text, /- run: make install\n/, `${file} job ${job.name} does not install with make install`);
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
  const SETUP = new Set(['install', 'install-tools', 'install-vscode', 'install-browsers']);
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

test('a new push to a pull request cancels the running CI of its workflow and ref, and no other run is cancelled (T17.1-7)', () => {
  // A merge group has a ref of its own and its run decides whether main receives the commit, so only pull request runs
  // are cancelled.
  for (const file of WORKFLOWS) {
    const text = read(file);
    const [, triggers = ''] = /\non:\n((?: {2}.*\n|\s*\n)+)/.exec(`\n${text}`) ?? [];
    // A tag push runs a release, which no later push replaces.
    if (!/^ {2}(?:push|pull_request|merge_group):/m.test(triggers) || /^ {4}tags:/m.test(triggers)) continue;
    assert.match(text, /\nconcurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/, `${file} has no concurrency group of its workflow and ref that cancels only the run of a pull request`);
  }
});

test('each workflow declares exactly its triggers: CI on every pull request, merge group and manual run, the push gate also on the pushed branches outside the queue, the site on main, the release on a tag (T17.1-7, T17.1-9, T22.1-4)', () => {
  const triggers = {
    '.github/workflows/ci.yml': 'on:\n  pull_request:\n  merge_group:\n  workflow_dispatch:\n',
    '.github/workflows/push-gate.yml': "on:\n  push:\n    branches-ignore: ['gh-readonly-queue/**']\n  pull_request:\n  merge_group:\n",
    '.github/workflows/pages.yml': 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
    '.github/workflows/dependency-review.yml': "on:\n  schedule:\n    - cron: '17 3 * * *'\n  workflow_dispatch:\n",
    '.github/workflows/release.yml': "on:\n  push:\n    tags: ['v*', '*/v*']\n",
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

test('release.yml runs its steps in order with the tag and the permission to release (T22.1-4)', () => {
  const text = read('.github/workflows/release.yml');
  assert.deepEqual(releaseViolations(text), []);
  const broken = {
    order: [text.replace('run: make release-versions', 'run: make release-swap').replace('run: make release-verify', 'run: make release-versions').replace('run: make release-swap', 'run: make release-verify'), 'not the release steps'],
    'read only': [text.replace('  contents: write\n', '  contents: read\n'), 'not exactly contents: write'],
    'no tag': [text.replace('      TAG: ${{ github.ref_name }}\n', ''), 'does not set TAG'],
    shallow: [text.replace('          fetch-depth: 0\n', '          fetch-depth: 1\n'), 'fetch-depth: 0'],
    'two jobs': [`${text}\n  other:\n    runs-on: ubuntu-24.04\n`, 'not the one job release'],
  };
  for (const [name, [brokenText, message]] of Object.entries(broken)) {
    assert.notEqual(brokenText, text, name);
    const found = releaseViolations(brokenText);
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
