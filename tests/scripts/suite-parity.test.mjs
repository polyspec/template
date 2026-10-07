// Tests that the full suite is one list that every runner shares (T17.1-2): `make check` and `make release-test-matrix`
// run the targets of `CHECK_TARGETS` through the guard scripts/full-run.mjs, which runs every target to its end, and the
// jobs of the CI workflow run each target of `CHECK_TARGETS` in exactly one job with `make ci-targets` and no other
// target (T17.1-10); and that a verifying CI job runs its later steps after a failing step, so one CI run reports every
// failure. Only a job that publishes stops at its first failure.
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
  return jobsOf(read(file));
}

function jobsOf(text) {
  const [, body] = text.split(/\njobs:\n/);
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

// Each target of CHECK_TARGETS that no job of the workflow text runs, that more than one job runs, or that a job runs
// although it is not in CHECK_TARGETS; a job of a matrix is one job. A job that runs make check runs the whole suite
// again, so it is a violation too.
export function suiteViolations(text, suite) {
  const found = [];
  const owners = new Map();
  for (const job of jobsOf(text)) {
    if (/- run: .*\bmake (?:-\S+ )*check\b/.test(job.text)) found.push(`job ${job.name} runs make check, the whole suite again`);
    for (const [, list] of job.text.matchAll(/\bmake ci-targets TARGETS="([^"]*)"/g)) {
      for (const target of list.split(/\s+/).filter(Boolean)) owners.set(target, [...(owners.get(target) ?? []), job.name]);
    }
  }
  for (const target of suite) {
    const jobs = owners.get(target) ?? [];
    if (jobs.length === 0) found.push(`${target} of CHECK_TARGETS runs in no job`);
    if (jobs.length > 1) found.push(`${target} runs in ${jobs.length} jobs: ${jobs.join(', ')}`);
  }
  for (const [target, jobs] of owners) if (!suite.includes(target)) found.push(`${target} runs in ${jobs.join(', ')} and is not in CHECK_TARGETS`);
  return found;
}

test('the jobs of the CI workflow run each target of CHECK_TARGETS in exactly one job and no other target (T17.1-10)', () => {
  assert.deepEqual(suiteViolations(read('.github/workflows/ci.yml'), CHECK_TARGETS), []);
});

test('the rule of the CI suite names a missing, a repeated and an extra target and a job that runs make check', () => {
  const workflow = jobs => `name: CI\njobs:\n${jobs.map(([name, run]) => `  ${name}:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: ${run}\n`).join('')}`;
  const suite = ['a', 'b', 'c'];
  assert.deepEqual(suiteViolations(workflow([['one', 'make ci-targets TARGETS="a b"'], ['two', 'xvfb-run -a make ci-targets TARGETS="c"']]), suite), []);
  assert.deepEqual(suiteViolations(workflow([['one', 'make ci-targets TARGETS="a b"'], ['two', 'make ci-targets TARGETS="b d"'], ['full', 'xvfb-run -a make check']]), suite), [
    'job full runs make check, the whole suite again',
    'b runs in 2 jobs: one, two',
    'c of CHECK_TARGETS runs in no job',
    'd runs in two and is not in CHECK_TARGETS',
  ]);
});

test('a verifying CI job runs every later step after a failing step, and a make with several targets keeps going', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      // A job that publishes stops at its first failure. The step of the job ci-passed of ci.yml runs also after a
      // cancelled job: a skipped step would pass the check that the ruleset main requires (T22.1-3).
      const publishes = job.steps.some(step => /uses: actions\/deploy-pages@|run: make release-publish\b/.test(step))
        || (file.endsWith('/ci.yml') && job.name === 'ci-passed');
      for (const step of job.steps) {
        const command = step.match(/^ {6}- run: (.*)$/m)?.[1];
        if (!command) continue;
        if (!publishes) assert.match(step, /\n {8}if: \$\{\{ !cancelled\(\) \}\}(\n|$)/, `${file} job ${job.name} stops after a failing step before: ${command}`);
        for (const make of command.matchAll(/\bmake((?: [^|&;]+)?)/g)) {
          const goals = make[1].replace(/\w+="[^"]*"/g, '').trim().split(/\s+/).filter(word => word && !word.startsWith('-') && !word.includes('='));
          // TARGETS="..." of make ci-targets are the targets of its runner, which runs each to its end (T20.1-9).
          if (goals.length > 1) assert.match(make[0], /^make -k /, `${file} job ${job.name}: make ${make[1].trim()} stops at its first failing target`);
        }
      }
    }
  }
});
