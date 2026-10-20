// Tests that the full suite is one list that every runner shares (T17.1-2): `make check` and `make release-test-matrix`
// run the targets of `CHECK_TARGETS` through the guard scripts/kit/full-run.mjs, which runs every target to its end, and the
// jobs of the CI workflow run each target of `CHECK_TARGETS` in exactly one job with `make ci-targets` and no other
// target (T17.1-10); and that a verifying CI job runs its later steps after a failing step, so one CI run reports every
// failure. Only a job that publishes stops at its first failure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { captured } from '../../scripts/required.mts';
import { jobs, jobsOf, ROOT, runsOf, WORKFLOWS } from './workflows.mts';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// The commands that make prints for `target` without running them. A make started by another make, as `make check`
// starts `make template-test-scripts`, prints `Entering directory` lines with GNU Make 4 (T17.1-4); MAKEFLAGS=w makes every make
// print them, and --no-print-directory removes them, so the lines are the commands on every make.
function dryRun(target: string) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

const CHECK_TARGETS = captured(read('Makefile').match(/^CHECK_TARGETS := (.*)$/m), 1, 'CHECK_TARGETS of the Makefile').split(/\s+/).filter(Boolean);

test('make release-test-matrix runs the targets of make check through the same guard', () => {
  const guard = `${path.join(ROOT, 'var/tools/bin/node')} node_modules/@polyspec/kit/dist/full-run.mjs run ${CHECK_TARGETS.join(' ')}`;
  assert.deepEqual(dryRun('check'), [guard]);
  assert.deepEqual(dryRun('release-test-matrix'), [guard]);
});

test('the full suite holds the release targets that make check did not run', () => {
  for (const target of ['dependency-audit', 'benchmark-check', 'benchmark-smoke', 'docs-verify-idempotent', 'docs-static-check', 'template-test-ext']) {
    assert.ok(CHECK_TARGETS.includes(target), `CHECK_TARGETS does not hold ${target}`);
  }
});

// Each target of CHECK_TARGETS that no job of the workflow text runs, that more than one job runs, or that a job runs
// although it is not in CHECK_TARGETS; a job of a matrix is one job. A job that runs make check runs the whole suite
// again, so it is a violation too.
export function suiteViolations(text: string, suite: string[]) {
  const found: string[] = [];
  const owners = new Map<string, string[]>();
  for (const job of jobsOf(text)) {
    const runs = runsOf(job);
    if (runs.some(run => /\bmake (?:-\S+ )*check\b/.test(run))) found.push(`job ${job.name} runs make check, the whole suite again`);
    for (const run of runs) {
      for (const match of run.matchAll(/\bmake ci-targets TARGETS="([^"]*)"/g)) {
        for (const target of captured(match, 1, `the targets of ${match[0]}`).split(/\s+/).filter(Boolean)) owners.set(target, [...(owners.get(target) ?? []), job.name]);
      }
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
  const workflow = (jobs: [string, string][]) => `name: CI\njobs:\n${jobs.map(([name, run]) => `  ${name}:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: ${run}\n`).join('')}`;
  const suite = ['a', 'b', 'c'];
  assert.deepEqual(suiteViolations(workflow([['one', 'make ci-targets TARGETS="a b"'], ['two', 'xvfb-run -a make ci-targets TARGETS="c"']]), suite), []);
  assert.deepEqual(suiteViolations(workflow([['one', 'make ci-targets TARGETS="a b"'], ['two', 'make ci-targets TARGETS="b d"'], ['full', 'xvfb-run -a make check']]), suite), [
    'job full runs make check, the whole suite again',
    'b runs in 2 jobs: one, two',
    'c of CHECK_TARGETS runs in no job',
    'd runs in two and is not in CHECK_TARGETS',
  ]);
});

// The targets that open a browser: their job installs the browsers in a step before the step that runs them.
export const BROWSER_TARGETS = ['template-test-browser', 'template-test-scripts', 'template-test-codemirror'];

// Each job of the workflow text that runs a target of BROWSER_TARGETS without a `make template-install-browsers` step before it.
export function browserSetupViolations(text: string) {
  const found: string[] = [];
  for (const job of jobsOf(text)) {
    let installed = false;
    for (const step of job.steps) {
      if (step.run === undefined) continue;
      if (/\bmake (?:-\S+ )*(?:template-)?install-browsers\b/.test(step.run)) installed = true;
      for (const match of step.run.matchAll(/\bmake ci-targets TARGETS="([^"]*)"/g)) {
        for (const target of captured(match, 1, `the targets of ${match[0]}`).split(/\s+/).filter(target => BROWSER_TARGETS.includes(target))) {
          if (!installed) found.push(`job ${job.name} runs ${target} without make template-install-browsers before it`);
        }
      }
    }
  }
  return found;
}

test('a job that runs a browser target installs the browsers before it', () => {
  assert.deepEqual(browserSetupViolations(read('.github/workflows/ci.yml')), []);
  const workflow = (runs: string[]) => `name: CI\njobs:\n  one:\n    runs-on: ubuntu-24.04\n    steps:\n${runs.map(run => `      - run: ${run}\n`).join('')}`;
  assert.deepEqual(browserSetupViolations(workflow(['make template-install-browsers', 'make ci-targets TARGETS="template-test-scripts lint-go"'])), []);
  assert.deepEqual(browserSetupViolations(workflow(['make ci-targets TARGETS="template-test-scripts"', 'make template-install-browsers'])), [
    'job one runs template-test-scripts without make template-install-browsers before it',
  ]);
});

test('a verifying CI job runs every later step after a failing step, and a make with several targets keeps going', () => {
  for (const file of WORKFLOWS) {
    for (const job of jobs(file)) {
      // A job that publishes stops at its first failure. The step of the job ci-passed of ci.yml runs also after a
      // cancelled job: a skipped step would pass the check that a release requires (T22.1-3).
      const publishes = job.steps.some(step => step.uses?.startsWith('actions/deploy-pages@') === true || (step.run !== undefined && /^make release-publish\b/.test(step.run)))
        || (file.endsWith('/ci.yml') && job.name === 'ci-passed');
      for (const step of job.steps) {
        const command = step.run;
        if (command === undefined) continue;
        if (!publishes) assert.equal(step.if, '${{ !cancelled() }}', `${file} job ${job.name} stops after a failing step before: ${command}`);
        for (const make of command.matchAll(/\bmake((?: [^|&;]+)?)/g)) {
          // The arguments of make are optional in the pattern: a bare make names no goal.
          const args = make[1];
          if (args === undefined) continue;
          const goals = args.replace(/\w+=(?:"[^"]*"|'[^']*')/g, '').trim().split(/\s+/).filter(word => word && !word.startsWith('-') && !word.includes('='));
          // TARGETS="..." of make ci-targets are the targets of its runner, which runs each to its end (T20.1-9).
          if (goals.length > 1) assert.match(make[0], /^make -k /, `${file} job ${job.name}: make ${args.trim()} stops at its first failing target`);
        }
      }
    }
  }
});
