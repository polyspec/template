// Tests that no check passes by skipping what it should verify (T19.4): a run of zero tests fails (the cases of
// tests/scripts/run-tests.test.mjs), the conformance runners run every language unless an option names the languages
// and fail on an absent package, no recipe of the Makefile skips its command when a directory or file is absent, and no
// test of the packages skips itself on a missing build.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the conformance runners select every language when no option names them, also when a package is absent', async (t) => {
  // A copy of the drivers in a directory without packages: the drivers selected only the languages whose package
  // directory existed, so a missing package dropped its language without a message.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-drivers-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of ['tests/runner/drivers.mjs', 'scripts/publish-build.mjs', 'scripts/test-progress/step.mjs']) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  const { drivers, prepare, selectLanguages } = await import(pathToFileURL(path.join(directory, 'tests/runner/drivers.mjs')).href);
  assert.deepEqual(selectLanguages(undefined), Object.keys(drivers));
  assert.deepEqual(selectLanguages('go,php'), ['go', 'php']);
  assert.throws(() => prepare('go'), /go: package directory is absent/);
});

test('no recipe of the Makefile skips its command when a directory or a file is absent', () => {
  const skips = readFileSync(path.join(ROOT, 'Makefile'), 'utf8').split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /^\t/.test(line) && /\btest ! -[defs] [^|]*\|\||\[ ! -[defs] [^\]]*\] *\|\||\[ -[defs] [^\]]*\] *&&|\btest -[defs] [^&]*&&/.test(line));
  assert.deepEqual(skips.map(({ line, number }) => `Makefile:${number}: ${line.trim()}`), []);
});

test('no test of the packages skips itself', () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(test\.(ts|mjs)|spec\.ts)$/.test(entry.name)) files.push(file);
    }
  };
  for (const name of readdirSync(path.join(ROOT, 'packages'))) {
    const tests = path.join(ROOT, 'packages', name, 'tests');
    try { walk(tests); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const skipping = files.filter(file => /\b(?:describe|it|test)\.(?:skip|skipIf|runIf|todo)\b/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(skipping.map(file => path.relative(ROOT, file)), []);
});
