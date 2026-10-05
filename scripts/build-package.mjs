#!/usr/bin/env node
// Builds a JavaScript package of packages/ and publishes its build into its `dist` (T18.8, T18.8-1). Other checkouts
// and the next targets of a run read that `dist` while it is built, so a reader must never find a file of it
// missing, and one run must not build the same inputs again:
//
// - The build runs only when its inputs change: the hash of the sources and the configuration of the package, its
//   manifest, the root package-lock.json (which fixes every tool and dependency), the installed copies of the packages
//   of this repository that it depends on, and the version of Node.js is recorded in `<dist>.inputs.json` with the files of
//   the build; a build with the same hash and every recorded file in `dist` prints that `dist` is current.
// - The build writes into `<dist>.next-<pid>` next to `dist`. Each file then moves into `dist` with rename(2), which
//   replaces a path in one step on the same file system: a reader finds the previous or the new file, never none. A
//   file moves after the relative modules it imports, so the modules that the entries import move first and the
//   entries last; then the files of the previous build that the new build does not have are removed.
//
// Limit: a reader that reads several files while a build of changed sources publishes can combine files of the two
// builds, for example an entry of the previous build whose chunk the new build removed. Two builds of the same inputs
// write the same files, so a rebuild of unchanged inputs gives a reader the same contents.
//
// With --install, the npm copy of the package in node_modules is installed again when its files differ from the
// package, as the build targets of the Makefile need it.
//
// Usage: node scripts/build-package.mjs --package <template-ts|template-language|template-lsp|template-codemirror|
//        template-vscode> [--dist <directory>] [--force] [--install] [--print-inputs]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSUP = (next) => [process.execPath, [join(root, 'node_modules/tsup/dist/cli-default.js'), '--out-dir', next]];
const ESBUILD = join(root, 'node_modules/esbuild/bin/esbuild');
// The build command of each package, writing into `next`, run in the directory of the package.
const BUILDS = {
  'template-ts': TSUP,
  'template-language': TSUP,
  'template-lsp': TSUP,
  'template-codemirror': TSUP,
  'template-vscode': next => [process.execPath, [join(root, 'scripts/build-package.mjs'), '--esbuild-vscode', next]],
};
// The sources and configuration of a package that its build reads, besides src/.
const CONFIGURATION = ['tsup.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.node.json'];

const { values } = parseArgs({
  options: {
    package: { type: 'string' }, dist: { type: 'string' }, force: { type: 'boolean' }, install: { type: 'boolean' },
    'print-inputs': { type: 'boolean' }, 'esbuild-vscode': { type: 'string' },
  },
});

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

// The two bundles of the VS Code extension: the extension and the language server it starts.
if (values['esbuild-vscode']) {
  const next = values['esbuild-vscode'];
  const common = ['--bundle', '--platform=node', '--format=cjs', '--target=node24'];
  run(ESBUILD, ['src/extension.ts', ...common, '--external:vscode', `--outfile=${join(next, 'extension.cjs')}`], { cwd: join(root, 'packages/template-vscode') });
  run(ESBUILD, ['@polyspec/template-lsp/server', ...common, `--outfile=${join(next, 'server.cjs')}`], { cwd: join(root, 'packages/template-vscode') });
  process.exit(0);
}

if (!values.package || !(values.package in BUILDS)) {
  console.error(`build-package: unknown package ${values.package ?? '(none)'}; --package is one of ${Object.keys(BUILDS).join(', ')}`);
  process.exit(2);
}
const pkg = join(root, 'packages', values.package);
const dist = resolve(values.dist ?? join(pkg, 'dist'));
const stamp = `${dist}.inputs.json`;
const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

// The installed copies of the packages of this repository that a manifest depends on, with theirs.
function installedPackages(dependencies, seen = new Set()) {
  for (const name of Object.keys(dependencies ?? {}).filter(dependency => dependency.startsWith('@polyspec/'))) {
    if (seen.has(name)) continue;
    const copy = join(root, 'node_modules', name);
    if (!existsSync(join(copy, 'package.json'))) throw new Error(`${relative(root, copy)} is not installed; ${values.package} depends on ${name}`);
    seen.add(name);
    installedPackages(JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8')).dependencies, seen);
  }
  return [...seen].sort();
}

// The input files of the build, sorted.
function inputFiles() {
  const own = [...files(join(pkg, 'src')), ...CONFIGURATION.map(name => join(pkg, name)).filter(existsSync)];
  const installed = installedPackages(manifest.dependencies).flatMap(name => {
    const copy = join(root, 'node_modules', name);
    return [join(copy, 'package.json'), ...(existsSync(join(copy, 'dist')) ? files(join(copy, 'dist')) : [])];
  });
  return [...own, join(root, 'package-lock.json'), ...installed].map(file => relative(root, file)).sort();
}

function inputs(list) {
  const hash = createHash('sha256');
  for (const file of list) hash.update(`${file}\0`).update(readFileSync(join(root, file))).update('\0');
  hash.update(process.version);
  return hash.digest('hex');
}

// The files in the order of publication: a file after the relative modules it imports.
function publicationOrder(directory, names) {
  const present = new Set(names);
  const imports = name => {
    if (!/\.(mjs|cjs|js|ts)$/.test(name)) return [];
    const text = readFileSync(join(directory, name), 'utf8');
    return [...text.matchAll(/(?:from|import|require)\s*\(?\s*["']\.\/([^"']+)["']/g)]
      .flatMap(match => [match[1], match[1].replace(/\.js$/, '.d.ts')])
      .filter(target => present.has(target) && target !== name);
  };
  const order = [];
  const state = new Map();
  const visit = name => {
    if (state.get(name)) return;
    state.set(name, 'visiting');
    for (const target of imports(name)) visit(target);
    order.push(name);
    state.set(name, 'done');
  };
  for (const name of [...names].sort()) visit(name);
  // A source map follows the file it maps.
  return [...order.filter(name => name.endsWith('.map')), ...order.filter(name => !name.endsWith('.map'))];
}

function build(hash) {
  const next = `${dist}.next-${process.pid}`;
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next, { recursive: true });
  console.log(`build-package: building ${values.package} into ${next}`);
  const [command, args] = BUILDS[values.package](next);
  run(command, args, { cwd: pkg });
  const built = readdirSync(next, { withFileTypes: true });
  const directory = built.find(entry => !entry.isFile());
  if (directory) throw new Error(`${join(next, directory.name)}: the build wrote a directory; build-package publishes files only`);
  const names = publicationOrder(next, built.map(entry => entry.name));
  if (names.length === 0) throw new Error(`${next}: the build wrote no file`);
  mkdirSync(dist, { recursive: true });
  for (const name of names) renameSync(join(next, name), join(dist, name));
  const published = new Set(names);
  // Without a record of the previous build, every other file of `dist` belongs to it.
  const previous = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')).files : readdirSync(dist);
  const stale = previous.filter(name => !published.has(name) && existsSync(join(dist, name)));
  for (const name of stale) unlinkSync(join(dist, name));
  rmSync(next, { recursive: true });
  writeFileSync(`${stamp}.${process.pid}`, `${JSON.stringify({ hash, files: [...names].sort() })}\n`);
  renameSync(`${stamp}.${process.pid}`, stamp);
  console.log(`build-package: published ${names.length} files into ${dist}${stale.length ? `; removed ${stale.length} files of the previous build: ${stale.join(' ')}` : ''}`);
}

// The files of the package that npm installs: package.json and the paths of `files`.
function packedFiles() {
  const listed = manifest.files ?? [];
  return ['package.json', ...listed.flatMap(entry => {
    const path = join(pkg, entry);
    if (!existsSync(path)) return [];
    return statSync(path).isDirectory() ? files(path).map(file => relative(pkg, file)) : [entry];
  })];
}

// Installs the npm copy of the package again when a file of it differs from the package.
function install() {
  const copy = join(root, 'node_modules', manifest.name);
  const packed = packedFiles();
  const differs = packed.some(file => !existsSync(join(copy, file)) || !readFileSync(join(copy, file)).equals(readFileSync(join(pkg, file))))
    || (existsSync(join(copy, 'dist')) && files(join(copy, 'dist')).some(file => !packed.includes(relative(copy, file))));
  if (!differs) {
    console.log(`build-package: ${relative(root, copy)} holds the files of the package; no install`);
    return;
  }
  console.log(`build-package: installing ${relative(root, copy)} again`);
  rmSync(copy, { recursive: true, force: true });
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: root });
}

const list = inputFiles();
if (values['print-inputs']) {
  console.log(list.join('\n'));
  process.exit(0);
}
const hash = inputs(list);
const recorded = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')) : null;
const complete = recorded !== null && recorded.files.every(name => existsSync(join(dist, name)));
const where = relative(root, dist).startsWith('..') ? dist : relative(root, dist);
if (!values.force && complete && recorded.hash === hash) {
  console.log(`build-package: ${where} is current for inputs ${hash.slice(0, 12)}; no build`);
} else {
  console.log(`build-package: ${values.package}: ${values.force ? 'forced build' : !recorded ? 'no recorded inputs' : !complete ? 'dist is incomplete' : `inputs changed from ${recorded.hash.slice(0, 12)} to ${hash.slice(0, 12)}`}`);
  build(hash);
}
if (values.install) install();
