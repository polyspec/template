// `make bindings-check` runs binding check, which compares packages/release.mk, a file that Git ignores, with what binding
// release-recipes writes for the contract (binding CK-94). A file that an earlier binding wrote fails the check of the current
// one, so the recipe writes the file before it checks. The test reads the commands from a make dry run and requires
// release-recipes to come before the check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('make bindings-check writes the release recipes before binding check', () => {
  const lines = execFileSync('make', ['--no-print-directory', '-n', 'bindings-check'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const recipes = lines.findIndex(text => /\srelease-recipes --root\s/u.test(text));
  const check = lines.findIndex(text => /\scheck \S*packages\/rust\/interface\.json/u.test(text));
  assert.ok(check >= 0, `the dry run of make bindings-check runs no binding check:\n${lines.join('\n')}`);
  assert.ok(recipes >= 0 && recipes < check, `make bindings-check checks without writing the release recipes first:\n${lines.join('\n')}`);
});
