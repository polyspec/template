// `make test-binding-crates` compiles the test binaries of the binding crates and runs no test: the crates are generated
// by binding and have no `#[test]` (T28.160), and their behavior is run by the targets of each language (test-binding-node,
// -wasm, -python, -php, -go). A compile check that claims to run tests passes with zero of them, so the target runs
// `cargo test --no-run` and says so. The test reads the command from a make dry run and requires the no-run form.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('make test-binding-crates compiles the test binaries with cargo test --no-run and runs no test', () => {
  const lines = execFileSync('make', ['--no-print-directory', '-n', 'test-binding-crates'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  // The command of the target comes last: the lines before it are the bindings it depends on, which pass the cargo of the link as an option.
  const cargo = lines.findLast(text => /(^|\s)cargo\s/u.test(text));
  assert.ok(cargo !== undefined, `the dry run of make test-binding-crates runs no cargo:\n${lines.join('\n')}`);
  assert.match(cargo, /\scargo\s.*\btest\b.*--no-run\b/u, `make test-binding-crates does not compile the test binaries with --no-run:\n${cargo}`);
});
