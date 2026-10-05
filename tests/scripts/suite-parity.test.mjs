// Tests that the full suite is one list that every runner shares (T17.1-2): `make check`, `make release-test-matrix`
// and the release job of the CI workflow run the targets of `CHECK_TARGETS` through the guard scripts/full-run.mjs,
// which runs every target to its end; and that a verifying CI job runs its later steps after a failing step, so one CI
// run reports every failure. Only a job that publishes stops at its first failure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const WORKFLOWS = readdirSync(path.join(ROOT, '.github/workflows')).filter(name => name.endsWith('.yml')).map(name => `.github/workflows/${name}`);

// The commands that make prints for `target` without running them. A make started by another make, as `make check`
// starts `make test-scripts`, prints `Entering directory` lines with GNU Make 4 (T17.1-4); MAKEFLAGS=w makes every make
// print them, and --no-print-directory removes them, so the lines are the commands on every make.
function dryRun(target) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

// The jobs of a workflow with their steps; a step is the text of one `- ` item of `steps:`.
function jobs(file) {
  const [, body] = read(file).split(/\njobs:\n/);
  return body.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).map((text) => {
    const [, steps = ''] = text.split(/\n {4}steps:\n/);
    return { name: text.trim().split(':')[0], text, steps: steps.split(/\n(?= {6}- )/).filter(step => step.trim()) };
  });
}

const CHECK_TARGETS = read('Makefile').match(/^CHECK_TARGETS := (.*)$/m)[1].split(/\s+/).filter(Boolean);

test('make release-test-matrix runs the targets of make check through the same guard', () => {
  const guard = `node scripts/full-run.mjs run ${CHECK_TARGETS.join(' ')}`;
  assert.deepEqual(dryRun('check'), [guard]);
  assert.deepEqual(dryRun('release-test-matrix'), [guard]);
});

test('the full suite holds the release targets that make check did not run', () => {
  for (const target of ['dependency-audit', 'benchmark-check', 'benchmark-smoke', 'docs-verify-idempotent', 'docs-static-check', 'test-ext']) {
    assert.ok(CHECK_TARGETS.includes(target), `CHECK_TARGETS does not hold ${target}`);
  }
});

test('the release job of the CI workflow runs make check and keeps its record', () => {
  const release = jobs('.github/workflows/ci.yml').find(job => job.name === 'release');
  const runs = release.steps.filter(step => /^ {6}- run: /.test(step)).map(step => step.match(/^ {6}- run: (.*)$/m)[1]);
  assert.ok(runs.includes('xvfb-run -a make check'), `the release job runs ${runs.join('; ')}`);
  assert.ok(!runs.some(command => /release-test-matrix/.test(command)), 'the release job runs another list than make check');
  const upload = release.steps.find(step => /uses: actions\/upload-artifact@/.test(step));
  assert.ok(upload, 'the release job does not upload the record of the full run');
  assert.match(upload, /\n {8}if: \$\{\{ !cancelled\(\) \}\}\n/);
  assert.match(upload, /\n {10}path: var\/full-run\.json\n/);
});

test('a verifying CI job runs every later step after a failing step, and a make with several targets keeps going', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      const publishes = job.steps.some(step => /uses: actions\/deploy-pages@/.test(step));
      for (const step of job.steps) {
        const command = step.match(/^ {6}- run: (.*)$/m)?.[1];
        if (!command) continue;
        if (!publishes) assert.match(step, /\n {8}if: \$\{\{ !cancelled\(\) \}\}(\n|$)/, `${file} job ${job.name} stops after a failing step before: ${command}`);
        for (const make of command.matchAll(/\bmake((?: [^|&;]+)?)/g)) {
          const goals = make[1].trim().split(/\s+/).filter(word => word && !word.startsWith('-') && !word.includes('='));
          if (goals.length > 1) assert.match(make[0], /^make -k /, `${file} job ${job.name}: make ${make[1].trim()} stops at its first failing target`);
        }
      }
    }
  }
});
