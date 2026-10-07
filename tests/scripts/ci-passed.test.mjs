// Tests make ci-passed, the step of the job ci-passed, the last job of .github/workflows/ci.yml and its check that the
// ruleset main requires (T22.1-3): it passes only when every job that it needs has the result success.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { passed } from '../../scripts/ci-passed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The JSON of `needs` that GitHub writes into the step: one entry per needed job with its result.
const needs = result => `{\n  "release": {\n    "result": "success",\n    "outputs": {}\n  },\n  "php": {\n    "result": "${result}",\n    "outputs": {}\n  }\n}`;

function run(text) {
  const lines = [];
  const status = passed(text, line => lines.push(line));
  return { status, printed: lines.join('\n') };
}

test('every needed job with the result success passes', () => {
  const { status, printed } = run(needs('success'));
  assert.equal(status, 0, printed);
  assert.match(printed, /^\[ci-passed\] release: success$/m);
  assert.match(printed, /^\[ci-passed\] every needed job passed: release, php$/m);
});

test('a failed, skipped or cancelled job fails with its name and result', () => {
  for (const result of ['failure', 'skipped', 'cancelled']) {
    const { status, printed } = run(needs(result));
    assert.equal(status, 1, printed);
    assert.ok(printed.includes(`[ci-passed] failed: php (${result}); every needed job must have the result success`), printed);
  }
});

test('results that name no job or are not JSON fail with the cause', () => {
  for (const [text, cause] of [[undefined, 'RESULTS is not set'], ['', 'RESULTS is not JSON'], ['{', 'RESULTS is not JSON'],
    ['{}', 'RESULTS names no job'], ['[]', 'RESULTS names no job'], ['{"release": "success"}', 'release: no result']]) {
    const { status, printed } = run(text);
    assert.equal(status, 1, `${text}: ${printed}`);
    assert.ok(printed.includes(cause), `${text}: ${printed}`);
  }
});

test('make ci-passed reads the multi-line JSON of needs from its environment', () => {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !['MAKEFLAGS', 'MFLAGS', 'MAKELEVEL', 'RESULTS'].includes(name)));
  for (const [result, status] of [['success', 0], ['failure', 2]]) {
    const ran = spawnSync('make', ['--no-print-directory', 'ci-passed', `RESULTS=${needs(result)}`], { cwd: ROOT, encoding: 'utf8', env: environment });
    assert.equal(ran.status, status, ran.stdout + ran.stderr);
    assert.match(ran.stdout, new RegExp(`^\\[ci-passed\\] php: ${result}$`, 'm'));
  }
});
