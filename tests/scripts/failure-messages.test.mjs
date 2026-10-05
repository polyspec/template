// Tests that a failure names what failed with the expected and the actual value or the fix (T19.10):
// - the generated Go and Rust conformance runners name each failed case instead of "the failed cases are listed above";
// - scripts/run-tests.mjs names a tool that cannot start, with its command and the install fix, instead of an unhandled
//   `error` event;
// - a CLI call of the conformance drivers that outlives its limit names the limit and the command;
// - the Go and PHP install projects print the expected and the actual output;
// - the PHP extension tests run through scripts/run-tests.mjs, which prints each test with its elapsed time.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { caseTestFailures, runCaseTests } from '../runner/cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

function directory(t, prefix) {
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
  for (const file of ['tests/runner/conformance-generated-go.mjs', 'tests/runner/conformance-generated-rust.mjs']) {
    assert.doesNotMatch(read(file), /listed above/, `${file} refers to the output instead of naming the failed cases`);
  }
});

test('a tool that cannot start fails with its command and the install fix', (t) => {
  // An empty directory as PATH: go cannot start; the runner itself starts with the path of node.
  const bin = directory(t, 'template-no-go-');
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/run-tests.mjs'), 'go', '--cwd', bin, '--', './...'], { encoding: 'utf8', env: { ...process.env, PATH: bin } });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.doesNotMatch(run.stderr, /Unhandled 'error' event/);
  assert.match(run.stdout, /✖ go .*: cannot start go: spawn go ENOENT; run make install-tools, which installs Go into var\/tools/);
});

test('a CLI call of the drivers that outlives its limit names the limit and the command', async (t) => {
  const copy = directory(t, 'template-drivers-limit-');
  for (const file of ['tests/runner/drivers.mjs', 'scripts/publish-build.mjs', 'scripts/test-progress/step.mjs']) {
    mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(copy, file));
  }
  const { drivers, invoke } = await import(pathToFileURL(path.join(copy, 'tests/runner/drivers.mjs')).href);
  drivers.go.command = () => ['sleep', ['5']];
  const result = invoke('go', [], copy, { timeoutMs: 200 });
  assert.equal(result.status, -1);
  assert.equal(result.stderr, 'sleep 5 did not finish within its limit of 0.2 s');
});

test('the Go and PHP install projects print the expected and the actual output', () => {
  const source = read('scripts/check-package-installs.mjs');
  assert.doesNotMatch(source, /install project output differs/, 'an install project fails without the expected and the actual output');
  assert.match(source, /\{"AST program",ast\},\{"generated program",direct\}/);
  assert.match(source, /"Go %s output differs\\\\nexpected: %q\\\\nactual: {3}%q\\\\n"/);
  assert.match(source, /\['AST program'=>\$ast,'generated program'=>\$direct\]/);
  assert.match(source, /"PHP \$name output differs\\\\nexpected: "\.json_encode\(\$expected\)\."\\\\nactual: {3}"\.json_encode\(\$actual\)/);
});

test('the PHP extension tests run through scripts/run-tests.mjs', () => {
  const run = spawnSync('make', ['--no-print-directory', '-n', 'test-ext-unit'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^node scripts\/run-tests\.mjs phpunit --php-extension var\/build\/libpolyspec_template\.(?:dylib|so) --cwd packages\/template-php-ext$/m);
  assert.doesNotMatch(run.stdout, /run-tests\.sh/);
});
