// `make test-binding-python` builds the wheel of the Python binding through the link of kit (T28.159): the wheel of a binding
// checkout that has a .links file must build the linked crates, which only `link.mjs maturin` does. The test reads the
// command from a make dry run and requires the wheel build (`maturin build`) to run through `link.mjs maturin`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the wheel of the Python binding is built through link.mjs maturin of kit', () => {
  const lines = execFileSync('make', ['--no-print-directory', '-n', 'test-binding-python'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const wheel = lines.find(text => /\bbuild\s+--locked\s+--interpreter\b/u.test(text));
  assert.ok(wheel !== undefined, `the dry run of make test-binding-python builds no wheel:\n${lines.join('\n')}`);
  assert.match(wheel, /link\.mjs\S*\s+maturin\s/u, `the wheel of make test-binding-python is built without link.mjs maturin, so a linked binding checkout builds the unlinked crates:\n${wheel}`);
});
