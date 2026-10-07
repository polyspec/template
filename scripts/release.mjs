#!/usr/bin/env node
// Release a tag of a commit of main: the steps of .github/workflows/release.yml (T22.1-4).
//
//   node scripts/release.mjs verify TAG     the tagged commit is on main and passed the checks push-gate and ci-passed
//   node scripts/release.mjs versions TAG   every manifest of the tag has its version and CHANGELOG.md its section
//   node scripts/release.mjs assets TAG     build the archive of every package of the tag into var/release/assets
//   node scripts/release.mjs publish TAG    create the GitHub Release of the tag with its notes and archives
//
// Every change reaches main through the merge queue with the required checks, so every commit of main passed the full
// suite; the maintainer releases by tagging a commit of main after a version-bump pull request, and a tag push runs these
// steps in order. A tag `vX.Y.Z` releases the packages of PACKAGES at version X.Y.Z; a tag `<directory>/vX.Y.Z` releases
// the Go module of that directory (GO_MODULES), which needs no archive. No step reruns the tests.
//
// `verify` resolves the tag to its commit, requires that commit to be an ancestor of origin/main (`git merge-base
// --is-ancestor`) and reads the check runs of the commit from the GitHub API (`gh api
// repos/<repository>/commits/<sha>/check-runs`, the repository of GITHUB_REPOSITORY): the latest run of each of push-gate
// and ci-passed must be completed with the conclusion success. `versions` compares X.Y.Z with the version of every
// manifest of MANIFESTS and requires the section `## X.Y.Z` in CHANGELOG.md; for a Go tag it requires the module path of the go.mod of the
// directory. `assets` builds one archive per package, named `<package name>-<version>.<ext>` with `@scope/` written as
// `scope-` and `vendor/` as `vendor-`: `npm pack` (.tgz) of a built package and a zip of the directory of a Composer
// package from `git archive` of the tagged commit at the time of the commit (.zip). Each archive carries the manifest of its package unchanged; a
// consumer downloads the archives and installs them together, so `checkAssets` fails unless every packed manifest equals
// its manifest at the tagged commit, names each polyspec dependency by its name and exact version and, for Composer,
// declares the version of the tag and no `repositories`. The Rust crate is not released as an archive; it is consumed by
// git tag, because `cargo package` rewrites git dependencies into crates.io requirements that do not resolve. A Go tag
// builds and attaches nothing. `publish` runs `gh release create TAG --verify-tag --title TAG --notes-file <the section
// X.Y.Z>` with the archives of `assets`; a section over NOTES_LIMIT characters, the limit of a release body on GitHub,
// is replaced by one line that links the section of CHANGELOG.md at the tag. Each failure names the tag, the file or check and both values, and exits with
// status 1.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAIN = 'origin/main';
export const CHECKS = ['push-gate', 'ci-passed'];
export const CHANGELOG = 'CHANGELOG.md';
export const ASSETS = 'var/release/assets';
// GitHub refuses a release body over 125000 characters; a longer section of CHANGELOG.md is linked from the notes.
export const NOTES_LIMIT = 125000;
export const REPOSITORY_URL = 'https://github.com/polyspec/template';
// The packages that a tag vX.Y.Z releases as archives, one archive each: [kind, directory, package name]. The release
// assets are npm tarballs and Composer zips only.
export const PACKAGES = [
  ['npm', 'packages/template-ts', '@polyspec/template'],
  ['npm', 'packages/template-language', '@polyspec/template-language'],
  ['npm', 'packages/template-lsp', '@polyspec/template-lsp'],
  ['npm', 'packages/template-codemirror', '@polyspec/template-codemirror'],
  ['composer', 'packages/template-php', 'polyspec/template'],
  ['composer', 'packages/template-php-ext', 'polyspec/template-php-ext'],
];
export const ARCHIVE = 'released as an archive';
export const VERSION_ONLY = 'carries the version of the release without an archive';
export const GIT_TAG = 'not released as an archive; consumed by git tag';
// The manifests whose version a tag vX.Y.Z sets, each with how the tag releases it: the archive of its package; the
// workspace of the repository root and the VS Code extension, which carry the version without an archive; and the Rust
// crate, which is consumed by git tag because `cargo package` rewrites git dependencies into crates.io requirements that
// do not resolve.
export const MANIFESTS = {
  'package.json': VERSION_ONLY,
  'packages/template-ts/package.json': ARCHIVE,
  'packages/template-language/package.json': ARCHIVE,
  'packages/template-lsp/package.json': ARCHIVE,
  'packages/template-codemirror/package.json': ARCHIVE,
  'packages/template-vscode/package.json': VERSION_ONLY,
  'packages/template-php/composer.json': ARCHIVE,
  'packages/template-php-ext/composer.json': ARCHIVE,
  'packages/template-rust/Cargo.toml': GIT_TAG,
};
// The tracked manifests that no tag releases, with the reason.
export const NOT_RELEASED = {
  'packages/template-vscode/tests/integration/harness/package.json': 'the harness of the VS Code integration test',
  'tools/showcase/adapters/rust/Cargo.toml': 'the Rust adapter of the showcase',
  'tools/showcase/adapters/go/go.mod': 'the Go adapter of the showcase, a module local to the repository',
  'tests/fixtures/release-consumer/npm/package.json': 'the npm consumer project of the install test of the release assets',
  'tests/fixtures/release-consumer/composer/composer.json': 'the Composer consumer project of the install test of the release assets',
};
// The Go modules: a tag <directory>/vX.Y.Z releases the module of that directory.
export const GO_MODULES = { 'packages/template-go': 'github.com/polyspec/template/packages/template-go' };
const TAG = /^(?:(?<directory>[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)\/)?v(?<version>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

/** A step fails; the message names the cause. */
export class Stop extends Error {}

/** [Go module directory or null, version] of a release tag. */
export function parseTag(tag) {
  const found = TAG.exec(tag);
  if (!found) throw new Stop(`${tag}: a release tag is vX.Y.Z or <Go module directory>/vX.Y.Z`);
  const { directory = null, version } = found.groups;
  if (directory !== null && !(directory in GO_MODULES)) {
    throw new Stop(`${tag}: ${directory} is not a Go module directory; the Go modules are ${Object.keys(GO_MODULES).sort().join(', ')}`);
  }
  return [directory, version];
}

/** The standard output of a command; Stop with the command, its exit status and its standard error. */
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  if (result.error) throw new Stop(`${[command, ...args].join(' ')} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Stop(`${[command, ...args].join(' ')} exited with ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function taggedCommit(root, tag) {
  return run('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], root).trim();
}

/** The tagged commit is on main and the latest run of every check of CHECKS concluded success: [commit, checks]. */
export function verify(root, tag, repository) {
  parseTag(tag);
  if (!repository) throw new Stop('GITHUB_REPOSITORY is not set; it names the repository <owner>/<name> whose check runs are read');
  const commit = taggedCommit(root, tag);
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', commit, MAIN], { cwd: root, encoding: 'utf8' });
  if (ancestry.status === 1) throw new Stop(`${tag}: the commit ${commit} is not on ${MAIN}; a release tags a commit of main`);
  if (ancestry.status !== 0) {
    throw new Stop(`git merge-base --is-ancestor ${commit} ${MAIN} exited with ${ancestry.status}: ${ancestry.stderr.trim()}`);
  }
  const listed = run('gh', ['api', '--paginate', `repos/${repository}/commits/${commit}/check-runs?per_page=100`,
    '--jq', '.check_runs[] | [.id, .name, .status, .conclusion] | @json'], root);
  const runs = listed.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const problems = [];
  for (const name of CHECKS) {
    const named = runs.filter(entry => entry[1] === name);
    if (named.length === 0) {
      problems.push(`the check ${name} is missing`);
      continue;
    }
    const [, , status, conclusion] = named.reduce((latest, entry) => (entry[0] > latest[0] ? entry : latest));
    if (status !== 'completed' || conclusion !== 'success') {
      problems.push(`the check ${name} is ${status} with the conclusion ${conclusion}, not success`);
    }
  }
  if (problems.length) throw new Stop(`${tag}: the commit ${commit}: ${problems.join('; ')}`);
  return [commit, [...CHECKS]];
}

/** The version that a manifest declares, or null without one. */
export function manifestVersion(file) {
  const text = readFileSync(file, 'utf8');
  const name = path.basename(file);
  if (name === 'package.json' || name === 'composer.json') return JSON.parse(text).version ?? null;
  if (name === 'Cargo.toml') {
    const section = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text);
    return /^version\s*=\s*"([^"]*)"/m.exec(section?.[1] ?? '')?.[1] ?? null;
  }
  throw new Stop(`${name}: not a manifest of a release`);
}

/** The body of the section `## version` of CHANGELOG.md, without the anchor of the next section. */
export function changelogSection(root, version) {
  const lines = readFileSync(path.join(root, CHANGELOG), 'utf8').split('\n');
  const heading = lines.indexOf(`## ${version}`);
  if (heading === -1) throw new Stop(`${CHANGELOG}: no section ## ${version}`);
  let end = lines.findIndex((line, index) => index > heading && line.startsWith('## '));
  if (end === -1) end = lines.length;
  const body = lines.slice(heading + 1, end);
  while (body.length && (!body.at(-1).trim() || /^<a id="[^"]*"><\/a>$/.test(body.at(-1).trim()))) body.pop();
  while (body.length && !body[0].trim()) body.shift();
  if (!body.length) throw new Stop(`${CHANGELOG}: the section ## ${version} has no entry`);
  return `${body.join('\n')}\n`;
}

/**
 * The notes of the release of the tag: the section of the version when it has at most NOTES_LIMIT characters, otherwise
 * one line that links the section of CHANGELOG.md at the tag (the anchor of `## X.Y.Z` is X.Y.Z without its dots).
 */
export function releaseNotes(tag, version, section) {
  if ([...section].length <= NOTES_LIMIT) return section;
  const tagPath = tag.split('/').map(encodeURIComponent).join('/');
  return `The changes of ${version} are listed in [${CHANGELOG}](${REPOSITORY_URL}/blob/${tagPath}/${CHANGELOG}#${version.replaceAll('.', '')}).\n`;
}

/** Every manifest of the tag declares its version, and CHANGELOG.md has the section of the version: the version. */
export function versions(root, tag) {
  const [directory, version] = parseTag(tag);
  const problems = [];
  if (directory === null) {
    for (const name of Object.keys(MANIFESTS)) {
      const declared = manifestVersion(path.join(root, name));
      if (declared !== version) problems.push(`${name}: version ${declared ?? 'none'}, the tag ${tag} is ${version}`);
    }
  } else {
    const module = /^module\s+(\S+)\s*$/m.exec(readFileSync(path.join(root, directory, 'go.mod'), 'utf8'))?.[1] ?? null;
    if (module !== GO_MODULES[directory]) problems.push(`${directory}/go.mod: module ${module}, the tag ${tag} is ${GO_MODULES[directory]}`);
  }
  try {
    changelogSection(root, version);
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    problems.push(`${error.message} for the tag ${tag}`);
  }
  if (problems.length) throw new Stop(problems.join('; '));
  return version;
}

/** <package name>-<version>.<ext>: `@scope/name` is written `scope-name` and `vendor/name` `vendor-name`. */
export function assetName(name, version, extension) {
  return `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.${extension}`;
}

export function assetNames(tag) {
  const [directory, version] = parseTag(tag);
  if (directory !== null) return [];
  const extensions = { npm: 'tgz', composer: 'zip' };
  return PACKAGES.map(([kind, , name]) => assetName(name, version, extensions[kind]));
}

// The fields of a packed package.json whose dependencies a consumer installs.
export const NPM_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

/** The form of a dependency spec of a polyspec package that is not an exact version. */
function sourceForm(spec) {
  if (/^(?:file|link|workspace):/.test(spec)) return 'a path of the repository';
  if (/^(?:git(?:\+[a-z]+)?:|github:|ssh:|git@)/.test(spec) || /\.git(?:#|$)/.test(spec)) return 'a git source';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(spec)) return 'a URL';
  if (spec.startsWith('dev-') || spec.endsWith('@dev')) return 'a development version';
  if (EXACT_VERSION.test(spec)) return 'another version';
  return 'a range';
}

/**
 * The problems of a packed manifest of the tag. A consumer downloads the release assets and installs them together, so
 * a polyspec dependency is its name and an exact version: an npm package.json names every `@polyspec/*` dependency of
 * NPM_DEPENDENCY_FIELDS, and a composer.json every `polyspec/*` package of `require`, at an exact version, a package of
 * this repository at the version of the tag; a composer.json also declares the version of the tag, which an artifact
 * repository reads, and no `repositories`.
 */
export function manifestProblems(kind, manifest, tag) {
  const [, version] = parseTag(tag);
  const problems = [];
  const ours = new Set(PACKAGES.filter(([packageKind]) => packageKind === kind).map(([, , name]) => name));
  const exact = (where, name, spec) => {
    const expected = ours.has(name) ? version : null;
    if (expected === null ? !EXACT_VERSION.test(spec) : spec !== expected) {
      problems.push(`${where} ${name}: ${spec} is ${sourceForm(spec)}, not ${expected ?? 'an exact version'}`);
    }
  };
  if (kind === 'npm') {
    for (const field of NPM_DEPENDENCY_FIELDS) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) if (name.startsWith('@polyspec/')) exact(field, name, spec);
    }
  } else {
    if (manifest.version !== version) problems.push(`version: ${manifest.version ?? 'none'}, not ${version}`);
    if ('repositories' in manifest) problems.push(`repositories: ${JSON.stringify(manifest.repositories)}; a release zip declares none`);
    for (const [name, spec] of Object.entries(manifest.require ?? {})) if (name.startsWith('polyspec/')) exact('require', name, spec);
  }
  return problems;
}

/** The manifest packed in an archive: package/package.json of a tarball, composer.json of a zip. */
export function packedManifest(file) {
  const tarball = file.endsWith('.tgz');
  const text = tarball ? run('tar', ['-xzOf', file, 'package/package.json'], path.dirname(file)) : run('unzip', ['-p', file, 'composer.json'], path.dirname(file));
  return JSON.parse(text);
}

/**
 * Every archive of the tag in the directory carries the manifest of its package at the tagged commit unchanged, and that
 * manifest passes manifestProblems.
 */
export function checkAssets(root, commit, directory, tag) {
  const problems = [];
  const names = assetNames(tag);
  PACKAGES.forEach(([kind, directoryOfPackage], index) => {
    const manifest = kind === 'npm' ? 'package.json' : 'composer.json';
    const source = JSON.parse(run('git', ['show', `${commit}:${directoryOfPackage}/${manifest}`], root));
    const packed = packedManifest(path.join(directory, names[index]));
    if (JSON.stringify(packed) !== JSON.stringify(source)) {
      problems.push(`${names[index]}: the packed ${manifest} differs from ${directoryOfPackage}/${manifest}`);
    }
    for (const problem of manifestProblems(kind, packed, tag)) problems.push(`${names[index]}: ${problem}`);
  });
  if (problems.length) throw new Stop(`the release assets of ${tag} do not install outside the repository: ${problems.join('; ')}`);
}

/** The problems of the manifest of every package of PACKAGES in the tree, at the version of the root package.json. */
export function treeManifestProblems(root) {
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  return PACKAGES.flatMap(([kind, directory]) => {
    const manifest = `${directory}/${kind === 'npm' ? 'package.json' : 'composer.json'}`;
    return manifestProblems(kind, JSON.parse(readFileSync(path.join(root, manifest), 'utf8')), `v${version}`).map(problem => `${manifest}: ${problem}`);
  });
}

/**
 * Build the archive of every package of the tag into ASSETS and check with checkAssets that each installs outside the
 * repository: the names of the archives.
 */
export function assets(root, tag) {
  const [directory] = parseTag(tag);
  const target = path.join(root, ASSETS);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  if (directory !== null) return [];
  const commit = taggedCommit(root, tag);
  const names = assetNames(tag);
  // git archive of a tree writes the current time into a zip; the time of the tagged commit makes the zip reproducible.
  const time = run('git', ['show', '-s', '--format=%ct', commit], root).trim();
  PACKAGES.forEach(([kind, directoryOfPackage], index) => {
    const expected = path.join(target, names[index]);
    if (kind === 'npm') {
      run('npm', ['pack', '--pack-destination', target], path.join(root, directoryOfPackage));
    } else {
      run('git', ['archive', '--format=zip', `--mtime=@${time}`, `--output=${expected}`, `${commit}:${directoryOfPackage}`], root);
    }
  });
  const present = readdirSync(target).sort();
  if (JSON.stringify(present) !== JSON.stringify([...names].sort())) {
    throw new Stop(`${ASSETS} holds [${present.join(', ')}], not the archives [${[...names].sort().join(', ')}]`);
  }
  checkAssets(root, commit, target, tag);
  return names;
}

/** Create the GitHub Release of the tag with the notes of releaseNotes and the archives of assets. */
export function publish(root, tag) {
  const [, version] = parseTag(tag);
  const notes = releaseNotes(tag, version, changelogSection(root, version));
  const names = assetNames(tag);
  const target = path.join(root, ASSETS);
  const missing = names.filter(name => !existsSync(path.join(target, name)));
  if (missing.length) throw new Stop(`${ASSETS} lacks [${missing.join(', ')}]; make release-assets builds them`);
  const folder = mkdtempSync(path.join(tmpdir(), 'template-release-notes-'));
  try {
    const notesFile = path.join(folder, 'notes.md');
    writeFileSync(notesFile, notes);
    run('gh', ['release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', notesFile, ...names.map(name => path.join(target, name))], root);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  return names;
}

export function main(argv, root = ROOT, environment = process.env) {
  const [mode, tag] = argv;
  if (argv.length !== 2 || !['verify', 'versions', 'assets', 'publish'].includes(mode) || !tag) {
    console.error('usage: node scripts/release.mjs verify|versions|assets|publish TAG');
    return 2;
  }
  try {
    if (mode === 'verify') {
      const [commit, checks] = verify(root, tag, environment.GITHUB_REPOSITORY);
      console.log(`[release] ${tag}: the commit ${commit} is on ${MAIN} and passed ${checks.join(', ')}`);
    } else if (mode === 'versions') {
      const version = versions(root, tag);
      const [directory] = parseTag(tag);
      const covered = directory === null ? 'every manifest of the tag declares' : `${directory}/go.mod declares its module path, the version is`;
      console.log(`[release] ${tag}: ${covered} ${version} and ${CHANGELOG} has ## ${version}`);
    } else if (mode === 'assets') {
      const names = assets(root, tag);
      console.log(`[release] ${tag}: built ${names.length ? names.join(', ') : 'no archive (a Go module)'} in ${ASSETS}`);
    } else {
      const names = publish(root, tag);
      console.log(`[release] ${tag}: created the GitHub Release with ${names.length ? names.join(', ') : 'no archive'}`);
    }
  } catch (error) {
    if (!(error instanceof Stop) && !(error instanceof SyntaxError) && error?.code !== 'ENOENT') throw error;
    console.error(`[release] ${mode} ${tag} failed: ${error.message}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
