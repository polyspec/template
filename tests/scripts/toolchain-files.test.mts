// Tests that the toolchains of the recipes are the ones that the files of the checkout declare (T13.1-4, T19.2), each
// with the expected and the actual version on failure:
// - Node.js is the node of mise.toml, which `make install-tools TOOLS=npm` installs into var/tools and the Makefile starts as
//   $(NODE) (kit K171), and every CI job runs the bootstrap action of template, which starts with the Node.js of mise.toml (kit K992);
// - npm is the npm:npm of mise.toml, which devEngines of package.json names (kit K938), installed by `make install-tools TOOLS=npm` into var/tools/bin,
//   and Go the go of mise.toml, which the go directive of packages/go/go.mod equals, installed by `make
//   install-tools` with mise and run by its shim of var/tools/mise/shims (T24.12); the Makefile puts both directories first on
//   PATH, and the Makefile exports GOTOOLCHAIN=local, so go never downloads another toolchain;
// - Rust is the toolchain of `rust-toolchain.toml` with the components that `make lint` and `make test-rust` use,
//   installed by install-tools of kit, never by rustup on the first cargo: several processes that start cargo at once, as
//   the files of one `node --test` run do, each installed it and broke the installs of the others (T18.7-1);
// - make install downloads the crates of every Cargo.lock, which the checks resolve with cargo --offline (T20.1-1), and
//   every other recipe runs cargo, go and npm offline (T20.1-2);
// - PHP is one of the minor versions of config/toolchain.json: setup-php cannot pin a patch, so the minor is the pin and
//   the CI report records the patch of each run; Composer is the exact release of mise.toml, and setup-php installs
//   no tools;
// - every action of a workflow is pinned by its commit and every job runs on ubuntu-24.04;
// - the last job of ci.yml is ci-passed, which fails the run that a release takes by its id unless every job passed: it runs after every other
//   job (`if: ${{ always() }}`), needs every other job, runs on their runner and runs make ci-passed with the JSON of
//   needs, so it passes only when every other job passed (T22.1-3);
// - release.yml is the release workflow of template (T24.1, T27.1-64), which these rules check as they check ci.yml;
// - npm allows the URL of the release asset of @polyspec/kit that package.json names through the .npmrc of the root (T27.1-64).
// make itself is not pinned: the recipes use no construct newer than GNU Make 3.81, and make 3.81 and GNU Make 4.4.1
// print the same commands for every target (T17.1-4).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { JSONSchemaType } from 'ajv';
import { parse, TomlDate, type TomlTable, type TomlValue } from 'smol-toml';
import { compareText } from '../../scripts/compare-text.mts';
import { jsonDocument } from '../../scripts/json-document.mts';
import { captured, required } from '../../scripts/required.mts';
import { isJsonObject, parsedJsonObject } from '../runner/checked.mts';
import { toolsDirectory } from '../../scripts/tools-directory.mts';
import { type Job, jobField, jobs, jobsOf, pinsOf, ROOT, runLines, runsOf, WORKFLOWS } from './workflows.mts';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const TOOLCHAIN_SCHEMA: JSONSchemaType<{ php: string[] }> = {
  type: 'object', properties: { php: { type: 'array', items: { type: 'string' } } }, required: ['php'],
};
const TOOLCHAIN = jsonDocument<{ php: string[] }>('toolchain configuration', TOOLCHAIN_SCHEMA).read(path.join(ROOT, 'config/toolchain.json'));
// The npm version of devEngines in package.json, which must equal the npm:npm of mise.toml that kit installs with the digest of
// mise.lock (kit K938); package.json declares no packageManager.
const declaredNpm = () => {
  const manifest = parsedJsonObject(read('package.json'), 'package.json');
  if ('packageManager' in manifest) throw new Error('package.json declares packageManager; npm is the npm:npm of mise.toml, named by devEngines (kit K938)');
  const engines = manifest['devEngines'];
  const manager = isJsonObject(engines) ? engines['packageManager'] : undefined;
  const declared = JSON.stringify(manager);
  const tool = MISE_TOOLS['npm:npm'];
  if (typeof tool !== 'string') throw new Error(`mise.toml declares no npm:npm; declare the npm of devEngines there (kit K938)`);
  const expected = JSON.stringify({ name: 'npm', version: tool, onFail: 'error' });
  if (declared !== expected) throw new Error(`package.json devEngines.packageManager: expected ${expected}, the npm:npm of mise.toml, actual ${declared}`);
  return tool;
};
const TOOLS = toolsDirectory(ROOT);
const SHIMS = path.join(TOOLS, 'mise/shims');
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
// FAIL_SKIPPED=1 keeps the failure of a skipped job, the default of kit 0.0.98 (kit K1111).
const CI_PASSED_RUN = "make ci-passed RESULTS='${{ toJSON(needs) }}' FAIL_SKIPPED=1";
// The bootstrap of every CI job is the composite action of template (kit K992, T27.1-64): it sets up the Node.js of
// mise.toml, installs the locked kit package, then runs make install-tools TOOLS=npm and make install-packages; it runs at
// the commit of the run, so it needs no pin. make ci-passed is a utility of @polyspec/kit that the node of mise.toml runs,
// so ci-passed runs it too (kit K171).
const KIT_BOOTSTRAP = './.github/actions/kit-bootstrap';
// The index of the step of `job` that runs the bootstrap of kit, or -1.
const bootstrapIndex = (job: Job) => job.steps.findIndex(step => step.uses === KIT_BOOTSTRAP);

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
  if (bootstrapIndex(job) < 0) found.push(`ci.yml: the job ${CI_PASSED} does not run ${KIT_BOOTSTRAP} before make ci-passed`);
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

// T27.1-64: the recipes are template's own; the Makefile includes no makefile of kit and runs the utilities of the installed
// package, never of a sibling checkout.
test('make reads the Makefile alone and runs the utilities of the installed kit', () => {
  const files = recipe('printf "%s\\n" "$(MAKEFILE_LIST)"').split(/\s+/).filter(file => !file.endsWith('probe.mk'));
  assert.deepEqual(files, ['Makefile']);
  const kit = recipe('printf "%s\\n" "$(KIT)"');
  assert.equal(kit, path.join(realpathSync(path.join(ROOT, 'node_modules/@polyspec/kit')), existsSync(path.join(ROOT, 'node_modules/@polyspec/kit/scripts/kit/land.mts')) ? 'scripts/kit' : 'dist'));
});

test('npm allows the URL dependencies of the root package.json through .npmrc, and package-lock.json resolves no other URL', () => {
  assert.match(read('.npmrc'), /^allow-remote=root$/m, '.npmrc does not allow the URL of @polyspec/kit that package.json names; npm 12 refuses npm ci with EALLOWREMOTE');
  const urls = [...read('package-lock.json').matchAll(/"resolved": "(https:\/\/github\.com\/[^"]+)"/g)].map(match => match[1]);
  const manifest = parsedJsonObject(read('package.json'), 'package.json');
  const declared = Object.values(isJsonObject(manifest.devDependencies) ? manifest.devDependencies : {});
  assert.deepEqual(urls.filter(url => !declared.includes(url)), [], 'package-lock.json resolves a URL that the root package.json does not name, which allow-remote=root refuses');
});

test('Node.js is the node of mise.toml, which engines.node of package.json names as its floor', () => {
  const version = textOf(MISE_TOOLS.node, 'the node of mise.toml');
  const enginesField = parsedJsonObject(read('package.json'), 'package.json').engines;
  const engines = isJsonObject(enginesField) ? enginesField.node : undefined;
  assert.ok(typeof engines === 'string', 'package.json declares no engines.node');
  // The floor equals the pin of kit, which mise.toml declares (T24.3).
  assert.equal(engines, `>=${version}`, `package.json engines.node ${engines} is not >=${version} (mise.toml)`);
  const actual = recipe('$(NODE) --version');
  assert.equal(actual, `v${version}`, `node of the recipes: expected v${version} (mise.toml), actual ${actual}; run make install-tools TOOLS=npm`);
});

test('every CI job that runs Node.js runs the bootstrap of kit, which sets up the Node.js of mise.toml (kit K992)', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      if (!runLines(job).some(line => /\b(npm|node|make) /.test(line))) continue;
      assert.ok(bootstrapIndex(job) >= 0, `${file} job ${job.name} does not run ${KIT_BOOTSTRAP}`);
      assert.equal(usesOf(job, 'actions/setup-node@').length, 0, `${file} job ${job.name} sets up Node.js itself; ${KIT_BOOTSTRAP} sets up the Node.js of mise.toml`);
      assert.ok(job.steps.every(step => !('node-version' in step.with)), `${file} job ${job.name} names a Node.js version`);
    }
  }
});

test('npm is the npm:npm of mise.toml that devEngines of package.json names, from var/tools/bin first on PATH', () => {
  const expected = declaredNpm();
  const first = recipe('echo "$PATH"').split(':')[0];
  assert.equal(first, path.join(TOOLS, 'bin'), `the first entry of PATH of the recipes: expected ${path.join(TOOLS, 'bin')}, actual ${first}`);
  assert.equal(recipe('command -v npm || true'), path.join(TOOLS, 'bin/npm'), 'npm of the recipes is not the one of var/tools/bin; run make install-tools');
  const actual = recipe('$(NPM) --version');
  assert.equal(actual, expected, `npm of the recipes: expected ${expected} (devEngines of package.json), actual ${actual}; run make install-tools`);
});

test('every recipe line runs the npm of var/tools/bin and the go of mise, with every make on PATH', { timeout: 240_000 }, () => {
  // GNU Make 3.81 starts a line without shell syntax itself, with the PATH that make started with, also when SHELL names
  // another shell: the line `npm --version` printed the npm of the machine. The recipes start npm as $(NPM), the path of
  // its wrapper, go as $(GO), the path of its shim, and gofmt only in lines with shell syntax, which the shell runs with
  // the exported PATH.
  // gmake is GNU Make 4 where it is installed beside make 3.81.
  const makes = ['make', ...(spawnSync('gmake', ['--version']).status === 0 ? ['gmake'] : [])];
  const npm = declaredNpm();
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

test('PHP is a minor version of config/toolchain.json, setup-php installs no tools, and Composer is the release of mise.toml', () => {
  const actual = recipe('cd . && php -r "echo PHP_MAJOR_VERSION, \'.\', PHP_MINOR_VERSION;"');
  assert.ok(TOOLCHAIN.php.includes(actual), `php of the recipes: expected a minor version of ${TOOLCHAIN.php.join(', ')} (config/toolchain.json), actual ${actual}`);
  const declared = textOf(tableOf(MISE_TOOLS['http:composer'], 'the http:composer tool of mise.toml').version, 'the version of the http:composer tool of mise.toml');
  assert.equal(recipe('command -v composer || true'), path.join(SHIMS, 'composer'), 'composer of the recipes is not the shim of mise; run make install-tools');
  const composer = /Composer version (\S+)/.exec(recipe('composer --version --no-ansi 2>/dev/null'))?.[1];
  assert.equal(composer, declared, `composer of the recipes: expected ${declared} (mise.toml), actual ${composer}`);
  // The PHP that each setup-php step starts, .php-version or the matrix of config/toolchain.json, is checked by
  // tests/scripts/php-version.test.mts (T24.27).
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      for (const step of usesOf(job, 'shivammathur/setup-php@')) {
        // Composer is a tool of mise.toml, so setup-php installs no tools of its own (T24.12).
        assert.equal(step.with.tools, 'none', `${file}: setup-php installs tools ${shown(step.with.tools)}; make install-tools installs Composer from mise.toml`);
      }
    }
  }
});

test('no recipe of the Makefile lets rustup install a toolchain on the first cargo', () => {
  assert.equal(recipe('echo "RUSTUP_AUTO_INSTALL=$RUSTUP_AUTO_INSTALL"', { RUSTUP_AUTO_INSTALL: '1' }), 'RUSTUP_AUTO_INSTALL=0', 'the recipes of the Makefile let rustup install a toolchain on the first cargo');
});

test('every recipe runs cargo, go, npm and Composer offline, so no check reaches a registry', () => {
  const offline = { CARGO_NET_OFFLINE: 'false', GOPROXY: 'https://proxy.golang.org', npm_config_offline: 'false', COMPOSER_DISABLE_NETWORK: '0' };
  assert.equal(recipe('echo "$CARGO_NET_OFFLINE $GOPROXY $npm_config_offline $COMPOSER_DISABLE_NETWORK"', offline), 'true off true 1', 'a recipe of the Makefile lets cargo, go, npm or Composer reach a registry');
  const npm = recipe('$(NPM) config get offline', offline);
  assert.equal(npm, 'true', `npm of the recipes: expected offline true, actual ${npm}`);
  const go = recipe('go env GOPROXY', offline);
  assert.equal(go, 'off', `go of the recipes: expected GOPROXY off, actual ${go}`);
});

test('every installing job prepares the locked kit before the first make', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      const commands = runsOf(job);
      const firstMake = commands.findIndex(command => /^make (?!-k -C )/.test(command));
      if (firstMake < 0) continue;
      assert.ok(usesOf(job, 'actions/checkout@').some(step => step.with['fetch-depth'] === 0),
        `${file} job ${job.name} must fetch the full commit history`);
      const installed = bootstrapIndex(job);
      const firstMakeStep = job.steps.findIndex(step => step.run !== undefined && /^make (?!-k -C )/.test(step.run));
      assert.ok(installed >= 0 && installed < firstMakeStep,
        `${file} job ${job.name} must run ${KIT_BOOTSTRAP}, which installs the locked packages, before make reads the installed bootstrap`);
      assert.ok(!commands.some(command => command.includes('../kit')),
        `${file} job ${job.name} depends on an unpinned sibling checkout`);
    }
  }
});

test('no CI job installs without make or sets up a Go or a Python of its own', () => {
  for (const file of WORKFLOWS) {
    const direct = jobs(file).flatMap(runLines).find(line => /^(npm ci|npm install|rustup )/.test(line));
    assert.equal(direct, undefined, `${file} installs without make install`);
    for (const job of jobs(file)) {
      if (!runLines(job).some(line => /\bmake /.test(line)) || (file.endsWith('/ci.yml') && job.name === CI_PASSED)) continue;
      // make install-tools installs the Go and the Python of mise.toml, so no job sets up a Go or a Python of its own (T24.1, T24.12).
      assert.ok(usesOf(job, 'actions/setup-go@').length + usesOf(job, 'actions/setup-python@').length === 0, `${file} job ${job.name} sets up a Go or a Python of PATH; make install-tools installs those of mise.toml`);
    }
  }
});

// The targets that a step of make names, also those of `make ci-targets TARGETS="..."`.
function makeTargets(step: string) {
  return step.replace(/^.*\bmake\b/, '').replace(/TARGETS="([^"]*)"/, '$1').split(/\s+/).filter(word => /^[a-z][\w-]*$/.test(word));
}

test('every make target that a step of a workflow runs is a target of the Makefile', () => {
  // A step that runs a target which no longer exists fails only in CI: kit 0.0.82 removed kit-install-php-arginfo, and the job
  // php-ext of ci.yml still ran it. The database that make prints (-pRrq) holds the targets of the Makefile and of the files of
  // kit that it includes. Its default goal is a target with an empty recipe from standard input, so the read runs no recipe of
  // the Makefile, also none that calls $(MAKE), which runs even under -q (kit K945).
  const goal = '.toolchain-database-read';
  const database = spawnSync('make', ['-pRrq', '-f', 'Makefile', '-f', '-'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, input: `\n.DEFAULT_GOAL := ${goal}\n${goal}: ;\n`,
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'MAKELEVEL')),
  });
  assert.ok(database.stdout.includes('# Files'), `make printed no database of the Makefile: ${database.stderr}`);
  const defined = new Set(database.stdout.split('\n').flatMap(line => /^([a-z][\w-]*)::?(?:\s|$)/.exec(line)?.[1] ?? []));
  const missing = WORKFLOWS.flatMap(file => jobs(file).flatMap(job => runLines(job).filter(line => /^make\b/.test(line))
    .flatMap(line => makeTargets(line).filter(target => !defined.has(target)).map(target => `${file} job ${job.name}: make ${target}`))));
  assert.deepEqual(missing, [], 'steps of the workflows that run a make target which the Makefile does not define');
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
  const SETUP = new Set(['install', 'install-tools', 'install-packages', 'hooks', 'template-install-vscode', 'template-install-browsers', 'install-symbols', ...['node', 'go', 'rust', 'php', 'python', 'parity'].map(language => `template-install-${language}`)]);
  const REPORTS: Record<string, string> = { 'ci-targets': 'var/report/ci-targets/' };
  const problems: string[] = [];
  for (const job of jobs('.github/workflows/ci.yml').filter(entry => entry.name !== CI_PASSED)) {
    const lines = runLines(job);
    const runners = new Set<string>();
    for (const line of lines.filter(line => /\bmake\b/.test(line))) {
      const [target] = makeTargets(line);
      if (target !== undefined && target in REPORTS) runners.add(target);
      else if (target === undefined || !SETUP.has(target)) problems.push(`${job.name}: \`${line}\` runs a check without make ci-targets, so it stops at a failure and leaves no report`);
    }
    if (runners.size === 0) problems.push(`${job.name}: no step runs make ci-targets`);
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
    'no install': [`${head}${job.replace(/ {6}- name: [^\n]*\n {8}uses: \.\/\.github\/actions\/kit-bootstrap\n/, '')}`, `does not run ${KIT_BOOTSTRAP}`],
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
    // The bootstrap action is a file of the checkout, which runs at the commit of the run, so it needs no pin.
    for (const pin of pinsOf(file).filter(entry => entry.uses !== KIT_BOOTSTRAP)) {
      assert.match(pin.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${file}: ${pin.uses} is not pinned by a commit`);
      assert.match(pin.comment ?? 'no comment', /^v?\d+\.\d+\.\d+$/, `${file}: ${pin.uses} does not name its release in a comment`);
    }
    for (const job of jobs(file)) {
      const runsOn = jobField(job, 'runs-on');
      assert.equal(runsOn, 'ubuntu-24.04', `${file}: runs-on ${shown(runsOn)}, expected ubuntu-24.04`);
    }
  }
});
