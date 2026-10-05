// Tests the report of a run of make targets (T20.1-9): scripts/ci-targets.mjs runs every target to its end also after
// a failed one, writes the whole output of each target to targets/<target>.log, and writes summary.md, also to the job
// summary of GitHub Actions, with each failed target and its first failure lines; it ends with status 1.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { failureLines } from '../../scripts/target-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('a run with a failing target keeps going and leaves the log of every target and a summary of the failure', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-target-report-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // MAKEFILES adds the probe targets to every make that the run starts.
  const probe = path.join(directory, 'probe.mk');
  writeFileSync(probe, 'report-probe-fail:\n\t@echo preparing the probe; echo "✖ the probe failed: expected 1, actual 2"; false\nreport-probe-pass:\n\t@echo the probe passed\n');
  const report = path.join(directory, 'report');
  const summaryFile = path.join(directory, 'step-summary.md');
  const run = spawnSync(process.execPath, ['scripts/ci-targets.mjs', report, 'report-probe-fail', 'report-probe-pass'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFILES: probe, GITHUB_STEP_SUMMARY: summaryFile },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const failing = readFileSync(path.join(report, 'targets/report-probe-fail.log'), 'utf8');
  assert.match(failing, /^preparing the probe\n✖ the probe failed: expected 1, actual 2\n/);
  assert.match(failing, /\[report\] make -k report-probe-fail ended with status 2\n$/);
  assert.match(readFileSync(path.join(report, 'targets/report-probe-pass.log'), 'utf8'), /^the probe passed\n/, 'the run stopped at the failed target');
  const summary = readFileSync(path.join(report, 'summary.md'), 'utf8');
  assert.match(summary, /^# make ci-targets report-probe-fail report-probe-pass\n\n1 of 2 targets passed\.\n/);
  assert.match(summary, /\| report-probe-fail \| failed \| \d+\.\d s \|\n\| report-probe-pass \| passed \| \d+\.\d s \|/);
  assert.match(summary, /## report-probe-fail: failed\n\nLog: targets\/report-probe-fail\.log\n\n```\n✖ the probe failed: expected 1, actual 2\n/);
  assert.equal(readFileSync(summaryFile, 'utf8'), summary, 'the job summary is not the summary of the report');
  assert.equal(existsSync(`${report}.lock`), false, 'the run left its lock');
});

test('the summary takes the last lines of a log in which no line reports a failure', () => {
  const lines = Array.from({ length: 30 }, (unused, index) => `line ${index}`);
  assert.deepEqual(failureLines(lines.join('\n')), lines.slice(10));
});
