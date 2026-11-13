// Tests that the full suite is one list (T17.1-2): the jobs of the CI workflow run each target of `CHECK_TARGETS` in
// exactly one job with `make ci-targets` and no other target (T17.1-10); that a verifying CI job runs its later steps
// after a failing step, so one CI run reports every failure, and only a job that publishes stops at its first failure;
// and that every tool of kit that a recipe starts is a tool of the installed kit (T27.1-19).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captured } from '../../scripts/required.mts';
import { jobs, jobsOf, ROOT, runsOf, WORKFLOWS } from './workflows.mts';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const CHECK_TARGETS = captured(read('Makefile').match(/^CHECK_TARGETS := (.*)$/m), 1, 'CHECK_TARGETS of the Makefile').split(/\s+/).filter(Boolean);

// The file of the tool `tool` in the installed kit `kit`. A source install, a link to the kit checkout, runs
// scripts/kit/<tool>.mts; a packed install holds no scripts/kit/land.mts and runs dist/<tool>.mjs, as KIT of the Makefile
// selects (T27.1-25, T27.1-64).
export function kitToolFile(kit: string, tool: string) {
  return existsSync(path.join(kit, 'scripts/kit/land.mts')) ? path.join(kit, 'scripts/kit', `${tool}.mts`) : path.join(kit, 'dist', `${tool}.mjs`);
}

// T27.1-19: kit deleted its full-run guard (K240), and make check still started it.
test('every tool of kit that a recipe of the Makefile starts is a tool of the installed kit', () => {
  const tools = [...read('Makefile').matchAll(/\$\(KIT\)\/([\w-]+)\.\$\(KIT_EXT\)/g)].map(match => captured(match, 1, match[0]));
  assert.ok(tools.length > 0, 'the Makefile starts no tool of kit');
  const missing = [...new Set(tools)].filter(tool => !existsSync(kitToolFile(path.join(ROOT, 'node_modules/@polyspec/kit'), tool)));
  assert.deepEqual(missing, []);
});

test('the tool of a source kit is its script and the tool of a packed kit is its dist module', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'template-kit-tools-'));
  try {
    const source = path.join(root, 'source');
    const packed = path.join(root, 'packed');
    mkdirSync(path.join(source, 'scripts/kit'), { recursive: true });
    writeFileSync(path.join(source, 'scripts/kit/land.mts'), '');
    mkdirSync(path.join(packed, 'scripts/kit/bootstrap'), { recursive: true });
    writeFileSync(path.join(packed, 'scripts/kit/bootstrap/bootstrap.mts'), '');
    assert.equal(kitToolFile(source, 'run-tests'), path.join(source, 'scripts/kit/run-tests.mts'));
    assert.equal(kitToolFile(packed, 'run-tests'), path.join(packed, 'dist/run-tests.mjs'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Each target of CHECK_TARGETS that no job of the workflow text runs, that more than one job runs, or that a job runs
// although it is not in CHECK_TARGETS; a job of a matrix is one job.
export function suiteViolations(text: string, suite: string[]) {
  const found: string[] = [];
  const owners = new Map<string, string[]>();
  for (const job of jobsOf(text)) {
    const runs = runsOf(job);
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

test('the rule of the CI suite names a missing, a repeated and an extra target', () => {
  const workflow = (jobs: [string, string][]) => `name: CI\njobs:\n${jobs.map(([name, run]) => `  ${name}:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: ${run}\n`).join('')}`;
  const suite = ['a', 'b', 'c'];
  assert.deepEqual(suiteViolations(workflow([['one', 'make ci-targets TARGETS="a b"'], ['two', 'xvfb-run -a make ci-targets TARGETS="c"']]), suite), []);
  assert.deepEqual(suiteViolations(workflow([['one', 'make ci-targets TARGETS="a b"'], ['two', 'make ci-targets TARGETS="b d"']]), suite), [
    'b runs in 2 jobs: one, two',
    'c of CHECK_TARGETS runs in no job',
    'd runs in two and is not in CHECK_TARGETS',
  ]);
});

// The setups that a target needs: its job runs the setup in a step before the step that runs the target. A browser target
// needs the browsers; hooks-check needs core.hooksPath and the merge drivers, which a fresh checkout of CI does not have (T27.1-23).
export const SETUPS = [
  { targets: ['template-test-browser', 'template-test-scripts', 'template-test-codemirror'], setup: /\bmake (?:-\S+ )*(?:template-)?install-browsers\b/, name: 'make template-install-browsers' },
  { targets: ['hooks-check'], setup: /\bmake (?:-\S+ )*hooks(?![\w-])/, name: 'make hooks' },
];

// Each job of the workflow text that runs a target of SETUPS without the step of its setup before it.
export function setupViolations(text: string) {
  const found: string[] = [];
  for (const job of jobsOf(text)) {
    const installed = new Set<string>();
    for (const step of job.steps) {
      if (step.run === undefined) continue;
      for (const { setup, name } of SETUPS) if (setup.test(step.run)) installed.add(name);
      for (const match of step.run.matchAll(/\bmake ci-targets TARGETS="([^"]*)"/g)) {
        for (const target of captured(match, 1, `the targets of ${match[0]}`).split(/\s+/)) {
          for (const { targets, name } of SETUPS) {
            if (targets.includes(target) && !installed.has(name)) found.push(`job ${job.name} runs ${target} without ${name} before it`);
          }
        }
      }
    }
  }
  return found;
}

test('a job that runs a target installs its setup before it', () => {
  assert.deepEqual(setupViolations(read('.github/workflows/ci.yml')), []);
  const workflow = (runs: string[]) => `name: CI\njobs:\n  one:\n    runs-on: ubuntu-24.04\n    steps:\n${runs.map(run => `      - run: ${run}\n`).join('')}`;
  assert.deepEqual(setupViolations(workflow(['make template-install-browsers', 'make hooks', 'make ci-targets TARGETS="template-test-scripts hooks-check lint-go"'])), []);
  assert.deepEqual(setupViolations(workflow(['make ci-targets TARGETS="template-test-scripts hooks-check"', 'make template-install-browsers', 'make hooks'])), [
    'job one runs template-test-scripts without make template-install-browsers before it',
    'job one runs hooks-check without make hooks before it',
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
          // An expression of the workflow, such as ${{ ... && 'AUTO=1' || '' }}, which the pattern cuts at its &&, gives at most one
          // assignment and no goal (T27.1-64).
          const goals = args.replace(/\$\{\{.*?(?:\}\}|$)/g, '').replace(/\w+=(?:"[^"]*"|'[^']*')/g, '').trim().split(/\s+/).filter(word => word && !word.startsWith('-') && !word.includes('='));
          // TARGETS="..." of make ci-targets are the targets of its runner, which runs each to its end (T20.1-9).
          if (goals.length > 1) assert.match(make[0], /^make -k /, `${file} job ${job.name}: make ${args.trim()} stops at its first failing target`);
        }
      }
    }
  }
});


// The Rust sources are in the form of rustfmt, which a review cannot judge by reading: fmt-check checks every crate of the
// root workspace, the binding packages included, with `cargo fmt --all --check`, as the fmt-check of the other polyspec
// libraries does, and the full suite runs it; no narrower target checks the crate of the core alone (T28.27).
test('the full suite checks the form of every crate of the root workspace with cargo fmt', () => {
  const makefile = read('Makefile');
  assert.ok(CHECK_TARGETS.includes('fmt-check'), 'CHECK_TARGETS names fmt-check');
  assert.match(makefile, /^fmt-check:.*\n\t\$\(CARGO\) fmt --all --check\n/mu, 'fmt-check runs $(CARGO) fmt --all --check');
  assert.doesNotMatch(makefile, /\$\(CARGO\) fmt -p /u, 'no target checks the format of one crate of the root workspace');
});
