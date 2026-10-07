// Tests the release of a tag (scripts/release.mjs, .github/workflows/release.yml, T22.1-4).
//
// Each case builds a Git repository in a temporary directory with the manifests of the release, a changelog, a branch
// origin/main and the tag, and puts fakes of gh and npm first on PATH. The fake gh answers the check runs of the GitHub
// API from a JSON state file and records each call; the fake npm packs package.json of its directory into the tarball that
// npm pack writes. The cases of the packed assets run the npm and Composer of the run against the manifests of the tree
// and install the assets in a directory outside the repository with an empty cache. No case reaches GitHub or a registry.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] !== 'pack') process.exit(1);
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const name = manifest.name.replace(/^@/, '').replace('/', '-');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-npm-'));
fs.mkdirSync(path.join(folder, 'package'));
fs.copyFileSync('package.json', path.join(folder, 'package', 'package.json'));
execFileSync('tar', ['-czf', path.resolve(args[args.indexOf('--pack-destination') + 1], name + '-' + manifest.version + '.tgz'), '-C', folder, 'package']);
fs.rmSync(folder, { recursive: true, force: true });
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
  // The packages depend on each other at the exact version, as the manifests of the tree do.
  const dependencies = {
    'packages/template-language': { dependencies: { '@polyspec/template': version } },
    'packages/template-lsp': { dependencies: { '@polyspec/template-language': version, other: '^1.0.0' } },
    'packages/template-codemirror': { dependencies: { '@polyspec/template-language': version }, peerDependencies: { other: '^1.0.0' } },
    'packages/template-php-ext': { require: { php: '^8.2', 'polyspec/template': version } },
  };
  for (const manifest of Object.keys(release.MANIFESTS)) {
    const file = path.join(root, manifest);
    mkdirSync(path.dirname(file), { recursive: true });
    const name = names[path.dirname(manifest)] ?? '@polyspec/template-workspace';
    const declared = dependencies[path.dirname(manifest)] ?? {};
    if (manifest.endsWith('package.json')) writeFileSync(file, JSON.stringify({ name, version, ...declared }));
    else if (manifest.endsWith('composer.json')) writeFileSync(file, JSON.stringify({ name, version, ...declared }));
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

test('a composer manifest declares the version of the tag', t => {
  const box = sandbox(t);
  const composer = path.join(box.root, 'packages/template-php/composer.json');
  writeFileSync(composer, JSON.stringify({ name: 'polyspec/template', version: '0.0.2' }));
  stops(() => release.versions(box.root, 'v0.0.1'), 'packages/template-php/composer.json: version 0.0.2, the tag v0.0.1 is 0.0.1');
  writeFileSync(composer, JSON.stringify({ name: 'polyspec/template' }));
  stops(() => release.versions(box.root, 'v0.0.1'), 'packages/template-php/composer.json: version none, the tag v0.0.1 is 0.0.1');
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

test('each archive carries the manifest of its package unchanged', t => {
  const box = sandbox(t);
  const directory = path.join(box.root, release.ASSETS);
  const tag = box.tag('v0.0.1');
  release.assets(box.root, tag);
  release.PACKAGES.forEach(([kind, source], index) => {
    const manifest = path.join(box.root, source, kind === 'npm' ? 'package.json' : 'composer.json');
    assert.deepEqual(release.packedManifest(path.join(directory, release.assetNames(tag)[index])), JSON.parse(readFileSync(manifest, 'utf8')), source);
  });
});

test('an archive whose manifest differs from its source or does not install outside the repository fails assets', t => {
  const box = sandbox(t);
  const ext = path.join(box.root, 'packages/template-php-ext/composer.json');
  writeFileSync(ext, JSON.stringify({ name: 'polyspec/template-php-ext', version: '0.0.1', require: { 'polyspec/template': '@dev' }, repositories: [{ type: 'path', url: '../template-php' }] }));
  const lsp = path.join(box.root, 'packages/template-lsp/package.json');
  writeFileSync(lsp, JSON.stringify({ name: '@polyspec/template-lsp', version: '0.0.1', dependencies: { '@polyspec/template-language': 'file:../template-language' } }));
  git(box.root, 'commit', '--quiet', '-am', 'paths');
  git(box.root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const tag = box.tag('v0.0.1', git(box.root, 'rev-parse', 'HEAD'));
  // npm packs the working tree: a manifest changed after the tagged commit differs from its source.
  const language = path.join(box.root, 'packages/template-language/package.json');
  writeFileSync(language, JSON.stringify({ name: '@polyspec/template-language', version: '0.0.1', dependencies: { '@polyspec/template': '0.0.1' }, extra: true }));
  stops(() => release.assets(box.root, tag), [
    'the release assets of v0.0.1 do not install outside the repository: ',
    'polyspec-template-language-0.0.1.tgz: the packed package.json differs from packages/template-language/package.json; ',
    'polyspec-template-lsp-0.0.1.tgz: dependencies @polyspec/template-language: file:../template-language is a path of the repository, not 0.0.1; ',
    'polyspec-template-php-ext-0.0.1.zip: repositories: [{"type":"path","url":"../template-php"}]; a release zip declares none; ',
    'polyspec-template-php-ext-0.0.1.zip: require polyspec/template: @dev is a development version, not 0.0.1',
  ].join(''));
});

test('the published manifests of the tree name each polyspec dependency by its exact version', () => {
  assert.deepEqual(release.treeManifestProblems(ROOT), []);
});

test('a packed manifest with a polyspec dependency that is not an exact version fails the check', () => {
  const tag = 'v0.0.1';
  const language = '@polyspec/template-language';
  const npm = (field, specs) => release.manifestProblems('npm', { name: '@polyspec/template-lsp', version: '0.0.1', [field]: Object.fromEntries(specs) }, tag);
  assert.deepEqual(npm('dependencies', [[language, '0.0.1'], ['@polyspec/hyper', '0.0.2'], ['other', 'file:../other']]), []);
  for (const [spec, form] of [
    ['file:../template-language', 'a path of the repository'], ['link:../template-language', 'a path of the repository'],
    ['workspace:*', 'a path of the repository'], ['github:polyspec/template', 'a git source'],
    ['git+ssh://git@github.com/polyspec/template.git', 'a git source'], ['git@github.com:polyspec/template.git', 'a git source'],
    ['https://github.com/polyspec/template/releases/download/v0.0.1/polyspec-template-language-0.0.1.tgz', 'a URL'],
    ['^0.0.1', 'a range'], ['*', 'a range'], ['0.0.2', 'another version'],
  ]) {
    for (const field of release.NPM_DEPENDENCY_FIELDS) {
      assert.deepEqual(npm(field, [[language, spec]]), [`${field} ${language}: ${spec} is ${form}, not 0.0.1`]);
    }
  }
  assert.deepEqual(npm('dependencies', [['@polyspec/hyper', '~0.0.2']]), ['dependencies @polyspec/hyper: ~0.0.2 is a range, not an exact version']);

  assert.deepEqual(release.manifestProblems('composer', { name: 'polyspec/template-php-ext', version: '0.0.1', require: { php: '^8.2', 'polyspec/template': '0.0.1', 'polyspec/ordered-json': '0.0.2' } }, tag), []);
  assert.deepEqual(release.manifestProblems('composer', {
    name: 'polyspec/template-php-ext',
    require: { 'polyspec/template': '@dev', 'polyspec/ordered-json': 'dev-main', 'polyspec/other': '^0.0.2' },
    repositories: [{ type: 'path', url: '../template-php' }],
  }, tag), [
    'version: none, not 0.0.1',
    'repositories: [{"type":"path","url":"../template-php"}]; a release zip declares none',
    'require polyspec/template: @dev is a development version, not 0.0.1',
    'require polyspec/ordered-json: dev-main is a development version, not an exact version',
    'require polyspec/other: ^0.0.2 is a range, not an exact version',
  ]);
  assert.deepEqual(release.manifestProblems('composer', { version: '0.0.1', require: { 'polyspec/template': '0.0.2' } }, tag),
    ['require polyspec/template: 0.0.2 is another version, not 0.0.1']);
});

// A repository with the manifests of the packages of the tree, a file for each path that a package.json names, and the
// tag of the version of the tree.
function treeSandbox(t) {
  const folder = mkdtempSync(path.join(tmpdir(), 'template-release-install-'));
  const root = path.join(folder, 'repository');
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [kind, directory] of release.PACKAGES) {
    const manifest = kind === 'npm' ? 'package.json' : 'composer.json';
    const data = JSON.parse(readFileSync(path.join(ROOT, directory, manifest), 'utf8'));
    mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, directory, manifest), readFileSync(path.join(ROOT, directory, manifest)));
    const files = kind === 'npm' ? [...Object.values(data.bin ?? {}), 'dist/index.mjs'] : [...(data.bin ?? []), 'src/Placeholder.php'];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, directory, file)), { recursive: true });
      writeFileSync(path.join(root, directory, file), kind === 'npm' ? 'export {};\n' : '<?php\n');
    }
  }
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'release');
  git(root, 'tag', '-a', `v${version}`, '-m', `v${version}`);
  return { folder, root, version, tag: `v${version}` };
}

function install(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stdout}${result.stderr}`);
}

test('an npm project outside the repository installs the packed tarballs', t => {
  const box = treeSandbox(t);
  const names = release.assets(box.root, box.tag);
  const directory = path.join(box.root, release.ASSETS);
  const project = path.join(box.folder, 'npm-project');
  mkdirSync(project);
  // @polyspec/template-language depends on @polyspec/template; the other dependencies of the LSP server and the CodeMirror
  // package are packages of the npm registry, which a check does not read.
  const tarballs = names.filter(name => /^polyspec-template-(?:language-)?\d.*\.tgz$/.test(name));
  assert.deepEqual(tarballs, [`polyspec-template-${box.version}.tgz`, `polyspec-template-language-${box.version}.tgz`]);
  const packages = tarballs.map(name => release.packedManifest(path.join(directory, name)).name);
  for (const name of tarballs) copyFileSync(path.join(directory, name), path.join(project, name));
  writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    private: true,
    dependencies: Object.fromEntries(packages.map((name, index) => [name, `file:${tarballs[index]}`])),
  }));
  // An empty cache and an unreachable registry for the scope @polyspec: the polyspec packages come only from the tarballs.
  install('npm', ['install', '--cache', path.join(box.folder, 'npm-cache'), '--@polyspec:registry=http://127.0.0.1:9/', '--ignore-scripts', '--no-audit', '--no-fund'], project);
  for (const name of packages) {
    assert.equal(JSON.parse(readFileSync(path.join(project, 'node_modules', name, 'package.json'), 'utf8')).version, box.version, name);
  }
  const lock = JSON.parse(readFileSync(path.join(project, 'package-lock.json'), 'utf8')).packages;
  packages.forEach((name, index) => assert.equal(lock[`node_modules/${name}`].resolved, `file:${tarballs[index]}`, name));
});

test('a Composer project outside the repository installs the packed zips from an artifact repository', t => {
  const box = treeSandbox(t);
  release.assets(box.root, box.tag);
  const project = path.join(box.folder, 'composer-project');
  mkdirSync(project);
  writeFileSync(path.join(project, 'composer.json'), JSON.stringify({
    repositories: [{ type: 'artifact', url: path.join(box.root, release.ASSETS) }, { 'packagist.org': false }],
    require: { 'polyspec/template': box.version },
  }));
  const environment = { COMPOSER_HOME: path.join(box.folder, 'composer-home'), COMPOSER_CACHE_DIR: path.join(box.folder, 'composer-cache') };
  install('composer', ['install', '--no-interaction', '--no-progress', '--no-plugins', '--no-scripts'], project, environment);
  const installed = JSON.parse(readFileSync(path.join(project, 'vendor/composer/installed.json'), 'utf8')).packages;
  assert.deepEqual(installed.map(entry => [entry.name, entry.version]), [['polyspec/template', box.version]]);
  // Composer installs no package of the type php-ext, which PIE builds; the artifact repository reads its zip.
  const shown = spawnSync('composer', ['show', '--available', '--format=json', 'polyspec/template-php-ext'], { cwd: project, encoding: 'utf8', env: { ...process.env, ...environment } });
  assert.equal(shown.status, 0, shown.stderr);
  assert.deepEqual([JSON.parse(shown.stdout).type, JSON.parse(shown.stdout).versions], ['php-ext', [box.version]]);
});
