// Tests the release of a tag (scripts/release.mjs, .github/workflows/release.yml, T22.1-4).
//
// Each case builds a Git repository in a temporary directory with the manifests of the release, a changelog, a branch
// origin/main and the tag, and puts fakes of gh and npm first on PATH. The fake gh answers the check runs of the GitHub
// API from a JSON state file and records each call; the fake npm writes the archive that npm pack writes. No case reaches
// GitHub or a registry.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as release from '../../scripts/release.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPOSITORY = 'polyspec/template';

const FAKE_GH = `
const fs = require('node:fs');
const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
if (args[0] === 'api' && args[1] === '--paginate') {
  for (const run of state.checkRuns) console.log(JSON.stringify([run.id, run.name, run.status, run.conclusion]));
} else if (args[0] === 'release' && args[1] === 'create') {
  state.notes = fs.readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8');
} else {
  console.error('fake gh: unexpected arguments ' + JSON.stringify(args));
  process.exit(1);
}
fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));
`;
const FAKE_NPM = `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] !== 'pack') process.exit(1);
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const name = manifest.name.replace(/^@/, '').replace('/', '-');
fs.writeFileSync(path.join(args[args.indexOf('--pack-destination') + 1], name + '-' + manifest.version + '.tgz'), 'npm');
`;
const CHANGELOG = `# Changelog

## Unreleased

- A change after the release.

## 0.0.1

- The first entry of 0.0.1.
- The second entry of 0.0.1.
`;

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// A repository with the manifests of release.MANIFESTS at one version, a changelog, origin/main and the fakes.
function sandbox(t, { version = '0.0.1', changelog = CHANGELOG } = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), 'template-release-test-'));
  const root = path.join(folder, 'repository');
  const bin = path.join(folder, 'bin');
  const state = path.join(folder, 'state.json');
  mkdirSync(root);
  mkdirSync(bin);
  for (const [name, source] of [['gh', FAKE_GH], ['npm', FAKE_NPM]]) {
    writeFileSync(path.join(bin, name), `#!${process.execPath}\n${source}`);
    chmodSync(path.join(bin, name), 0o755);
  }
  const names = Object.fromEntries(release.PACKAGES.map(([, directory, name]) => [directory, name]));
  for (const manifest of Object.keys(release.MANIFESTS)) {
    const file = path.join(root, manifest);
    mkdirSync(path.dirname(file), { recursive: true });
    const name = names[path.dirname(manifest)] ?? '@polyspec/template-workspace';
    if (manifest.endsWith('package.json')) writeFileSync(file, JSON.stringify({ name, version }));
    else if (manifest.endsWith('composer.json')) writeFileSync(file, JSON.stringify({ name }));
    else writeFileSync(file, `[package]\nname = "${name}"\nversion = "${version}"\n\n[dependencies]\n`);
  }
  mkdirSync(path.join(root, 'packages/template-php/src'));
  writeFileSync(path.join(root, 'packages/template-php/src/Engine.php'), '<?php\n');
  for (const [directory, module] of Object.entries(release.GO_MODULES)) {
    mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, directory, 'go.mod'), `module ${module}\n\ngo 1.27.1\n`);
  }
  writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'release');
  const commit = git(root, 'rev-parse', 'HEAD');
  git(root, 'update-ref', 'refs/remotes/origin/main', commit);
  const saved = { PATH: process.env.PATH, FAKE_STATE: process.env.FAKE_STATE };
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  process.env.FAKE_STATE = state;
  t.after(() => {
    process.env.PATH = saved.PATH;
    if (saved.FAKE_STATE === undefined) delete process.env.FAKE_STATE;
    else process.env.FAKE_STATE = saved.FAKE_STATE;
    rmSync(folder, { recursive: true, force: true });
  });
  const box = {
    root,
    commit,
    checkRuns(runs) {
      writeFileSync(state, JSON.stringify({ calls: [], checkRuns: runs.map(([name, conclusion], index) => ({
        id: index + 1, name, status: conclusion ? 'completed' : 'in_progress', conclusion }))
      }));
    },
    tag(tag, target = commit) {
      git(root, 'tag', '-a', tag, '-m', tag, target);
      return tag;
    },
    recorded: () => JSON.parse(readFileSync(state, 'utf8')),
  };
  box.checkRuns([['push-gate', 'success'], ['ci-passed', 'success']]);
  return box;
}

function stops(action, message) {
  assert.throws(action, error => {
    assert.ok(error instanceof release.Stop, error.stack);
    if (message instanceof RegExp) assert.match(error.message, message);
    else assert.equal(error.message, message);
    return true;
  });
}

test('a release tag is a version or a Go module directory and a version', () => {
  assert.deepEqual(release.parseTag('v0.0.1'), [null, '0.0.1']);
  assert.deepEqual(release.parseTag('v10.20.30'), [null, '10.20.30']);
  assert.deepEqual(release.parseTag('packages/template-go/v0.0.1'), ['packages/template-go', '0.0.1']);
  for (const tag of ['v1.0', '1.0.0', 'v01.0.0', 'v1.0.0-rc.1', 'vX.Y.Z', 'packages/template-go/1.0.0']) {
    stops(() => release.parseTag(tag), /a release tag is vX\.Y\.Z/);
  }
  stops(() => release.parseTag('go/v1.0.0'), 'go/v1.0.0: go is not a Go module directory; the Go modules are packages/template-go');
});

test('every manifest at the version and the changelog section pass', t => {
  const box = sandbox(t);
  assert.equal(release.versions(box.root, 'v0.0.1'), '0.0.1');
});

test('a version mismatch names the file and both values', t => {
  const box = sandbox(t);
  const cargo = path.join(box.root, 'packages/template-rust/Cargo.toml');
  writeFileSync(cargo, readFileSync(cargo, 'utf8').replace('version = "0.0.1"', 'version = "0.0.2"'));
  const lsp = path.join(box.root, 'packages/template-lsp/package.json');
  writeFileSync(lsp, readFileSync(lsp, 'utf8').replace('"0.0.1"', '"0.1.0"'));
  stops(() => release.versions(box.root, 'v0.0.1'),
    'packages/template-lsp/package.json: version 0.1.0, the tag v0.0.1 is 0.0.1; packages/template-rust/Cargo.toml: version 0.0.2, the tag v0.0.1 is 0.0.1');
});

test('a composer manifest without a version takes the tag, and one with a version is compared', t => {
  const box = sandbox(t);
  const composer = path.join(box.root, 'packages/template-php/composer.json');
  assert.equal('version' in JSON.parse(readFileSync(composer, 'utf8')), false);
  assert.equal(release.versions(box.root, 'v0.0.1'), '0.0.1');
  writeFileSync(composer, JSON.stringify({ name: 'polyspec/template', version: '0.0.2' }));
  stops(() => release.versions(box.root, 'v0.0.1'), 'packages/template-php/composer.json: version 0.0.2, the tag v0.0.1 is 0.0.1');
});

test('a missing changelog section fails', t => {
  const box = sandbox(t, { version: '0.0.2' });
  stops(() => release.versions(box.root, 'v0.0.2'), 'CHANGELOG.md: no section ## 0.0.2 for the tag v0.0.2');
  const empty = sandbox(t, { changelog: '# Changelog\n\n## Unreleased\n\n## 0.0.1\n\n<a id="x"></a>\n## 0.0.0\n' });
  stops(() => release.versions(empty.root, 'v0.0.1'), 'CHANGELOG.md: the section ## 0.0.1 has no entry for the tag v0.0.1');
});

test('a Go tag requires the module path of its directory and the changelog section', t => {
  const box = sandbox(t, { version: '9.9.9' });
  assert.equal(release.versions(box.root, 'packages/template-go/v0.0.1'), '0.0.1');
  writeFileSync(path.join(box.root, 'packages/template-go/go.mod'), 'module github.com/polyspec/template\n');
  stops(() => release.versions(box.root, 'packages/template-go/v0.0.1'),
    'packages/template-go/go.mod: module github.com/polyspec/template, the tag packages/template-go/v0.0.1 is github.com/polyspec/template/packages/template-go');
});

test('the section is the release notes without the anchor of the next section', t => {
  const box = sandbox(t, { changelog: CHANGELOG.replace('\n## 0.0.1\n', '\n<a id="0-0-1"></a>\n## 0.0.1\n') });
  assert.equal(release.changelogSection(box.root, '0.0.1'), '- The first entry of 0.0.1.\n- The second entry of 0.0.1.\n');
  assert.equal(release.changelogSection(box.root, 'Unreleased'), '- A change after the release.\n');
});

test('a commit of main with both checks passed is verified', t => {
  const box = sandbox(t);
  assert.deepEqual(release.verify(box.root, box.tag('v0.0.1'), REPOSITORY), [box.commit, ['push-gate', 'ci-passed']]);
  assert.deepEqual(box.recorded().calls, [['api', '--paginate', `repos/${REPOSITORY}/commits/${box.commit}/check-runs?per_page=100`,
    '--jq', '.check_runs[] | [.id, .name, .status, .conclusion] | @json']]);
});

test('a commit that is not on main fails before any request', t => {
  const box = sandbox(t);
  git(box.root, 'commit', '--quiet', '--allow-empty', '-m', 'outside main');
  const outside = git(box.root, 'rev-parse', 'HEAD');
  stops(() => release.verify(box.root, box.tag('v0.0.1', outside), REPOSITORY), new RegExp(`^v0\\.0\\.1: the commit ${outside} is not on origin/main; `));
  assert.deepEqual(box.recorded().calls, []);
});

test('a missing or failed check is named', t => {
  const cases = {
    missing: [[['push-gate', 'success']], 'the check ci-passed is missing'],
    failed: [[['push-gate', 'failure'], ['ci-passed', 'success']], 'the check push-gate is completed with the conclusion failure, not success'],
    running: [[['push-gate', 'success'], ['ci-passed', null]], 'the check ci-passed is in_progress with the conclusion null, not success'],
    both: [[], 'the check push-gate is missing; the check ci-passed is missing'],
  };
  for (const [runs, message] of Object.values(cases)) {
    const box = sandbox(t);
    box.checkRuns(runs);
    stops(() => release.verify(box.root, box.tag('v0.0.1'), REPOSITORY), `v0.0.1: the commit ${box.commit}: ${message}`);
  }
});

test('the latest run of a check decides', t => {
  const box = sandbox(t);
  box.checkRuns([['push-gate', 'success'], ['ci-passed', 'failure'], ['ci-passed', 'success']]);
  assert.equal(release.verify(box.root, box.tag('v0.0.1'), REPOSITORY)[0], box.commit);
  box.checkRuns([['push-gate', 'success'], ['ci-passed', 'success'], ['ci-passed', 'failure']]);
  stops(() => release.verify(box.root, 'v0.0.1', REPOSITORY), /the check ci-passed is completed with the conclusion failure/);
});

test('without the repository the step fails before any request', t => {
  const box = sandbox(t);
  stops(() => release.verify(box.root, box.tag('v0.0.1'), undefined), /GITHUB_REPOSITORY is not set/);
});

test('an asset is named after its package and version', () => {
  assert.equal(release.assetName('@polyspec/template', '0.0.1', 'tgz'), 'polyspec-template-0.0.1.tgz');
  assert.equal(release.assetName('polyspec/template-php-ext', '1.2.3', 'zip'), 'polyspec-template-php-ext-1.2.3.zip');
  assert.deepEqual(release.assetNames('v0.0.1'), [
    'polyspec-template-0.0.1.tgz', 'polyspec-template-language-0.0.1.tgz', 'polyspec-template-lsp-0.0.1.tgz',
    'polyspec-template-codemirror-0.0.1.tgz', 'polyspec-template-0.0.1.zip', 'polyspec-template-php-ext-0.0.1.zip']);
  assert.deepEqual(release.assetNames('packages/template-go/v0.0.1'), []);
});

test('assets builds one archive per package', t => {
  const box = sandbox(t);
  const names = release.assets(box.root, box.tag('v0.0.1'));
  assert.deepEqual(readdirSync(path.join(box.root, release.ASSETS)).sort(), [...names].sort());
  assert.deepEqual(names, release.assetNames('v0.0.1'));
  const listed = spawnSync('unzip', ['-Z1', path.join(box.root, release.ASSETS, 'polyspec-template-0.0.1.zip')], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.split('\n').filter(Boolean).sort(), ['composer.json', 'src/', 'src/Engine.php']);
});

test('a Go tag builds no archive', t => {
  const box = sandbox(t);
  assert.deepEqual(release.assets(box.root, box.tag('packages/template-go/v0.0.1')), []);
  assert.deepEqual(readdirSync(path.join(box.root, release.ASSETS)), []);
});

test('publish creates the release with the notes and the archives', t => {
  const box = sandbox(t);
  const tag = box.tag('v0.0.1');
  release.assets(box.root, tag);
  assert.deepEqual(release.publish(box.root, tag), release.assetNames(tag));
  const { calls, notes } = box.recorded();
  const call = calls.at(-1);
  const notesFile = call[call.indexOf('--notes-file') + 1];
  assert.deepEqual(call, ['release', 'create', 'v0.0.1', '--verify-tag', '--title', 'v0.0.1', '--notes-file', notesFile,
    ...release.assetNames(tag).map(name => path.join(box.root, release.ASSETS, name))]);
  assert.equal(notes, '- The first entry of 0.0.1.\n- The second entry of 0.0.1.\n');
});

test('a Go tag creates a release without archives', t => {
  const box = sandbox(t);
  const tag = box.tag('packages/template-go/v0.0.1');
  assert.deepEqual(release.publish(box.root, tag), []);
  const call = box.recorded().calls.at(-1);
  assert.deepEqual(call.slice(0, 7), ['release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file']);
  assert.equal(call.length, 8);
});

test('publish without the archives fails before any request', t => {
  const box = sandbox(t);
  stops(() => release.publish(box.root, box.tag('v0.0.1')), /^var\/release\/assets lacks \[.*\]; make release-assets builds them$/);
  assert.deepEqual(box.recorded().calls, []);
});

test('the declarations cover every tracked manifest of the repository', () => {
  const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const manifests = tracked.filter(file => ['package.json', 'composer.json', 'Cargo.toml', 'VERSION', 'pyproject.toml', 'go.mod'].includes(path.basename(file))).sort();
  const declared = [...Object.keys(release.MANIFESTS), ...Object.keys(release.NOT_RELEASED), ...Object.keys(release.GO_MODULES).map(directory => `${directory}/go.mod`)].sort();
  assert.deepEqual(manifests, declared, 'a tracked manifest is neither released nor declared as not released');
  for (const [kind, directory, name] of release.PACKAGES) {
    const manifest = path.join(ROOT, directory, { npm: 'package.json', composer: 'composer.json' }[kind]);
    assert.equal(release.MANIFESTS[path.relative(ROOT, manifest)], release.ARCHIVE, `${directory} is a package whose manifest is not an archive of MANIFESTS`);
    const text = readFileSync(manifest, 'utf8');
    assert.equal(JSON.parse(text).name, name, directory);
    if (kind === 'npm') assert.notEqual(JSON.parse(text).private, true, `${directory} is private, so npm does not publish it`);
  }
});

test('the assets are npm tarballs and Composer zips only, and a Rust crate is consumed by git tag', () => {
  assert.deepEqual([...new Set(release.PACKAGES.map(([kind]) => kind))].sort(), ['composer', 'npm']);
  const archived = release.PACKAGES.map(([kind, directory]) => `${directory}/${kind === 'npm' ? 'package.json' : 'composer.json'}`).sort();
  assert.deepEqual(Object.entries(release.MANIFESTS).filter(([, how]) => how === release.ARCHIVE).map(([name]) => name).sort(), archived);
  for (const [name, how] of Object.entries(release.MANIFESTS)) {
    assert.ok([release.ARCHIVE, release.VERSION_ONLY, release.GIT_TAG].includes(how), `${name}: ${how}`);
    if (path.basename(name) === 'Cargo.toml') assert.equal(how, 'not released as an archive; consumed by git tag', name);
  }
  const source = readFileSync(path.join(ROOT, 'scripts/release.mjs'), 'utf8');
  assert.doesNotMatch(source, /'cargo', \['package'/);
  assert.doesNotMatch(source, /\.crate/);
});

test('the version of the tree passes the version check', () => {
  const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(release.versions(ROOT, `v${version}`), version);
  assert.equal(release.versions(ROOT, `packages/template-go/v${version}`), version);
});

test('make runs each step with the tag of the environment and fails without it', () => {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !['MAKEFLAGS', 'MFLAGS', 'MAKELEVEL', 'TAG'].includes(name)));
  for (const step of ['verify', 'versions', 'assets', 'publish']) {
    const listed = spawnSync('make', ['--no-print-directory', '-n', `release-${step}`], { cwd: ROOT, encoding: 'utf8', env: { ...environment, TAG: 'v0.0.1' } });
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(listed.stdout.trim().split('\n').at(-1), `node scripts/release.mjs ${step} "$TAG"`);
    const missing = spawnSync('make', ['--no-print-directory', '-n', `release-${step}`], { cwd: ROOT, encoding: 'utf8', env: environment });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, new RegExp(`make release-${step} needs TAG=<tag>`));
  }
  const npmBuilds = ['build-ts', 'build-language', 'build-lsp', 'build-codemirror'];
  const prerequisites = tag => spawnSync('make', ['--no-print-directory', '-p', '-n', 'release-assets'], { cwd: ROOT, encoding: 'utf8', env: { ...environment, TAG: tag } })
    .stdout.split('\n').find(line => line.startsWith('release-assets:')).replace(/^release-assets:\s*/, '').split(/\s+/).filter(Boolean);
  assert.deepEqual(prerequisites('v0.0.1'), npmBuilds, 'a tag vX.Y.Z builds the npm packages before their archives');
  assert.deepEqual(prerequisites('packages/template-go/v0.0.1'), [], 'a Go module tag builds nothing');
});
