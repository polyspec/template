// Each job of CI runs `make ci-<job>` on a runner that holds only the tools the job installs (T28.115): a job whose commands
// run cargo installs the Rust toolchain, and a job whose commands run go installs Go, with `make install-tools TOOLS=...` or a
// whole `make install`. The test reads the commands of each job from a make dry run that remakes every target (-B), and of the
// targets that the job hands to ci-targets of kit the same way, since ci-targets runs them and make prints only its command.
// The job go lacked the Rust toolchain after binding generate started to read the crates with cargo metadata (T28.105-1).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// A make started from a recipe takes no flags or level of that make.
// The workflows give the jobs of a release their inputs as make variables and the actor of the run as GITHUB_ACTOR; the dry run
// gives them values of their form. RELEASE is the boolean input release of assets.yml, which a release sets to true, so the
// dry run takes the steps that only a release runs, such as release-binding-check (T28.118).
const { MAKEFLAGS: _flags, MFLAGS: _mflags, MAKELEVEL: _level, ...own } = process.env;
const ENV = { ...own, GITHUB_ACTOR: 'ci' };
const INPUTS = ['TAG=v0.0.0', 'VERSION=0.0.0', 'RELEASE=true', 'RUN=0', 'EXPECTED_PHP_MINOR=8.4', 'REPOSITORY=polyspec/template'];

const dryRun = (targets: readonly string[]): string[] =>
  execFileSync('make', ['--no-print-directory', '-n', '-B', ...INPUTS, ...targets], { cwd: ROOT, env: ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');

/** The commands of the target `job`, with those of the targets it hands to ci-targets. */
const commandsOf = (job: string): string[] => {
  const lines = dryRun([job]);
  const handed = lines.flatMap(line => /\/ci-targets\.m[jt]s -k \S+ (.+)$/u.exec(line)?.[1]?.trim().split(/\s+/u) ?? []);
  return handed.length ? [...lines, ...dryRun(handed)] : lines;
};

/** The tools that the commands install: the names after install-tools of kit, or every tool when it names none. */
const installed = (lines: readonly string[]): Set<string> | 'all' => {
  const tools = new Set<string>();
  for (const line of lines) {
    const match = /\/install-tools\.m[jt]s --no-self-update(.*)$/u.exec(line);
    if (!match) continue;
    const names = (match[1] ?? '').trim().split(/\s+/u).filter(Boolean);
    if (!names.length) return 'all';
    for (const name of names) tools.add(name);
  }
  return tools;
};

const NEEDS: readonly { tool: string; runs: RegExp }[] = [
  { tool: 'rust', runs: /\blink\.m[jt]s cargo\b|\/shims\/(?:cargo|maturin|rustup)\b/u },
  { tool: 'go', runs: /\/shims\/go\b/u },
  // The check of the binding scaffold runs go mod download inside binding, so the dry run shows only the command of binding.
  { tool: 'go', runs: /\/binding check \S+ --release\b/u },
];

// The jobs are the rules ci-<job> of the Makefile, but ci-targets and ci-passed, which run the targets and judge the results.
const jobs = readFileSync(path.join(ROOT, 'Makefile'), 'utf8').split('\n')
  .flatMap(line => /^(ci-(?!targets:|passed:)[a-z0-9-]+):/u.exec(line)?.[1] ?? []);

test('the Makefile has the jobs of CI', { timeout: 60_000 }, () => {
  assert.ok(jobs.includes('ci-go') && jobs.includes('ci-rust'), `jobs: ${jobs.join(' ')}`);
});

for (const job of [...new Set(jobs)].sort()) test(`${job} installs every tool that its commands run`, { timeout: 120_000 }, () => {
  const lines = commandsOf(job);
  const tools = installed(lines);
  if (tools === 'all') return;
  for (const { tool, runs } of NEEDS) {
    const line = lines.find(command => runs.test(command));
    assert.ok(line === undefined || tools.has(tool), `${job} runs ${tool} without installing it: ${line?.slice(0, 200)}`);
  }
});
