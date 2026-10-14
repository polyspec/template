#!/usr/bin/env node
// Builds a JavaScript package of packages/ and publishes its build into its `dist` (T18.8, T18.8-1). Other checkouts
// and the next targets of a run read that `dist` while it is built, so a reader must never find a file of it
// missing, and one run must not build the same inputs again:
//
// - The build runs only when its inputs change: the hash of the sources and the configuration of the package, its
//   manifest, the root package-lock.json (which fixes every tool and dependency), the builds of the workspace packages
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
// Usage: node scripts/build-package.mjs --package <template-ts|template-language|template-lsp|template-codemirror|
//        template-vscode> [--dist <directory>] [--force] [--print-inputs]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareText } from './compare-text.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(root, 'node_modules/.bin/esbuild');
// tsup bundles the modules; the TypeScript compiler writes the declarations of each project next to them, since the
// declaration build of tsup calls the JavaScript API of the compiler, which TypeScript 7 does not have.
const typescript = projects => next => [
  [join(root, 'node_modules/.bin/tsup'), ['--out-dir', next]],
  ...projects.map(project => [join(root, 'node_modules/.bin/tsc'), ['-p', project, '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--rootDir', 'src', '--outDir', next]]),
];
// The build commands of each package, writing into `next`, run in order in the directory of the package.
const BUILDS = {
  'template-ts': typescript(['tsconfig.json', 'tsconfig.node.json']),
  'template-language': typescript(['tsconfig.build.json']),
  'template-lsp': typescript(['tsconfig.build.json']),
  'template-codemirror': typescript(['tsconfig.build.json']),
  'template-vscode': next => [[process.execPath, [join(root, 'scripts/build-package.mjs'), '--esbuild-vscode', next]]],
};
// The sources and configuration of a package that its build reads, besides src/.
const CONFIGURATION = ['tsup.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.build.json'];

const { values } = parseArgs({
  options: {
    package: { type: 'string' }, dist: { type: 'string' }, force: { type: 'boolean' },
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

// The directories of the workspace packages of this repository that a manifest depends on, with theirs: npm links each
// into node_modules, and the link resolves to its directory under packages/.
function workspacePackages(dependencies, seen = new Map()) {
  for (const name of Object.keys(dependencies ?? {}).filter(dependency => dependency.startsWith('@polyspec/'))) {
    if (seen.has(name)) continue;
    const link = join(root, 'node_modules', name);
    if (!existsSync(join(link, 'package.json'))) throw new Error(`${relative(root, link)} is not installed; ${values.package} depends on ${name}; run make install-packages`);
    const directory = realpathSync(link);
    seen.set(name, directory);
    workspacePackages(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).dependencies, seen);
  }
  return [...seen.values()].sort(compareText);
}

// The input files of the build, sorted.
function inputFiles() {
  const own = [...files(join(pkg, 'src')), ...CONFIGURATION.map(name => join(pkg, name)).filter(existsSync)];
  const dependencies = workspacePackages(manifest.dependencies).flatMap(directory => [join(directory, 'package.json'), ...(existsSync(join(directory, 'dist')) ? files(join(directory, 'dist')) : [])]);
  return [...own, join(root, 'package-lock.json'), ...dependencies].map(file => relative(root, file)).sort();
}

function inputs(list) {
  const hash = createHash('sha256');
  for (const file of list) hash.update(`${file}\0`).update(readFileSync(join(root, file))).update('\0');
  hash.update(process.version);
  return hash.digest('hex');
}

// The files, as paths relative to `directory`, in the order of publication: a file after the relative modules it imports.
function publicationOrder(directory, names) {
  const present = new Set(names);
  const imports = name => {
    if (!/\.(mjs|cjs|js|ts)$/.test(name)) return [];
    const text = readFileSync(join(directory, name), 'utf8');
    return [...text.matchAll(/(?:from|import|require)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g)]
      .map(match => posix.join(posix.dirname(name), match[1]))
      .flatMap(target => [target, target.replace(/\.js$/, '.d.ts')])
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
  for (const name of [...names].sort(compareText)) visit(name);
  // A source map follows the file it maps.
  return [...order.filter(name => name.endsWith('.map')), ...order.filter(name => !name.endsWith('.map'))];
}

function build(hash) {
  const next = `${dist}.next-${process.pid}`;
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next, { recursive: true });
  console.log(`build-package: building ${values.package} into ${next}`);
  for (const [command, args] of BUILDS[values.package](next)) run(command, args, { cwd: pkg });
  const names = publicationOrder(next, files(next).map(file => relative(next, file).split(sep).join('/')));
  if (names.length === 0) throw new Error(`${next}: the build wrote no file`);
  for (const name of names) {
    mkdirSync(dirname(join(dist, name)), { recursive: true });
    renameSync(join(next, name), join(dist, name));
  }
  const published = new Set(names);
  // Without a record of the previous build, every other file of `dist` belongs to it.
  const previous = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')).files : files(dist).map(file => relative(dist, file).split(sep).join('/'));
  const stale = previous.filter(name => !published.has(name) && existsSync(join(dist, name)));
  for (const name of stale) unlinkSync(join(dist, name));
  rmSync(next, { recursive: true });
  writeFileSync(`${stamp}.${process.pid}`, `${JSON.stringify({ hash, files: [...names].sort(compareText) })}\n`);
  renameSync(`${stamp}.${process.pid}`, stamp);
  console.log(`build-package: published ${names.length} files into ${dist}${stale.length ? `; removed ${stale.length} files of the previous build: ${stale.join(' ')}` : ''}`);
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
