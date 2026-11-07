// Tests that the full suite is one list (T17.1-2): the jobs of the CI workflow run each target of `CHECK_TARGETS` in
// exactly one job with `make ci-targets` and no other target (T17.1-10); that a verifying CI job runs its later steps
// after a failing step, so one CI run reports every failure, and only a job that publishes stops at its first failure;
// and that every tool of kit that a recipe starts is a tool of the installed kit (T27.1-19).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captured } from '../../scripts/required.mts';
import { jsonDocument } from '../../scripts/json-document.mts';
import { jobs, jobsOf, ROOT, runsOf, WORKFLOWS } from './workflows.mts';

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// The commands that make prints for `target` without running them. A make started by another make, as `make lint`
// starts `make lint-ts`, prints `Entering directory` lines with GNU Make 4 (T17.1-4); MAKEFLAGS=w makes every make
// print them, and --no-print-directory removes them, so the lines are the commands on every make.
function dryRun(target: string) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

const CHECK_TARGETS = captured(read('Makefile').match(/^CHECK_TARGETS := (.*)$/m), 1, 'CHECK_TARGETS of the Makefile').split(/\s+/).filter(Boolean);

// The file of the tool `tool` in the installed kit `kit`. A source install, a link to the kit checkout, runs
// scripts/kit/<tool>.mts; a packed install holds no scripts/kit/land.mts and runs dist/<tool>.mjs, as KIT of the Makefile
// selects (T27.1-25, T27.1-64).
export function kitToolFile(kit: string, tool: string) {
  return existsSync(path.join(kit, 'scripts/kit/land.mts')) ? path.join(kit, 'scripts/kit', `${tool}.mts`) : path.join(kit, 'dist', `${tool}.mjs`);
}

// T27.1-40: test-go of kit tests every module of go.work, and the showcase adapter imports its generated/, which git
// ignores and typed-generator writes; only lint-go named typed-generator, so the go job of CI without lint-go failed.
test('test-go writes the generated programs that the modules of go.work import before it tests them', () => {
  assert.match(read('go.work'), /^use \.\/examples\/showcase\/adapters\/go$/m, 'go.work no longer uses the showcase adapter; the check verified nothing');
  assert.ok(dryRun('test-go').some(line => line.includes('examples/showcase/compile-generated.mts --refresh true')), 'make test-go does not run typed-generator');
});

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

test('the full suite holds the release targets', () => {
  for (const target of ['benchmark-check', 'benchmark-smoke', 'docs-verify-idempotent', 'docs-static-check', 'template-test-ext']) {
    assert.ok(CHECK_TARGETS.includes(target), `CHECK_TARGETS does not hold ${target}`);
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

// FMT-16: a binding imports the public formatter export, which needs its build
// even when no earlier target has populated dist in a clean checkout.
test('native formatter parity bindings build the published formatter before execution', () => {
  const run = spawnSync('make', ['--no-print-directory', '-n', 'parity-check', 'UNITS=formatter-sdk-results'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const commands = run.stdout.split('\n');
  const build = commands.findIndex(line => line.includes('scripts/build-package.mts --package language'));
  const binding = commands.findIndex(line => line.includes('/parity.') && line.includes('--unit formatter-sdk-results'));
  assert.ok(build >= 0, 'the formatter binding requires its published package build');
  assert.ok(binding > build, 'the native binding executes after the package build');
});

// T27.1-9: installation belongs to each worker.
test('language workers install their own dependency graph', () => {
  const ci = jobs('.github/workflows/ci.yml');
  for (const language of ['go', 'rust', 'php', 'python', 'typescript', 'browser', 'editor']) {
    const job = ci.find(job => job.name === language);
    assert.ok(job, language);
    const target = ['typescript', 'browser', 'editor'].includes(language) ? 'node' : language;
    assert.ok(runsOf(job).includes(`make template-install-${target}`), `${language} installs ${target} dependencies`);
    assert.ok(!runsOf(job).includes('make install'), `${language} must not install every dependency graph`);
  }
});

test('language dependency install targets do not reach unrelated native package managers', () => {
  const forbidden: Record<string, RegExp> = {
    node: /composer-install|cargo fetch|go mod download|pip download|python-package/,
    go: /composer-install|cargo fetch|pip download|python-package/,
    rust: /composer-install|go mod download|pip download|python-package/,
    php: /cargo fetch|go mod download|pip download|python-package/,
    python: /composer-install|cargo fetch|go mod download/,
  };
  for (const [language, pattern] of Object.entries(forbidden)) {
    assert.doesNotMatch(dryRun(`template-install-${language}`).join('\n'), pattern, language);
  }
  const all = dryRun('template-install-parity').join('\n');
  for (const required of ['cargo fetch --locked', 'mod download', 'composer-install', 'pip download', 'python-package']) {
    assert.ok(all.includes(required), `parity installation lacks ${required}`);
  }
});

// T27.1-64: the recipes are template's own; the full parity-check of the Makefile runs the API phase and the binding phase of
// each implementation of config/parity.json, and the job parity of ci.yml runs it once, in CHECK_TARGETS.
test('the job parity runs the full parity-check, the API phase and the binding phase of each implementation of config/parity.json', () => {
  const { implementations } = jsonDocument<{ implementations: { name: string }[] }>('parity implementation names', {
    type: 'object',
    required: ['implementations'],
    properties: { implementations: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
  }).parse(read('config/parity.json'), 'config/parity.json');
  const phases = ['parity-api-check', ...implementations.map(({ name }) => `parity-bindings-${name}-check`)];
  const parity = jobs('.github/workflows/ci.yml').find(job => job.name === 'parity');
  assert.ok(parity, 'ci.yml has no job parity');
  assert.deepEqual(runsOf(parity).filter(command => command.startsWith('make ci-targets')), ['make ci-targets TARGETS="parity-check"']);
  assert.ok(CHECK_TARGETS.includes('parity-check'), 'CHECK_TARGETS does not name parity-check');
  const full = dryRun('parity-check');
  for (const target of phases) {
    const phase = target === 'parity-api-check' ? '--phase api' : `--phase bindings --implementation ${target.replace(/^parity-bindings-(.*)-check$/, '$1')}`;
    assert.ok(full.some(line => line.includes('/parity.') && line.endsWith(phase)), `make parity-check does not run ${phase}`);
  }
});

// The lint of each language runs in the job lint, which installs every tool with make install; a language job runs the
// format checks of template and no lint.
test('native CI workers own the format checks of template, leave the lint to the job lint and select their tool groups', () => {
  const expected: Record<string, string[]> = {
    go: ['template-lint-go-format', 'template-lint-go-modules'],
    rust: ['template-lint-rust-format'],
    php: ['template-lint-php-format'],
    python: [],
  };
  for (const [language, targets] of Object.entries(expected)) {
    const job = jobs('.github/workflows/ci.yml').find(job => job.name === language);
    assert.ok(job);
    const commands = runsOf(job);
    const owned = commands.filter(command => command.includes('TARGETS="')).flatMap(command => command.split(/[" ]/));
    assert.ok(commands.some(command => command.startsWith('make install-tools TOOLS="')), language);
    assert.ok(!commands.includes('make install-tools'), language);
    for (const target of targets) assert.ok(owned.includes(target), `${language} owns ${target}`);
    assert.ok(!owned.includes(`lint-${language}`), `${language} runs lint-${language}, which the job lint runs`);
  }
});

// The lint tools: the tools that only the lint targets start, from the scripts of kit. The job lint runs every lint target,
// and generated-lint-check, the one other target that starts them, runs in a job that installs every tool with make install,
// so a job that selects its tools selects none of them (T27.1-38).
const LINT_TOOLS = ['ruff', 'vulture', 'golangciLint', 'deadcode', 'govulncheck', 'phpcs', 'phpstan', 'alint', 'cargoAudit', 'cargoDeny'];

test('a CI job that selects its tools installs no lint tool, which only the lint targets start', () => {
  for (const job of jobs('.github/workflows/ci.yml')) {
    for (const command of runsOf(job)) {
      const selected = /^make install-tools TOOLS="([^"]*)"/.exec(command)?.[1]?.split(' ') ?? [];
      assert.deepEqual(selected.filter(tool => LINT_TOOLS.includes(tool)), [], `job ${job.name} installs lint tools that none of its targets starts`);
    }
  }
});

// build-go builds every module of go.work, the showcase adapter among them, whose imports are generated.
test('the build of every Go module generates the showcase imports before it', () => {
  const commands = dryRun('build-go');
  const generated = commands.findIndex(command => command.includes('examples/showcase/compile-generated.mts'));
  const native = commands.findIndex(command => command.includes('/runtime-targets.') && command.endsWith('build go'));
  assert.ok(generated >= 0, 'the Go build must generate showcase imports');
  assert.ok(native > generated, 'the build of the modules of go.work runs after generation');
});
