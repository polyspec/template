// Tests that the toolchains of the recipes are the ones that the files of the checkout declare (T13.1-4, T19.2), each
// with the expected and the actual version on failure:
// - Node.js is the version of `.node-version`, and every CI job takes Node.js from it;
// - npm is the version of `packageManager` in package.json, installed by `make install-tools TOOLS=npm` into var/tools/bin,
//   and Go the go of mise.toml, which the go directive of packages/go/go.mod equals, installed by `make
//   install-tools` with mise and run by its shim of var/tools/mise/shims (T24.12); kit.mk puts both directories first on
//   PATH, and the Makefile exports GOTOOLCHAIN=local, so go never downloads another toolchain;
// - Rust is the toolchain of `rust-toolchain.toml` with the components that `make lint` and `make test-rust` use,
//   installed by install-tools of kit, never by rustup on the first cargo: several processes that start cargo at once, as
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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { JSONSchemaType } from 'ajv';
import { parse, TomlDate, type TomlTable, type TomlValue } from 'smol-toml';
import { compareText } from '../../scripts/compare-text.mts';
import { jsonDocument } from '../../scripts/json-document.mts';
import { captured, required } from '../../scripts/required.mts';
import { isJsonObject, parsedJsonObject } from '../runner/checked.mts';
import { type Job, jobField, jobs, jobsOf, pinsOf, ROOT, runLines, runsOf, workflowOf, WORKFLOWS } from './workflows.mts';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const TOOLCHAIN_SCHEMA: JSONSchemaType<{ php: string[] }> = {
  type: 'object', properties: { php: { type: 'array', items: { type: 'string' } } }, required: ['php'],
};
const TOOLCHAIN = jsonDocument<{ php: string[] }>('toolchain configuration', TOOLCHAIN_SCHEMA).read(path.join(ROOT, 'config/toolchain.json'));
// The string field `key` of package.json.
const packageField = (key: string) => {
  const value = parsedJsonObject(read('package.json'), 'package.json')[key];
  if (typeof value !== 'string') throw new Error(`package.json ${key} is no string`);
  return value;
};
const SHIMS = path.join(ROOT, 'var/tools/mise/shims');
// The tools of mise.toml, read with a TOML parser.
const MISE_TOOLS = tableOf(parse(read('mise.toml')).tools, 'the [tools] of mise.toml');

// `value` as a TOML table; `name` names it in the error when it is none.
function tableOf(value: TomlValue | undefined, name: string): TomlTable {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Date || value instanceof TomlDate) throw new Error(`${name} is no table`);
  return value;
}

// The text of a TOML value that must be a string, such as a version of mise.toml.
function textOf(value: TomlValue | undefined, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} is no string`);
  return value;
}

// The go directive of packages/go/go.mod.
function goDirective(): string {
  return captured(/^go (\S+)$/m.exec(read('packages/go/go.mod')), 1, 'the go directive of packages/go/go.mod');
}

// The steps of a job that use an action of `prefix`, such as actions/setup-node@.
const usesOf = (job: Job, prefix: string) => job.steps.filter(step => step.uses?.startsWith(prefix) === true);

// A value of a workflow as the messages show it.
const shown = (value: unknown) => (value === undefined ? 'nothing' : typeof value === 'string' ? value : JSON.stringify(value));

// The job ci-passed of ci.yml runs only make ci-passed, which reads the results of the other jobs: it installs nothing,
// runs no check of the suite and writes no report.
const CI_PASSED = 'ci-passed';
const CI_PASSED_RUN = "make ci-passed RESULTS='${{ toJSON(needs) }}'";

// Each broken rule of the job ci-passed of the text of ci.yml (T22.1-3).
export function ciPassedViolations(text: string) {
  const all = jobsOf(text, 'ci.yml');
  const job = all.find(entry => entry.name === CI_PASSED);
  if (!job) return [`ci.yml: the job ${CI_PASSED} is missing; a release requires it as the check of ci.yml`];
  const found: string[] = [];
  const others = all.filter(entry => entry.name !== CI_PASSED);
  if (all.at(-1)?.name !== CI_PASSED) found.push(`ci.yml: the job ${CI_PASSED} is not the last job; the jobs are ${all.map(entry => entry.name).join(', ')}`);
  const condition = jobField(job, 'if');
  if (condition !== '${{ always() }}') found.push(`ci.yml: the job ${CI_PASSED} has if: '${shown(condition)}', not '\${{ always() }}'; it must run after a failed, skipped or cancelled job too`);
  const declared = job.value.needs;
  if (!Array.isArray(declared) || declared.some(name => typeof name !== 'string')) throw new Error(`ci.yml: the needs of the job ${CI_PASSED} are no list of job names`);
  const needs = declared.map(String);
  if (JSON.stringify([...needs].sort(compareText)) !== JSON.stringify(others.map(entry => entry.name).sort(compareText))) {
    found.push(`ci.yml: the job ${CI_PASSED} needs [${needs.join(', ')}], not every other job [${others.map(entry => entry.name).join(', ')}]`);
  }
  const runners = [...new Set(others.map(entry => shown(jobField(entry, 'runs-on'))))].sort(compareText);
  const runsOn = shown(jobField(job, 'runs-on'));
  if (JSON.stringify([runsOn]) !== JSON.stringify(runners)) found.push(`ci.yml: the job ${CI_PASSED} runs on '${runsOn}', not on the runner of the other jobs ${runners.join(', ')}`);
  const runs = runsOf(job);
  const last = job.steps.at(-1);
  if (JSON.stringify(runs) !== JSON.stringify([CI_PASSED_RUN]) || last?.run === undefined || last.if !== undefined) {
    found.push(`ci.yml: the job ${CI_PASSED} runs [${runs.join(', ')}], not the last step ${CI_PASSED_RUN} without a condition of its own`);
  }
  return found;
}

// Runs `command` as a recipe line of a second makefile read after the Makefile, so it gets the environment and the
// variables that the recipes of the Makefile get, with `make` (default) or another make; returns its output. A line
// that depends on PATH has shell syntax, like the lines of the Makefile.
function recipe(command: string, env: NodeJS.ProcessEnv = {}, make = 'make') {
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
  const enginesField = parsedJsonObject(read('package.json'), 'package.json').engines;
  const engines = isJsonObject(enginesField) ? enginesField.node : undefined;
  assert.ok(typeof engines === 'string', 'package.json declares no engines.node');
  // The floor equals the pin of kit, which .node-version declares (T24.3); make toolchain-check checks every manifest.
  assert.equal(engines, `>=${version}`, `package.json engines.node ${engines} is not >=${version} (.node-version)`);
  const actual = recipe('cd . && node --version');
  assert.equal(actual, `v${version}`, `node of the recipes: expected v${version} (.node-version), actual ${actual}`);
});

test('every CI job that runs Node.js takes it from .node-version', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      if (!runLines(job).some(line => /\b(npm|node|make) /.test(line))) continue;
      assert.ok(usesOf(job, 'actions/setup-node@').some(step => step.with['node-version-file'] === '.node-version'), `${file} job ${job.name} does not take Node.js from .node-version`);
      assert.ok(job.steps.every(step => !('node-version' in step.with)), `${file} job ${job.name} names a Node.js version`);
    }
  }
});

test('npm is the version of packageManager in package.json, from var/tools/bin first on PATH', () => {
  const manager = packageField('packageManager');
  const expected = /^npm@(\d+\.\d+\.\d+)$/.exec(manager)?.[1];
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
  const npm = packageField('packageManager').replace('npm@', '');
  const go = `go${goDirective()}`;
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
    if (!module.split('/', 1).join('').includes('.')) continue;
    assert.equal(module, `github.com/polyspec/template/${path.dirname(file)}`, `${file}: module ${module}, expected the path of its directory`);
  }
});

test('Go is the go of mise.toml, which the go directive of packages/go/go.mod equals, and go downloads no other toolchain', () => {
  const expected = `go${goDirective()}`;
  assert.equal(`go${textOf(MISE_TOOLS.go, 'the go of mise.toml')}`, expected, 'the go of mise.toml differs from the go directive of packages/go/go.mod');
  for (const tool of ['go', 'gofmt']) assert.equal(recipe(`command -v ${tool} || true`), path.join(SHIMS, tool), `${tool} of the recipes is not the shim of mise; run make install-tools`);
  const actual = recipe('cd . && go env GOVERSION', { GOTOOLCHAIN: 'auto' });
  assert.equal(actual, expected, `go of the recipes: expected ${expected} (packages/go/go.mod), actual ${actual}; run make install-tools`);
  assert.equal(recipe('echo "$GOTOOLCHAIN"', { GOTOOLCHAIN: 'auto' }), 'local', 'the recipes of the Makefile let go download a toolchain');
});

test('go builds into the build cache of the checkout, and no script names another one', () => {
  // T19.14: the generated checks set GOCACHE to the fixed /tmp/template-go-cache, which every checkout and run shared.
  assert.equal(recipe('echo "$GOCACHE"', { GOCACHE: '/tmp/elsewhere' }), path.join(ROOT, 'var/go/cache'), 'the recipes of the Makefile use another Go build cache');
  // The copies of kit under scripts/kit are kit's: its mise bootstrap keeps the Go cache of mise under var/tools.
  const named = spawnSync('git', ['grep', '-n', 'GOCACHE', '--', 'scripts', 'tests/runner', 'examples/showcase', ':!scripts/kit'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.deepEqual(named, [], 'scripts that set their own Go build cache');
});

test('rust-toolchain.toml names the toolchain and the components that cargo of the Rust targets uses', () => {
  const toolchain = tableOf(parse(read('rust-toolchain.toml')).toolchain, 'the [toolchain] of rust-toolchain.toml');
  const channel = textOf(toolchain.channel, 'the channel of rust-toolchain.toml');
  const components = toolchain.components;
  if (!Array.isArray(components)) throw new Error('rust-toolchain.toml names no list of components');
  const cargo = spawnSync(path.join(homedir(), '.cargo/bin/cargo'), ['--version'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cargo.status, 0, cargo.stderr);
  const actual = cargo.stdout.split(' ')[1];
  assert.equal(actual, channel, `cargo of the Rust targets: expected ${channel} (rust-toolchain.toml), actual ${actual}`);
  for (const component of ['rustfmt', 'clippy']) assert.ok(components.includes(component), `rust-toolchain.toml does not name the component ${component}`);
  for (const file of WORKFLOWS) {
    const named = jobs(file).some(job => usesOf(job, 'dtolnay/rust-toolchain@').length > 0 || job.steps.some(step => 'toolchain' in step.with));
    assert.ok(!named, `${file} names a Rust toolchain other than rust-toolchain.toml`);
  }
});

test('PHP is a minor version of config/toolchain.json, also in every CI job, and Composer the release of mise.toml', () => {
  const actual = recipe('cd . && php -r "echo PHP_MAJOR_VERSION, \'.\', PHP_MINOR_VERSION;"');
  assert.ok(TOOLCHAIN.php.includes(actual), `php of the recipes: expected a minor version of ${TOOLCHAIN.php.join(', ')} (config/toolchain.json), actual ${actual}`);
  const declared = textOf(tableOf(MISE_TOOLS['http:composer'], 'the http:composer tool of mise.toml').version, 'the version of the http:composer tool of mise.toml');
  assert.equal(recipe('command -v composer || true'), path.join(SHIMS, 'composer'), 'composer of the recipes is not the shim of mise; run make install-tools');
  const composer = /Composer version (\S+)/.exec(recipe('composer --version --no-ansi 2>/dev/null'))?.[1];
  assert.equal(composer, declared, `composer of the recipes: expected ${declared} (mise.toml), actual ${composer}`);
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      const strategy = job.value.strategy;
      const matrix = isJsonObject(strategy) && isJsonObject(strategy.matrix) ? strategy.matrix : {};
      if (matrix.php !== undefined) assert.deepEqual(matrix.php, TOOLCHAIN.php, `${file}: the PHP matrix differs from config/toolchain.json`);
      for (const step of usesOf(job, 'shivammathur/setup-php@')) {
        const version = step.with['php-version'];
        // A job of the PHP matrix takes its version from the matrix, which the line above checks.
        if (version !== '${{ matrix.php }}') assert.ok(typeof version === 'string' && TOOLCHAIN.php.includes(version), `${file}: php-version ${shown(version)}, expected one of ${TOOLCHAIN.php.join(', ')}`);
        // Composer is a tool of mise.toml, so setup-php installs no tools of its own (T24.12).
        assert.equal(step.with.tools, 'none', `${file}: setup-php installs tools ${shown(step.with.tools)}; make install-tools installs Composer from mise.toml`);
      }
    }
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
  assert.deepEqual(install.stdout.split('\n').filter(Boolean).map(line => line.trimEnd()), [`${online} node ${kit}/install-tools.mjs`, `${online} node ${kit}/check-cargo-downloads.mjs --fetch`, `${online} node scripts/composer-install.mts packages/php`, `${online} node scripts/composer-install.mts packages/php-ext`, `${online} node scripts/python-wheelhouse.mts`]);
  assert.equal(recipe('echo "RUSTUP_AUTO_INSTALL=$RUSTUP_AUTO_INSTALL"', { RUSTUP_AUTO_INSTALL: '1' }), 'RUSTUP_AUTO_INSTALL=0', 'the recipes of the Makefile let rustup install a toolchain on the first cargo');
  for (const file of WORKFLOWS) {
    const env = workflowOf(read(file), file).env;
    assert.ok(isJsonObject(env) && env.RUSTUP_AUTO_INSTALL === '0', `${file} does not set RUSTUP_AUTO_INSTALL to 0 for its jobs`);
    assert.ok(!jobs(file).some(job => runLines(job).some(line => /\brustup show\b/.test(line))), `${file} runs rustup show, which installs the toolchain as a side effect`);
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
    const direct = jobs(file).flatMap(runLines).find(line => /^(npm ci|npm install|rustup )/.test(line));
    assert.equal(direct, undefined, `${file} installs without make install`);
    for (const job of jobs(file)) {
      if (!runLines(job).some(line => /\bmake /.test(line)) || (file.endsWith('/ci.yml') && job.name === CI_PASSED)) continue;
      // make install-tools installs the Go and the Python of mise.toml, so no job sets up a Go or a Python of its own (T24.1, T24.12).
      assert.ok(usesOf(job, 'actions/setup-go@').length + usesOf(job, 'actions/setup-python@').length === 0, `${file} job ${job.name} sets up a Go or a Python of PATH; make install-tools installs those of mise.toml`);
      if (file.endsWith('/ci.yml')) {
        const runs = runsOf(job);
        const order = ['make install-tools TOOLS=npm', 'make install-packages', 'make install'].map(command => runs.indexOf(command));
        assert.ok(order.every((index, position) => index !== -1 && (position === 0 || index > (order[position - 1] ?? -1))), `${file} job ${job.name} does not install with make install-tools TOOLS=npm, make install-packages and make install`);
      }
    }
  }
});

// The targets that a step of make names, also those of `make ci-targets TARGETS="..."`.
function makeTargets(step: string) {
  return step.replace(/^.*\bmake\b/, '').replace(/TARGETS="([^"]*)"/, '$1').split(/\s+/).filter(word => /^[a-z][\w-]*$/.test(word));
}

// The targets that `make <targets>` runs: the targets, their prerequisites and, for `check`, the full suite.
function reached(targets: string[]) {
  const makefile = read('Makefile');
  const prerequisites = new Map<string, string[]>();
  for (const line of makefile.split('\n')) {
    const rule = /^([a-z][\w-]*(?: [a-z][\w-]*)*):(?!=)\s*([^#]*)/.exec(line);
    if (!rule) continue;
    const [, names, list] = rule;
    if (names === undefined || list === undefined) throw new Error(`the rule line of the Makefile has no targets: ${line}`);
    for (const name of names.split(' ')) prerequisites.set(name, list.trim().split(/\s+/).filter(Boolean));
  }
  const declared = /^CHECK_TARGETS := (.*)$/m.exec(makefile)?.[1];
  if (declared === undefined) throw new Error('the Makefile declares no CHECK_TARGETS');
  const suite = declared.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const visit = (name: string) => {
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
    const steps = runsOf(job);
    const runs = steps.findIndex(step => /\bmake\b/.test(step) && reached(makeTargets(step)).has('test-vscode-integration'));
    const installs = steps.indexOf('make install-vscode');
    if (runs === -1) assert.equal(installs, -1, `ci.yml job ${job.name} installs VS Code and runs no VS Code integration test`);
    else assert.ok(installs !== -1 && installs < runs, `ci.yml job ${job.name} runs the VS Code integration test without make install-vscode before it`);
  }
});

test('every CI step runs its tools through make, so the recipes give them their offline settings and checks', () => {
  const direct: string[] = [];
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      for (const line of runLines(job)) {
        const command = line.replace(/^xvfb-run(?: -\S+)* /, '');
        if (/^(?:node|npm|npx|cargo|go|php|composer|rustup)\b/.test(command)) direct.push(`${file} job ${job.name}: ${line}`);
      }
    }
  }
  assert.deepEqual(direct, [], 'CI steps that start a tool without make; run it through its make target');
});

test('every CI job runs its targets past failures and uploads their report, also after a failure', () => {
  const SETUP = new Set(['install', 'install-tools', 'install-packages', 'install-vscode', 'install-browsers']);
  const REPORTS: Record<string, string> = { check: 'var/report/full-run/', 'ci-targets': 'var/report/ci-targets/' };
  const problems: string[] = [];
  for (const job of jobs('.github/workflows/ci.yml').filter(entry => entry.name !== CI_PASSED)) {
    const lines = runLines(job);
    const runners = new Set<string>();
    for (const line of lines.filter(line => /\bmake\b/.test(line))) {
      const [target] = makeTargets(line);
      if (target !== undefined && target in REPORTS) runners.add(target);
      else if (target === undefined || !SETUP.has(target)) problems.push(`${job.name}: \`${line}\` runs a check without make check or make ci-targets, so it stops at a failure and leaves no report`);
    }
    if (runners.size === 0) problems.push(`${job.name}: no step runs make check or make ci-targets`);
    for (const runner of runners) {
      const report = REPORTS[runner];
      if (report === undefined) throw new Error(`no report directory of make ${runner}`);
      const uploads = usesOf(job, 'actions/upload-artifact@').some(step => step.if === '${{ !cancelled() }}'
        && typeof step.with.name === 'string' && step.with.name.startsWith('report-')
        && typeof step.with.path === 'string' && step.with.path.split('\n').map(line => line.trim()).includes(report)
        && step.with['if-no-files-found'] === 'error');
      if (!uploads) problems.push(`${job.name}: no upload of ${report} under if: !cancelled() with if-no-files-found: error`);
    }
  }
  assert.deepEqual(problems, []);
});

test('a job of a matrix runs every combination to its end, also after another combination failed (T20.1-13)', () => {
  // GitHub cancels the other jobs of a matrix at the first failure unless fail-fast is false; CI lost the
  // result of PHP 8.5 that way when PHP 8.2 failed.
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      const strategy = job.value.strategy;
      if (strategy === undefined) continue;
      assert.ok(isJsonObject(strategy) && strategy['fail-fast'] === false, `${file} job ${job.name} has a matrix that cancels its other jobs at the first failure`);
    }
  }
});

test('no push cancels the running CI of an earlier push (T17.1-7)', () => {
  // The run of a push to main is the evidence of the commit that a release tags, so a newer push does not replace it.
  for (const file of WORKFLOWS) {
    const workflow = workflowOf(read(file), file);
    const triggers = workflow.on;
    if (!isJsonObject(triggers)) throw new Error(`${file} declares no triggers`);
    // A tag push runs a release, which no later push replaces.
    if (!('push' in triggers) || (isJsonObject(triggers.push) && 'tags' in triggers.push)) continue;
    assert.deepEqual(workflow.concurrency, { group: '${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': false }, `${file} has no concurrency group of its workflow and ref that cancels no run`);
  }
});

test('each workflow of template declares exactly its triggers: CI and the site on a push to main and on a manual run (T17.1-7, T17.1-9)', () => {
  const onMain = { push: { branches: ['main'] }, workflow_dispatch: null };
  const triggers: Record<string, unknown> = {
    '.github/workflows/ci.yml': onMain,
    '.github/workflows/pages.yml': onMain,
    '.github/workflows/dependency-review.yml': { schedule: [{ cron: '17 3 * * *' }], workflow_dispatch: null },
  };
  assert.deepEqual([...WORKFLOWS].sort(compareText), Object.keys(triggers).sort(compareText));
  for (const [file, declared] of Object.entries(triggers)) {
    assert.deepEqual(workflowOf(read(file), file).on, declared, `${file} declares other triggers`);
  }
});

test('ci-passed is the last job of ci.yml, runs always, needs every other job and runs make ci-passed (T22.1-3)', () => {
  const text = read('.github/workflows/ci.yml');
  assert.deepEqual(ciPassedViolations(text), []);
  const head = required(text.split('\n  ci-passed:\n')[0], 'the text of ci.yml before the job ci-passed');
  const job = text.slice(head.length);
  const broken: Record<string, [string, string]> = {
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
    for (const pin of pinsOf(file)) {
      assert.match(pin.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${file}: ${pin.uses} is not pinned by a commit`);
      assert.match(pin.comment ?? 'no comment', /^v?\d+\.\d+\.\d+$/, `${file}: ${pin.uses} does not name its release in a comment`);
    }
    for (const job of jobs(file)) {
      const runsOn = jobField(job, 'runs-on');
      assert.equal(runsOn, 'ubuntu-24.04', `${file}: runs-on ${shown(runsOn)}, expected ubuntu-24.04`);
    }
  }
});

// The python job of ci.yml runs one interpreter, the python of mise.toml (T22.4-12, T24.12): requires-python is its minor
// (python-requires.test.mts), so the job has no matrix and no floor job on another interpreter. The interpreter is the
// pinned Python that make install installs (T22.5-5), so the job sets up no Python of its own.
test('the python job of ci.yml runs make install for the pinned interpreter and has no matrix (T22.4-12, T22.5-5)', () => {
  const job = jobs('.github/workflows/ci.yml').find(entry => entry.name === 'python');
  assert.ok(job, 'ci.yml has no python job; the check verified nothing');
  assert.equal(job.value.strategy, undefined, 'the python job of ci.yml has a matrix; it runs the python of mise.toml only');
  assert.ok(runsOf(job).includes('make install'), 'the python job runs make install, which installs the pinned Python');
  assert.equal(usesOf(job, 'actions/setup-python@').length, 0, 'the python job sets up a Python of PATH; it runs the pinned interpreter');
});

// The python job of ci.yml runs the unit tests, the conformance suite and the generated conformance suite of Python, and
// ci-passed needs the job, so a failing Python run fails the check that the release requires (T22.4-7).
test('the python job of ci.yml runs the Python suites and ci-passed needs it (T22.4-7)', () => {
  const all = jobs('.github/workflows/ci.yml');
  const job = all.find(entry => entry.name === 'python');
  assert.ok(job, 'ci.yml has no python job; the check verified nothing');
  const targets = runLines(job).map(line => /make ci-targets TARGETS="([^"]*)"/.exec(line)).find(match => match !== null);
  assert.ok(targets, 'the python job runs no make ci-targets step');
  const run = captured(targets, 1, 'the targets of the python job').split(/\s+/);
  for (const target of ['test-python', 'conformance-python', 'conformance-generated-python']) {
    assert.ok(run.includes(target), `the python job runs ${run.join(' ')}, expected ${target} among them`);
  }
  const needs = all.find(entry => entry.name === CI_PASSED)?.value.needs;
  assert.ok(Array.isArray(needs), 'ci.yml has no ci-passed job with needs');
  assert.ok(needs.includes('python'), `ci-passed needs ${needs.join(', ')}, expected python among them`);
});

// ruff and vulture are tools of mise.toml, which make install installs with the Python of mise.toml (T22.4-33, T24.12),
// so the job that runs lint-python runs make install before it.
test('the job that runs lint-python installs the tools of mise.toml before it, with no setup-python', () => {
  for (const job of jobs('.github/workflows/ci.yml')) {
    const runs = runsOf(job);
    const lint = runs.findIndex(run => /\bTARGETS="[^"]*\blint-python\b/.test(run));
    if (lint === -1) continue;
    const install = runs.indexOf('make install');
    assert.ok(install !== -1 && install < lint, `job ${job.name} runs lint-python without make install before it`);
    assert.equal(usesOf(job, 'actions/setup-python@').length, 0, `job ${job.name} sets up a Python of PATH for ruff`);
  }
});

test('make dependency-review installs the Rust toolchain before cargo-audit and its workflow sets up no Python of PATH', () => {
  const recipe = spawnSync('make', ['--no-print-directory', '-n', 'dependency-review'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  // install-tools of kit installs the toolchain of rust-toolchain.toml with rustup before cargo-audit runs.
  assert.ok(recipe[0] !== undefined && recipe[1] !== undefined, 'make -n dependency-review prints its two commands');
  assert.match(recipe[0], /install-tools\.mjs $/);
  assert.match(recipe[1], /dependency-review\.mjs +$/);
  assert.ok(!jobs('.github/workflows/dependency-review.yml').some(job => usesOf(job, 'actions/setup-python@').length > 0), 'dependency-review.yml sets up a Python of PATH; install-tools installs the pinned one');
});

test('the unit tests of the Python package run in var/python/venv, which python-venv of kit makes from the python of mise.toml', () => {
  // T23.2: the package is installed editable into that environment, so the tests import it with no changed import path (S3).
  const makefile = read('Makefile');
  assert.match(makefile, /^PYTHON_VENV := \$\(shell node scripts\/python-venv\.mts\)$/m);
  assert.ok(!makefile.includes('var/python/venv'), 'the Makefile restates the environment that config/parity.json declares');
  assert.match(makefile, /^\t\$\(MAKE\) python-venv DIR=\$\(PYTHON_VENV\)$/m);
  assert.match(makefile, /^test-python: python-package .*\n\tnode \$\(KIT\)\/run-tests\.\$\(KIT_EXT\) python --venv \$\(PYTHON_VENV\) -- /m);
});
