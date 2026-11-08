// Tests that the commands that publish a file or a directory that others read replace it at once and keep the
// previous version when they fail (T19.7): a reader never finds it missing or half written.
// - scripts/install-cli.mts prepares the new install in <prefix>/lib/.polyspec-template-fmt.next-<pid> and renames it,
//   so a failed install leaves the previous one working.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/install-cli.mts');

before(() => {
  for (const name of ['ts', 'language']) {
    const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-package.mts'), '--package', name], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(build.status, 0, `the build of ${name} failed:\n${build.stdout}${build.stderr}`);
  }
});

test('a failed install-cli keeps the previous install, and a successful one leaves no prepared directory', { timeout: 690_000 }, (t) => {
  const prefix = mkdtempSync(path.join(tmpdir(), 'template-cli-atomic-'));
  t.after(() => rmSync(prefix, { recursive: true, force: true }));
  const install = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, [SCRIPT, 'install', '--prefix', prefix], { cwd: ROOT, encoding: 'utf8', env });
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
  const check = spawnSync(command, ['--check', path.join(ROOT, 'packages/language/tests/fixtures/expected')], { encoding: 'utf8' });
  assert.equal(check.status, 0, `the previous install does not run after the failed install: ${check.stdout}${check.stderr}`);
  assert.deepEqual(readdirSync(path.join(prefix, 'lib')), ['polyspec-template-fmt'], 'the failed install left its prepared directory');
});
