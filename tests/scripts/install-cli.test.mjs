// Tests that `make install-cli` installs the command template-fmt under a declared prefix without a symbolic link
// (T18.5): a copy of the formatter package in <prefix>/lib and an executable script in <prefix>/bin that runs it, which
// `make uninstall-cli` removes. The test runs scripts/install-cli.mjs on the formatter build of `make test-scripts`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/install-cli.mjs');

function links(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) return [file];
    return entry.isDirectory() ? links(file) : [];
  });
}

test('install-cli writes a copy and a script without a symbolic link, and uninstall-cli removes both', { timeout: 120_000 }, t => {
  const prefix = mkdtempSync(path.join(tmpdir(), 'template-cli-'));
  t.after(() => rmSync(prefix, { recursive: true, force: true }));
  const install = spawnSync(process.execPath, [SCRIPT, 'install', '--prefix', prefix], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(install.status, 0, `${install.stdout}${install.stderr}`);
  assert.deepEqual(links(prefix), []);
  const command = path.join(prefix, 'bin', 'template-fmt');
  const stats = lstatSync(command);
  assert.ok(stats.isFile() && (stats.mode & 0o111) !== 0, command);
  const check = spawnSync(command, ['--check', path.join(ROOT, 'packages/template-language/tests/fixtures/expected')], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
  const uninstall = spawnSync(process.execPath, [SCRIPT, 'uninstall', '--prefix', prefix], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(existsSync(command), false);
  assert.equal(existsSync(path.join(prefix, 'lib', 'polyspec-template-fmt')), false);
});
