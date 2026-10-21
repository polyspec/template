// Tests the build of the JavaScript packages (scripts/build-package.mts, T18.8 and T18.8-1): for each package, a
// build publishes into an existing `dist` file by file, so that a reader that polls `dist` during the build always
// finds every file of the previous build and every module that a file imports; two builds of the same inputs write
// the same files; a build whose inputs are unchanged does not build; and the inputs of a package include the builds of
// the workspace packages of this repository that it depends on, which npm links into node_modules (T24.2). Each case
// builds into a `dist` of its own temporary directory, never into the `dist` of the package. The test creates what it
// depends on (T18.8-2): before the cases it builds the packages of this repository that the packages depend on with
// scripts/build-package.mts, as `make template-build-lsp` does, so it passes on a checkout where nothing was built; with unchanged
// inputs those builds do nothing.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { before, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareText } from '../../scripts/compare-text.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.join(ROOT, 'scripts/build-package.mts');
const PACKAGES = ['ts', 'language', 'lsp', 'codemirror', 'vscode'];
// The packages of this repository that the packages depend on, in the order of their dependencies.
const PREREQUISITES = ['ts', 'language', 'lsp'];

before(() => {
  for (const name of PREREQUISITES) {
    const result = spawnSync(process.execPath, [BUILD, '--package', name], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, `the prerequisite build of ${name} failed:\n${result.stdout}${result.stderr}`);
  }
});

// The files of `dist` and its subdirectories, as sorted paths relative to `dist` with `/`.
function filesOf(dist: string) {
  return readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter(name => statSync(path.join(dist, name)).isFile()).map(name => name.split(path.sep).join('/')).sort(compareText);
}

// The names and contents of the files of `dist`.
function snapshot(dist: string) {
  return Object.fromEntries(filesOf(dist).map(name => [name, readFileSync(path.join(dist, name), 'utf8')]));
}

// The files that a reader of `dist` needs: the files of the previous build and the relative modules they import.
function needed(dist: string, files: string[]) {
  const result = new Set<string>(files);
  for (const file of files.filter(name => /\.(mjs|cjs|js|ts)$/.test(name))) {
    let text;
    try {
      text = readFileSync(path.join(dist, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/(?:from|import|require)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === undefined) throw new Error(`${file}: the import names no relative module: ${match[0]}`);
      const target = path.posix.join(path.posix.dirname(file), specifier);
      result.add(file.endsWith('.d.ts') ? target.replace(/\.js$/, '.d.ts') : target);
    }
  }
  return result;
}

function build(name: string, dist: string, ...options: string[]) {
  return spawnSync(process.execPath, [BUILD, '--package', name, '--dist', dist, ...options], { cwd: ROOT, encoding: 'utf8' });
}

// Runs a build while a reader polls `dist`; returns the build result and every file that the reader found missing.
interface PollingBuild {
  status: number | null;
  output: string;
  missing: string[];
  polls: number;
}

function buildWhilePolling(name: string, dist: string, files: string[], ...options: string[]) {
  return new Promise<PollingBuild>((resolve, reject) => {
    const missing = new Set<string>();
    let polls = 0;
    const poll = setInterval(() => {
      polls += 1;
      for (const file of needed(dist, files)) if (!existsSync(path.join(dist, file))) missing.add(file);
    }, 2);
    const child = spawn(process.execPath, [BUILD, '--package', name, '--dist', dist, ...options], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', status => {
      clearInterval(poll);
      resolve({ status, output, missing: [...missing].sort(compareText), polls });
    });
  });
}

function temporary(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-build-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'dist');
}

// The limits of the build tests protect against a hang: a build, a reader or an install that never ends. A limit is
// 100 times the expected time of its test, and a slow pass on a loaded machine is a pass; the limits do not judge speed.
// The ts reader has an expected time of 33 s, the mean of three runs alone on a loaded machine (28.6 s, 32.3 s,
// 37.9 s). The other limits are 100 times the elapsed time of their test in one run of tests/scripts under load (about
// 60). vscode keeps the runner default, which is 24 times its measured time.
const LIMITS_MS: Record<string, { reader: number; unchanged: number }> = {
  'ts': { reader: 3_300_000, unchanged: 1_160_000 },
  'language': { reader: 1_670_000, unchanged: 650_000 },
  'lsp': { reader: 600_000, unchanged: 340_000 },
  'codemirror': { reader: 1_110_000, unchanged: 1_110_000 },
};

for (const name of PACKAGES) {
  test(`${name}: a reader of dist never misses a file during a build, and the same inputs give the same files`, { timeout: LIMITS_MS[name]?.reader }, async (t) => {
    const dist = temporary(t);
    const first = build(name, dist, '--force');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const before = snapshot(dist);
    const second = await buildWhilePolling(name, dist, Object.keys(before), '--force');
    assert.equal(second.status, 0, second.output);
    t.diagnostic(`the reader polled dist ${second.polls} times during the build`);
    assert.ok(second.polls > 10, `the reader polled ${second.polls} times`);
    assert.deepEqual(second.missing, [], `the reader found files missing during the build:\n${second.output}`);
    assert.deepEqual(snapshot(dist), before);
    assert.equal(readdirSync(path.dirname(dist)).filter(entry => entry.includes('.next-')).length, 0);
  });

  test(`${name}: a build whose inputs are unchanged does not build`, { timeout: LIMITS_MS[name]?.unchanged }, (t) => {
    const dist = temporary(t);
    const first = build(name, dist);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const file = filesOf(dist).find(entry => !entry.endsWith('.map'));
    assert.ok(file !== undefined, `the build of ${name} wrote no file other than source maps`);
    const built = statSync(path.join(dist, file)).mtimeMs;
    const second = build(name, dist);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /^\[build-package\] .+ is current for inputs [0-9a-f]{12}; no build$/m);
    assert.equal(statSync(path.join(dist, file)).mtimeMs, built);
  });
}

test('the inputs of a package include the builds of the workspace packages that it depends on', () => {
  const result = spawnSync(process.execPath, [BUILD, '--package', 'vscode', '--print-inputs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const inputs = result.stdout.split('\n');
  for (const file of ['packages/vscode/src/extension.ts', 'package-lock.json', 'packages/lsp/dist/main.mjs', 'packages/language/dist/index.mjs', 'packages/ts/dist/index.mjs']) {
    assert.ok(inputs.includes(file), `the inputs of vscode do not include ${file}`);
  }
});

test('an unknown package fails with its name', () => {
  const result = spawnSync(process.execPath, [BUILD, '--package', 'template-unknown'], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /template-unknown/);
});
