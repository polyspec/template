// Tests that a failure names what failed with the expected and the actual value or the fix (T19.10):
// - the generated Go and Rust conformance runners name each failed case instead of "the failed cases are listed above";
// - the run-tests of @polyspec/kit names a tool that cannot start, with its command and the install fix, instead of an unhandled
//   `error` event;
// - a CLI call of the conformance drivers that outlives its limit names the limit and the command;
// - the Go and PHP install projects print the expected and the actual output;
// - the PHP extension tests run through the run-tests of @polyspec/kit, which prints each test with its elapsed time.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { caseTestFailures, runCaseTests } from '../runner/cases.mts';
import { importDriverCopy } from './driver-copy.mts';
import { copyDriverFiles } from './driver-fixture.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

function directory(t: TestContext, prefix: string) {
  const created = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
}

test('the generated runners name each case whose generated test failed', async (t) => {
  const tests = directory(t, 'template-case-tests-');
  writeFileSync(path.join(tests, 'cases.test.mjs'), "import test from 'node:test';\ntest('case_echo_path', () => { throw new Error('generated output differs'); });\ntest('case_text_plain', () => {});\n");
  const run = await runCaseTests(['node', '--', path.join(tests, 'cases.test.mjs')], { cwd: ROOT }, new Map([['case_echo_path', 'echo/path'], ['case_text_plain', 'text/plain']]));
  assert.notEqual(run.status, 0);
  assert.deepEqual(run.failed, ['echo/path']);
  assert.deepEqual(caseTestFailures('Go', run), ['echo/path: the generated Go test of the case failed']);
  for (const file of ['tests/runner/conformance-generated-go.mts', 'tests/runner/conformance-generated-rust.mts']) {
    assert.doesNotMatch(read(file), /listed above/, `${file} refers to the output instead of naming the failed cases`);
  }
});

test('a tool that cannot start fails with its command and the install fix', (t) => {
  // A directory that holds only git as PATH: go cannot start; the runner itself starts with the path of node and finds
  // the root of the checkout with git.
  const bin = directory(t, 'template-no-go-');
  const gitCore = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  assert.equal(gitCore.status, 0, gitCore.stderr);
  symlinkSync(path.join(gitCore.stdout.trim(), 'git'), path.join(bin, 'git'));
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests')), 'go', '--cwd', bin, '--', './...'], { encoding: 'utf8', env: { ...process.env, PATH: bin } });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.doesNotMatch(run.stderr, /Unhandled 'error' event/);
  assert.match(run.stdout, /✖ go .*: cannot start go: spawn go ENOENT; declare go in mise.toml and run make install-tools, which installs it into var\/tools\/mise/);
});

test('a CLI call of the drivers that outlives its limit names the limit and the command', async (t) => {
  const copy = directory(t, 'template-drivers-limit-');
  copyDriverFiles(copy);
  const { drivers, invoke } = await importDriverCopy(copy);
  drivers.go.command = () => ['sleep', ['5']];
  const result = invoke('go', [], copy, { timeoutMs: 200 });
  assert.equal(result.status, -1);
  assert.equal(result.stderr, 'sleep 5 did not finish within its limit of 0.2 s');
});

test('the Go and PHP install projects print the expected and the actual output', () => {
  const source = read('scripts/check-package-installs.mts');
  assert.doesNotMatch(source, /install project output differs/, 'an install project fails without the expected and the actual output');
  assert.match(source, /\{"AST program",ast\},\{"generated program",direct\}/);
  assert.match(source, /"Go %s output differs\\\\nexpected: %q\\\\nactual: {3}%q\\\\n"/);
  assert.match(source, /\['AST program'=>\$ast,'generated program'=>\$direct\]/);
  assert.match(source, /"PHP \$name output differs\\\\nexpected: "\.json_encode\(\$expected\)\."\\\\nactual: {3}"\.json_encode\(\$actual\)/);
});

test('the PHP extension tests run through the run-tests tool of @polyspec/kit', () => {
  const run = spawnSync('make', ['--no-print-directory', '-n', 'template-test-ext-unit'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.split('\n').includes(`COMPOSER_VENDOR_DIR=${path.join(ROOT, 'vendor')} ${path.join(ROOT, 'var/tools/bin/node')} node_modules/@polyspec/kit/dist/run-tests.mjs phpunit --php-extension var/build/polyspec_template.so --cwd packages/php-ext`), run.stdout);
  assert.doesNotMatch(run.stdout, /run-tests\.sh/);
});
