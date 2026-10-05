// Tests the dependency gate and the dependency review (T18.10). The gate `scripts/check-dependency-policy.mjs` reads only
// the files of a checkout, so one tree gives one result whatever the registries report; the review
// `scripts/dependency-review.mjs` asks the registries and reports newer stable releases and advisories with their fix.
// The registries are stubs: `npm` and `composer` first on PATH answer `npm view`, `npm audit`, `npm outdated`,
// `composer outdated` and `composer audit` from a JSON file and log every call; the stub `composer` passes every
// other command, such as `composer validate`, to the real composer. No test reaches a network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = path.join(ROOT, 'scripts/check-dependency-policy.mjs');
const REVIEW = path.join(ROOT, 'scripts/dependency-review.mjs');
const COMPOSER_MANIFESTS = ['packages/template-php/composer.json', 'packages/template-php-ext/composer.json'];
const REAL_COMPOSER = spawnSync('sh', ['-c', 'command -v composer'], { encoding: 'utf8' }).stdout.trim();

// The stub registries. The registry file holds `npm` (package -> versions, the last is the latest tag),
// `composer` (manifest directory -> package -> latest), `npmAudit` (the JSON of npm audit) and `composerAudit`
// (manifest directory -> the JSON of composer audit).
const NPM_STUB = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, 'npm ' + args.join(' ') + '\\n');
const registry = JSON.parse(readFileSync(process.env.STUB_REGISTRY, 'utf8'));
if (args[0] === 'view') {
  const versions = registry.npm[args[1]];
  if (!versions) { console.error('404 ' + args[1]); process.exit(1); }
  console.log(JSON.stringify({ 'dist-tags': { latest: versions[versions.length - 1] }, versions }));
} else if (args[0] === 'audit') {
  console.log(JSON.stringify(registry.npmAudit ?? { vulnerabilities: {} }));
  process.exit(Object.keys(registry.npmAudit?.vulnerabilities ?? {}).length ? 1 : 0);
} else if (args[0] === 'outdated') {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const out = {};
  for (const [name, versions] of Object.entries(registry.npm)) {
    const current = lock.packages['node_modules/' + name]?.version;
    const latest = versions[versions.length - 1];
    if (current && current !== latest) out[name] = { current, wanted: current, latest };
  }
  console.log(JSON.stringify(out));
  process.exit(Object.keys(out).length ? 1 : 0);
} else { console.error('stub npm: unexpected ' + args.join(' ')); process.exit(9); }
`;
const COMPOSER_STUB = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, 'composer ' + args.join(' ') + '\\n');
const registry = JSON.parse(readFileSync(process.env.STUB_REGISTRY, 'utf8'));
const directory = path.basename(process.cwd());
if (args[0] === 'outdated') {
  const manifest = JSON.parse(readFileSync('composer.json', 'utf8'));
  const lock = JSON.parse(readFileSync('composer.lock', 'utf8'));
  const locked = new Map([...lock.packages, ...lock['packages-dev']].map(item => [item.name, item.version]));
  const all = args.includes('--all');
  const list = [];
  for (const name of Object.keys({ ...manifest.require, ...manifest['require-dev'] })) {
    if (!locked.has(name)) continue;
    const latest = registry.composer[directory]?.[name] ?? locked.get(name);
    if (all || latest !== locked.get(name)) list.push({ name, version: locked.get(name), latest });
  }
  console.log(JSON.stringify({ locked: list }));
} else if (args[0] === 'audit') {
  const report = registry.composerAudit?.[directory] ?? { advisories: [], abandoned: [] };
  console.log(JSON.stringify(report));
  process.exit(Array.isArray(report.advisories) ? 0 : 1);
} else {
  const run = spawnSync(process.env.REAL_COMPOSER, args, { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
`;

// A temporary directory with the stub registries; returns { env, log, registry(data) }.
function registries(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-dependency-registry-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'npm'), NPM_STUB);
  writeFileSync(path.join(bin, 'composer'), COMPOSER_STUB);
  chmodSync(path.join(bin, 'npm'), 0o755);
  chmodSync(path.join(bin, 'composer'), 0o755);
  const log = path.join(directory, 'calls.log');
  writeFileSync(log, '');
  const registryFile = path.join(directory, 'registry.json');
  writeFileSync(registryFile, JSON.stringify({ npm: {}, composer: {} }));
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, STUB_LOG: log, STUB_REGISTRY: registryFile, REAL_COMPOSER };
  return {
    env,
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
    clear: () => writeFileSync(log, ''),
    registry: data => writeFileSync(registryFile, JSON.stringify(data)),
  };
}

// The registry that reports the locked version of every registry dependency of the checkout at `root` as its latest
// stable release, except the dependencies of `newer`: `key -> latest`, with key `npm:<package>` or
// `composer:<manifest directory>:<package>`.
function currentRegistry(root, newer = {}) {
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const npm = {};
  for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (/^(file|link|workspace):/.test(spec)) continue;
    const current = lock.packages[`node_modules/${name}`].version;
    npm[name] = [current, ...(newer[`npm:${name}`] ? [newer[`npm:${name}`]] : [])];
  }
  const composer = {};
  for (const file of COMPOSER_MANIFESTS) {
    const directory = path.basename(path.dirname(file));
    composer[directory] = {};
    for (const [key, latest] of Object.entries(newer)) if (key.startsWith(`composer:${directory}:`)) composer[directory][key.slice(`composer:${directory}:`.length)] = latest;
  }
  return { npm, composer };
}

// A copy of the dependency files of the repository: the manifests, the locks, the packages of this repository that
// package.json names and the policy and review record.
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-dependency-checkout-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = ['package.json', 'package-lock.json', 'config/dependency-policy.json', 'config/dependency-review.json'];
  for (const spec of Object.values(manifest.dependencies)) if (spec.startsWith('file:')) files.push(`${spec.slice(5)}/package.json`);
  for (const file of COMPOSER_MANIFESTS) files.push(file, file.replace(/composer\.json$/, 'composer.lock'));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(directory, file));
  }
  return directory;
}

const editJson = (root, file, edit) => {
  const data = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  edit(data);
  writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 4)}\n`);
};
const run = (script, args, env, cwd = ROOT) => spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
const registryCalls = calls => calls.filter(call => !/^composer validate\b/.test(call));

test('the gate gives one result on one tree whatever the registries report, and queries no registry', (t) => {
  const stub = registries(t);
  stub.registry(currentRegistry(ROOT));
  const before = run(CHECK, [], stub.env);
  stub.registry(currentRegistry(ROOT, { 'npm:eslint': '99.0.0', 'composer:template-php:phpunit/phpunit': '11.99.0' }));
  const after = run(CHECK, [], stub.env);
  assert.deepEqual(
    { status: after.status, stdout: after.stdout, stderr: after.stderr },
    { status: before.status, stdout: before.stdout, stderr: before.stderr },
    'a newer release in the registries changed the result of the gate on the same tree',
  );
  assert.equal(before.status, 0, before.stdout + before.stderr);
  assert.deepEqual(registryCalls(stub.calls()), [], 'the gate queried a registry');
});

test('the gate reports every finding with its rule and fix in one run', (t) => {
  const stub = registries(t);
  const root = fixture(t);
  editJson(root, 'config/dependency-review.json', (record) => {
    record.dependencies = record.dependencies.filter(entry => entry.package !== 'ajv');
    record.dependencies.find(entry => entry.package === 'laravel/pint').latest = 'v9.0.0';
    const esbuild = record.dependencies.find(entry => entry.package === 'esbuild');
    esbuild.latest = esbuild.version;
    record.locks.find(entry => entry.lock === 'packages/template-php-ext/composer.lock').advisories = [
      { package: 'phpunit/phpunit', version: '11.5.57', id: 'PKSA-test-0001', severity: 'high', title: 'Test advisory', url: 'https://example.invalid/PKSA-test-0001' },
    ];
  });
  editJson(root, 'packages/template-php/composer.lock', (lock) => {
    lock['packages-dev'].find(item => item.name === 'phpunit/phpunit').version = '11.5.1';
  });
  editJson(root, 'packages/template-lsp/package.json', (manifest) => {
    manifest.version = '0.0.2';
  });
  const result = run(CHECK, ['--root', root], stub.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const expected = [
    /^\[dependency-policy\] package\.json ajv: the registry dependency has no entry in the review record\. Rule: .+\. Fix: make dependency-review RECORD=1\.$/m,
    /^\[dependency-policy\] packages\/template-php\/composer\.json laravel\/pint: v\S+ is older than v9\.0\.0, the latest stable release at the review of .+, and config\/dependency-policy\.json holds no exception for it\. Rule: .+\. Fix: make dependency-review UPDATE=1, or add an exception .+\.$/m,
    /^\[dependency-policy\] package\.json esbuild: the review of .+ found 0\.27\.2, the latest stable release, and config\/dependency-policy\.json holds an exception for it\. Rule: .+\. Fix: remove the exception from config\/dependency-policy\.json\.$/m,
    /^\[dependency-policy\] packages\/template-php-ext\/composer\.lock phpunit\/phpunit 11\.5\.57: the review of .+ found advisory PKSA-test-0001 \(high\) Test advisory https:\/\/example\.invalid\/PKSA-test-0001\. Rule: .+\. Fix: make dependency-review UPDATE=1, .+\.$/m,
    /^\[dependency-policy\] packages\/template-php\/composer\.lock: the lock changed after the review of .+: its sha256 is [0-9a-f]{64}, the review recorded [0-9a-f]{64}\. Rule: .+\. Fix: make dependency-review RECORD=1\.$/m,
    /^\[dependency-policy\] packages\/template-php\/composer\.json phpunit\/phpunit: the lock holds 11\.5\.1, the review of .+ recorded 11\.5\.57\. Rule: .+\. Fix: make dependency-review RECORD=1\.$/m,
    /^\[dependency-policy\] package\.json @polyspec\/template-lsp: the lock records version 0\.0\.1, packages\/template-lsp has version 0\.0\.2\. Rule: .+\. Fix: run npm install\.$/m,
    /^\[dependency-policy\] 7 findings; the check reads only the files of the checkout and queries no registry$/m,
  ];
  for (const pattern of expected) assert.match(result.stderr, pattern);
  assert.deepEqual(registryCalls(stub.calls()), [], 'the gate queried a registry');
});

test('the gate fails on a stale Composer lock without a registry', (t) => {
  const stub = registries(t);
  const root = fixture(t);
  editJson(root, 'packages/template-php-ext/composer.json', (manifest) => {
    manifest['require-dev']['phpunit/phpunit'] = '^11.4';
  });
  const result = run(CHECK, ['--root', root], stub.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /^\[dependency-policy\] packages\/template-php-ext\/composer\.json: composer validate --strict failed: .*lock file is not up to date.*\. Fix: run composer update --lock in packages\/template-php-ext\.$/m);
  assert.deepEqual(registryCalls(stub.calls()), [], 'the gate queried a registry');
});

test('the review reports newer stable releases and advisories with the fix command', (t) => {
  const stub = registries(t);
  const root = fixture(t);
  const data = currentRegistry(root, { 'npm:eslint': '99.0.0', 'npm:esbuild': '0.99.0', 'npm:typescript': '99.0.0', 'composer:template-php:phpunit/phpunit': '11.99.0' });
  data.npm.vitest.push('99.0.0-beta.1');
  data.composerAudit = { 'template-php-ext': { advisories: { 'phpunit/phpunit': [{ advisoryId: 'PKSA-test-0002', title: 'Test advisory', link: 'https://example.invalid/PKSA-test-0002', severity: 'medium', cve: null }] }, abandoned: [] } };
  stub.registry(data);
  const result = run(REVIEW, ['--root', root], stub.env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^\[dependency-review\] package\.json eslint \S+ < 99\.0\.0: a newer stable release exists\. Fix: make dependency-review UPDATE=1\.$/m);
  assert.match(result.stdout, /^\[dependency-review\] packages\/template-php\/composer\.json phpunit\/phpunit \S+ < 11\.99\.0: a newer stable release exists\. Fix: make dependency-review UPDATE=1\.$/m);
  assert.match(result.stdout, /^\[dependency-review\] packages\/template-php-ext\/composer\.lock phpunit\/phpunit \S+: advisory PKSA-test-0002 \(medium\) Test advisory https:\/\/example\.invalid\/PKSA-test-0002\. Fix: make dependency-review UPDATE=1\.$/m);
  assert.match(result.stdout, /^\[dependency-review\] package\.json esbuild 0\.27\.2 < 0\.99\.0: kept by the exception of config\/dependency-policy\.json: .+$/m);
  assert.doesNotMatch(result.stdout, /vitest \S+ < 99\.0\.0-beta\.1/, 'the review took a prerelease for a stable release');
  assert.match(result.stdout, /^\[dependency-review\] package\.json @types\/vscode \S+: the exception of config\/dependency-policy\.json is stale, \S+ is the latest stable release\. Fix: remove the exception from config\/dependency-policy\.json\.$/m);
  assert.match(result.stdout, /^\[dependency-review\] 4 findings$/m);

  stub.registry(currentRegistry(root, { 'npm:esbuild': '0.99.0', 'npm:typescript': '99.0.0', 'npm:@types/vscode': '1.999.0' }));
  const current = run(REVIEW, ['--root', root], stub.env);
  assert.equal(current.status, 0, current.stdout + current.stderr);
  assert.match(current.stdout, /^\[dependency-review\] no newer stable release without an exception and no advisory$/m);
});

test('the review records what it reviewed, and the gate accepts the record without a registry', (t) => {
  const stub = registries(t);
  const root = fixture(t);
  rmSync(path.join(root, 'config/dependency-review.json'));
  const data = currentRegistry(root, { 'npm:esbuild': '0.99.0', 'npm:typescript': '99.0.0', 'npm:@types/vscode': '1.999.0' });
  stub.registry(data);
  const recorded = run(REVIEW, ['--root', root, '--record'], stub.env);
  assert.equal(recorded.status, 0, recorded.stdout + recorded.stderr);
  const record = JSON.parse(readFileSync(path.join(root, 'config/dependency-review.json'), 'utf8'));
  assert.match(record.reviewed, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.deepEqual(record.locks.map(entry => entry.lock), ['package-lock.json', 'packages/template-php/composer.lock', 'packages/template-php-ext/composer.lock']);
  assert.ok(record.locks.every(entry => /^[0-9a-f]{64}$/.test(entry.sha256) && Array.isArray(entry.advisories) && entry.advisories.length === 0));
  assert.deepEqual(record.dependencies.find(entry => entry.package === 'esbuild'), { ecosystem: 'npm', manifest: 'package.json', package: 'esbuild', version: '0.27.2', latest: '0.99.0' });
  assert.ok(!record.dependencies.some(entry => entry.package.startsWith('@polyspec/') || entry.package === 'php'), 'the record holds a package of this repository or a platform requirement');

  stub.clear();
  const gate = run(CHECK, ['--root', root], stub.env);
  assert.equal(gate.status, 0, gate.stdout + gate.stderr);
  assert.deepEqual(registryCalls(stub.calls()), [], 'the gate queried a registry');
});

test('the update plan raises each outdated dependency without an exception and keeps its range operator', async () => {
  const { updatePlan } = await import(REVIEW);
  const plan = updatePlan({
    newer: [
      { ecosystem: 'npm', manifest: 'package.json', package: 'eslint', kind: 'devDependencies', spec: '^10.12.0', version: '10.12.0', latest: '10.13.0' },
      { ecosystem: 'npm', manifest: 'package.json', package: 'pinned', kind: 'dependencies', spec: '1.0.0', version: '1.0.0', latest: '1.1.0' },
      { ecosystem: 'composer', manifest: 'packages/template-php/composer.json', package: 'laravel/pint', kind: 'require-dev', spec: '^1.0', version: 'v1.30.4', latest: 'v1.31.0' },
    ],
    advisories: [
      { lock: 'package-lock.json', package: 'brace-expansion' },
      { lock: 'packages/template-php-ext/composer.lock', package: 'phpunit/phpunit' },
    ],
  });
  assert.deepEqual(plan, [
    { command: 'npm', args: ['install', '--save-dev', 'eslint@^10.13.0'], cwd: '.' },
    { command: 'npm', args: ['install', '--save', '--save-exact', 'pinned@1.1.0'], cwd: '.' },
    { command: 'composer', args: ['require', '--dev', '--update-with-dependencies', '--no-interaction', 'laravel/pint:^1.31.0'], cwd: 'packages/template-php' },
    { command: 'npm', args: ['audit', 'fix'], cwd: '.' },
    { command: 'composer', args: ['update', '--with-dependencies', '--no-interaction', 'phpunit/phpunit'], cwd: 'packages/template-php-ext' },
  ]);
});
