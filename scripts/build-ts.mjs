#!/usr/bin/env node
// Builds the TypeScript package packages/template-ts and publishes its build into `dist` (T18.8). Other checkouts and
// repositories read that `dist` while a build may run, so a reader must never find a file of it missing:
//
// - The build runs only when its inputs change: the hash of the sources, the build configuration, the package
//   manifest, the versions of the build tools and of Node.js is recorded in `<dist>.inputs`, and a build with the
//   same hash and a complete `dist` prints that `dist` is current and builds nothing.
// - tsup builds into `<dist>.next-<pid>` next to `dist` (its `clean: true` empties only that directory). Each file
//   then moves into `dist` with rename(2), which replaces a path in one step on the same file system: a reader finds
//   the previous or the new file, never none. The modules that the entries import move first and the entries
//   (index, render, node) last; then the files of the previous build that the new build does not have are removed.
//
// Limit: a reader that reads several files while a build of changed sources publishes can combine files of the two
// builds, for example an entry of the previous build whose chunk the new build removed. Two builds of the same inputs
// write the same files, so a rebuild of unchanged inputs gives a reader the same contents.
//
// With --install, the npm copy of the package in node_modules is installed again when its files differ from the
// package, as `make build-ts` needs it.
//
// Usage: node scripts/build-ts.mjs [--dist <directory>] [--force] [--install]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'packages/template-ts');
const { values } = parseArgs({ options: { dist: { type: 'string' }, force: { type: 'boolean' }, install: { type: 'boolean' } } });
const dist = resolve(values.dist ?? join(pkg, 'dist'));
const stamp = `${dist}.inputs`;
const ENTRIES = new Set(['index', 'render', 'node']);
const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
const exported = Object.values(manifest.exports).flatMap(entry => Object.values(entry)).map(file => file.replace(/^\.\/dist\//, ''));

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

// The hash of everything that decides the output of the build.
function inputs() {
  const hash = createHash('sha256');
  const sources = [...files(join(pkg, 'src')), ...['tsup.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.node.json'].map(name => join(pkg, name))];
  for (const file of sources.sort()) hash.update(`${relative(root, file)}\0`).update(readFileSync(file)).update('\0');
  for (const tool of ['tsup', 'typescript', 'esbuild']) {
    hash.update(`${tool}@${JSON.parse(readFileSync(join(root, 'node_modules', tool, 'package.json'), 'utf8')).version}\0`);
  }
  hash.update(process.version);
  return hash.digest('hex');
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

function build(hash) {
  const next = `${dist}.next-${process.pid}`;
  rmSync(next, { recursive: true, force: true });
  console.log(`build-ts: building into ${next}`);
  run(process.execPath, [join(root, 'node_modules/tsup/dist/cli-default.js'), '--out-dir', next], { cwd: pkg });
  const built = readdirSync(next, { withFileTypes: true });
  const directory = built.find(entry => !entry.isFile());
  if (directory) throw new Error(`${join(next, directory.name)}: the build wrote a directory; build-ts publishes files only`);
  const isEntry = name => ENTRIES.has(name.split('.')[0]);
  const names = built.map(entry => entry.name).sort((a, b) => Number(isEntry(a)) - Number(isEntry(b)) || a.localeCompare(b));
  for (const file of exported) if (!names.includes(file)) throw new Error(`${join(next, file)}: the build did not write an exported file`);
  mkdirSync(dist, { recursive: true });
  for (const name of names) renameSync(join(next, name), join(dist, name));
  const published = new Set(names);
  const stale = readdirSync(dist).filter(name => !published.has(name));
  for (const name of stale) unlinkSync(join(dist, name));
  rmSync(next, { recursive: true });
  writeFileSync(`${stamp}.${process.pid}`, `${hash}\n`);
  renameSync(`${stamp}.${process.pid}`, stamp);
  console.log(`build-ts: published ${names.length} files into ${dist}${stale.length ? `; removed ${stale.length} files of the previous build: ${stale.join(' ')}` : ''}`);
}

// Installs the npm copy of the package again when a file of it differs from the package.
function install() {
  const copy = join(root, 'node_modules/@polyspec/template');
  const packed = ['package.json', ...files(join(pkg, 'bin')).map(file => relative(pkg, file)), ...readdirSync(dist).map(name => `dist/${name}`)];
  const installedDist = join(copy, 'dist');
  const extra = existsSync(installedDist) ? readdirSync(installedDist).filter(name => !existsSync(join(dist, name))) : [];
  const differs = extra.length > 0 || packed.some(file => !existsSync(join(copy, file)) || !readFileSync(join(copy, file)).equals(readFileSync(join(pkg, file))));
  if (!differs) {
    console.log(`build-ts: ${relative(root, copy)} holds the files of the package; no install`);
    return;
  }
  console.log(`build-ts: installing ${relative(root, copy)} again`);
  rmSync(copy, { recursive: true, force: true });
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: root });
}

const hash = inputs();
const complete = exported.every(file => existsSync(join(dist, file)) && statSync(join(dist, file)).isFile());
const recorded = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
if (!values.force && complete && recorded === hash) {
  console.log(`build-ts: ${relative(root, dist) || dist} is current for inputs ${hash.slice(0, 12)}; no build`);
} else {
  console.log(`build-ts: ${values.force ? 'forced build' : recorded ? `inputs changed from ${recorded.slice(0, 12)} to ${hash.slice(0, 12)}` : complete ? 'no recorded inputs' : 'dist is incomplete'}`);
  build(hash);
}
if (values.install) install();
