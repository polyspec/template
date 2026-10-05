// Tests the build of the JavaScript packages (scripts/build-package.mjs, T18.8 and T18.8-1): for each package, a
// build publishes into an existing `dist` file by file, so that a reader that polls `dist` during the build always
// finds every file of the previous build and every module that a file imports; two builds of the same inputs write
// the same files; a build whose inputs are unchanged does not build; and the inputs of a package include the installed
// packages of this repository that it depends on. Each case builds into a `dist` of its own temporary directory, never
// into the `dist` of the package. The installed copies that a package depends on must exist (`make test-scripts`
// builds them first).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.join(ROOT, 'scripts/build-package.mjs');
const PACKAGES = ['template-ts', 'template-language', 'template-lsp', 'template-codemirror', 'template-vscode'];

// The names and contents of the files of `dist`.
function snapshot(dist) {
  return Object.fromEntries(readdirSync(dist).sort().map(name => [name, readFileSync(path.join(dist, name), 'utf8')]));
}

// The files that a reader of `dist` needs: the files of the previous build and the relative modules they import.
function needed(dist, files) {
  const result = new Set(files);
  for (const file of files.filter(name => /\.(mjs|cjs|js)$/.test(name))) {
    let text;
    try {
      text = readFileSync(path.join(dist, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/(?:from|import|require)\s*\(?\s*["']\.\/([^"']+)["']/g)) result.add(match[1]);
  }
  return result;
}

function build(name, dist, ...options) {
  return spawnSync(process.execPath, [BUILD, '--package', name, '--dist', dist, ...options], { cwd: ROOT, encoding: 'utf8' });
}

// Runs a build while a reader polls `dist`; returns the build result and every file that the reader found missing.
function buildWhilePolling(name, dist, files, ...options) {
  return new Promise((resolve, reject) => {
    const missing = new Set();
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
      resolve({ status, output, missing: [...missing].sort(), polls });
    });
  });
}

function temporary(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-build-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'dist');
}

for (const name of PACKAGES) {
  test(`${name}: a reader of dist never misses a file during a build, and the same inputs give the same files`, async (t) => {
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

  test(`${name}: a build whose inputs are unchanged does not build`, (t) => {
    const dist = temporary(t);
    const first = build(name, dist);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const file = readdirSync(dist).find(entry => !entry.endsWith('.map'));
    const built = statSync(path.join(dist, file)).mtimeMs;
    const second = build(name, dist);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /^build-package: .+ is current for inputs [0-9a-f]{12}; no build$/m);
    assert.equal(statSync(path.join(dist, file)).mtimeMs, built);
  });
}

test('the inputs of a package include the installed packages of this repository that it depends on', () => {
  const result = spawnSync(process.execPath, [BUILD, '--package', 'template-vscode', '--print-inputs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const inputs = result.stdout.split('\n');
  for (const file of ['packages/template-vscode/src/extension.ts', 'package-lock.json', 'node_modules/@polyspec/template-lsp/dist/main.mjs', 'node_modules/@polyspec/template-language/dist/index.mjs', 'node_modules/@polyspec/template/dist/index.mjs']) {
    assert.ok(inputs.includes(file), `the inputs of template-vscode do not include ${file}`);
  }
});

test('an unknown package fails with its name', () => {
  const result = spawnSync(process.execPath, [BUILD, '--package', 'template-unknown'], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /template-unknown/);
});
