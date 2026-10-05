// Tests the build of the TypeScript package (scripts/build-ts.mjs, T18.8): a build publishes into an existing `dist`
// file by file, so that a reader that polls `dist` during the build always finds every exported file and every module
// that an entry imports; two builds of the same inputs write the same files; a build whose inputs are unchanged does
// not build. Each case builds into a `dist` of its own temporary directory, never into the `dist` of the package.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.join(ROOT, 'scripts/build-ts.mjs');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/template-ts/package.json'), 'utf8'));
// The files of `dist` that the exports of the package name.
const EXPORTED = Object.values(manifest.exports).flatMap(entry => Object.values(entry)).map(file => file.replace(/^\.\/dist\//, ''));

// The files that a reader of `dist` needs: the exported files and the relative modules that the exported ES modules import.
function needed(dist) {
  const files = new Set(EXPORTED);
  for (const file of EXPORTED.filter(name => name.endsWith('.mjs'))) {
    let text;
    try {
      text = readFileSync(path.join(dist, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/(?:from|import)\s*["']\.\/([^"']+)["']/g)) files.add(match[1]);
  }
  return files;
}

// The names and contents of the files of `dist`.
function snapshot(dist) {
  return Object.fromEntries(readdirSync(dist).sort().map(name => [name, readFileSync(path.join(dist, name), 'utf8')]));
}

function build(dist, ...options) {
  return spawnSync(process.execPath, [BUILD, '--dist', dist, ...options], { cwd: ROOT, encoding: 'utf8' });
}

// Runs a build while a reader polls `dist`; returns the build result and every file that the reader found missing.
function buildWhilePolling(dist, ...options) {
  return new Promise((resolve, reject) => {
    const missing = new Set();
    let polls = 0;
    const poll = setInterval(() => {
      polls += 1;
      for (const file of needed(dist)) if (!existsSync(path.join(dist, file))) missing.add(file);
    }, 2);
    const child = spawn(process.execPath, [BUILD, '--dist', dist, ...options], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const directory = mkdtempSync(path.join(tmpdir(), 'template-build-ts-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'dist');
}

test('a reader of dist never misses a file during a build, and the same inputs give the same files', async (t) => {
  const dist = temporary(t);
  const first = build(dist, '--force');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const before = snapshot(dist);
  for (const file of EXPORTED) assert.ok(file in before, `${file} is built`);
  const second = await buildWhilePolling(dist, '--force');
  assert.equal(second.status, 0, second.output);
  t.diagnostic(`the reader polled dist ${second.polls} times during the build`);
  assert.ok(second.polls > 10, `the reader polled ${second.polls} times`);
  assert.deepEqual(second.missing, [], `the reader found files missing during the build:\n${second.output}`);
  assert.deepEqual(snapshot(dist), before);
  assert.equal(existsSync(`${dist}.next-${process.pid}`), false);
});

test('a build whose inputs are unchanged does not build', (t) => {
  const dist = temporary(t);
  const first = build(dist);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const built = statSync(path.join(dist, 'index.mjs')).mtimeMs;
  const second = build(dist);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, /^build-ts: .+ is current for inputs [0-9a-f]{12}; no build$/m);
  assert.equal(statSync(path.join(dist, 'index.mjs')).mtimeMs, built);
});
