// Tests that the commands that publish a file or a directory that others read replace it at once and keep the
// previous version when they fail (T19.7): a reader never finds it missing or half written.
// - `make showcase` and `make bench` write examples/site/data/mode-benchmark.json with `benchmark-modes.mjs --output`,
//   which writes a temporary file and renames it, instead of a shell redirection that empties the file first;
// - `make docs-verify-idempotent` keeps the copy of its first build in a directory of its own run outside the
//   checkout, not in the fixed docs/.vitepress/dist.first that two runs shared;
// - scripts/install-cli.mjs prepares the new install in <prefix>/lib/.polyspec-template-fmt.next-<pid> and renames it,
//   so a failed install leaves the previous one working.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/install-cli.mjs');

function commands(target) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

before(() => {
  for (const name of ['template-ts', 'template-language']) {
    const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-package.mjs'), '--package', name, '--install'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(build.status, 0, `the build of ${name} failed:\n${build.stdout}${build.stderr}`);
  }
});

test('make showcase and make bench write the mode benchmark with --output, not with a shell redirection', () => {
  for (const target of ['showcase', 'bench']) {
    const lines = commands(target).filter(line => line.includes('benchmark-modes.mjs'));
    assert.deepEqual(lines, ['node tools/showcase/benchmark-modes.mjs --output examples/site/data/mode-benchmark.json'], `make -n ${target}`);
  }
});

test('make docs-verify-idempotent keeps the first build in a directory of its run outside the checkout', () => {
  const text = commands('docs-verify-idempotent').join('\n');
  assert.doesNotMatch(text, /dist\.first/, 'the recipe uses the fixed directory docs/.vitepress/dist.first');
  assert.match(text, /mktemp -d/);
  assert.doesNotMatch(readFileSync(path.join(ROOT, 'Makefile'), 'utf8'), /dist\.first/);
});

test('a failed install-cli keeps the previous install, and a successful one leaves no prepared directory', { timeout: 120_000 }, (t) => {
  const prefix = mkdtempSync(path.join(tmpdir(), 'template-cli-atomic-'));
  t.after(() => rmSync(prefix, { recursive: true, force: true }));
  const install = env => spawnSync(process.execPath, [SCRIPT, 'install', '--prefix', prefix], { cwd: ROOT, encoding: 'utf8', env });
  const first = install(process.env);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.deepEqual(readdirSync(path.join(prefix, 'lib')), ['polyspec-template-fmt']);
  // An npm that fails as an interrupted or offline install fails.
  const bin = path.join(prefix, 'stub-bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\necho "npm ERR! network" >&2\nexit 1\n');
  chmodSync(path.join(bin, 'npm'), 0o755);
  const failed = install({ ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.notEqual(failed.status, 0);
  const command = path.join(prefix, 'bin', 'template-fmt');
  assert.ok(existsSync(command), 'the failed install removed the previous template-fmt');
  const check = spawnSync(command, ['--check', path.join(ROOT, 'packages/template-language/tests/fixtures/expected')], { encoding: 'utf8' });
  assert.equal(check.status, 0, `the previous install does not run after the failed install: ${check.stdout}${check.stderr}`);
  assert.deepEqual(readdirSync(path.join(prefix, 'lib')), ['polyspec-template-fmt'], 'the failed install left its prepared directory');
});
