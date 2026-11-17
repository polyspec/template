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
// gives them values of their form. RELEASE is the boolean input release of assets.yml, true in a release and false in CI, and
// a recipe chooses its check of binding by it, so the test reads the commands of both (T28.118, T28.121).
const { MAKEFLAGS: _flags, MFLAGS: _mflags, MAKELEVEL: _level, ...own } = process.env;
const ENV = { ...own, GITHUB_ACTOR: 'ci' };
const INPUTS = ['TAG=v0.0.0', 'VERSION=0.0.0', 'RUN=0', 'EXPECTED_PHP_MINOR=8.4', 'REPOSITORY=polyspec/template'];

const dryRun = (targets: readonly string[], release: string): string[] =>
  execFileSync('make', ['--no-print-directory', '-n', '-B', ...INPUTS, `RELEASE=${release}`, ...targets], { cwd: ROOT, env: ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');

/** The commands of the target `job` with RELEASE at `release`, with those of the targets it hands to ci-targets. */
const read = new Map<string, string[]>();
const commandsWith = (job: string, release: string): string[] => {
  const known = read.get(`${job} ${release}`);
  if (known) return known;
  const lines = dryRun([job], release);
  const handed = lines.flatMap(line => /\/ci-targets\.m[jt]s -k \S+ (.+)$/u.exec(line)?.[1]?.trim().split(/\s+/u) ?? []);
  const commands = handed.length ? [...lines, ...dryRun(handed, release)] : lines;
  read.set(`${job} ${release}`, commands);
  return commands;
};

const RELEASES = ['true', 'false'];

/** The commands of the target `job` in a release and in CI. */
const commandsOf = (job: string): string[] => RELEASES.flatMap(release => commandsWith(job, release));

// The check of binding runs go mod download with the network off (GOPROXY=off of the Makefile), so it reads the modules from
// the cache, which a new runner holds only after the job downloaded them with the network on (T28.124).
// The language service parses with the Rust core through the WebAssembly module of packages/ts, a build output that Git
// ignores, so a job that builds the language service builds that module first (T28.122).
const LANGUAGE_BUILD = /\/build-package\.mts --package language\b/u;
const WASM_MODULE = /\/shims\/wasm-bindgen --target web --out-dir packages\/ts\/wasm\/generated\b/u;
const BINDING_CHECK = /\/binding check \S/u;
const GO_MODULES = /-u GOPROXY .*\/shims\/go mod download\b/u;

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
  // install-wasm-bindgen of packages/release.mk installs the wasm-bindgen CLI alone with mise.
  if (lines.some(line => /\/mise install --locked (?:\S+ )*github:wasm-bindgen\/wasm-bindgen\b/u.test(line))) tools.add('wasm-bindgen');
  return tools;
};

const NEEDS: readonly { tool: string; runs: RegExp }[] = [
  { tool: 'rust', runs: /\blink\.m[jt]s cargo\b|\/shims\/(?:cargo|maturin|rustup)\b/u },
  { tool: 'go', runs: /\/shims\/go\b/u },
  { tool: 'wasm-bindgen', runs: /\/shims\/wasm-bindgen\b/u },
  // The check of the binding scaffold runs go mod download inside binding, with --release and without it, so the dry run shows
  // only the command of binding.
  { tool: 'go', runs: /\/binding check \S/u },
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
  // A whole make install installs every tool of mise.toml; the order of the commands is judged of every job.
  if (tools !== 'all') {
    for (const { tool, runs } of NEEDS) {
      const line = lines.find(command => runs.test(command));
      assert.ok(line === undefined || tools.has(tool), `${job} runs ${tool} without installing it: ${line?.slice(0, 200)}`);
    }
  }
  for (const release of RELEASES) {
    const commands = commandsWith(job, release);
    const check = commands.findIndex(command => BINDING_CHECK.test(command));
    const modules = commands.findIndex(command => GO_MODULES.test(command));
    assert.ok(check < 0 || (modules >= 0 && modules < check), `${job} with RELEASE=${release} runs the check of binding before it downloads the Go modules`);
    const language = commands.findIndex(command => LANGUAGE_BUILD.test(command));
    const wasm = commands.findIndex(command => WASM_MODULE.test(command));
    assert.ok(language < 0 || (wasm >= 0 && wasm < language), `${job} with RELEASE=${release} builds the language service before the WebAssembly module of the core`);
  }
});

// make expands `$(...)` of a recipe itself and gives the shell only `$$(...)`: the name of the archive of
// @polyspec/template holds the version that the shell reads, so the command of the dry run keeps the substitution (T28.129).
test('the check of the npm archives of a release names the archive of the version of the package', { timeout: 120_000 }, () => {
  const command = dryRun(['release-install-check'], 'false').find(line => /\/check-release-install\.mts\b/u.test(line));
  assert.match(command ?? '', /--template var\/release\/assets\/npm\/polyspec-template-\$\(.+ -p '.+\.version'\)\.tgz$/u);
});

// In a recipe make expands `$(name)` and `$(function ...)` itself; a command substitution of the shell is `$$(...)`. A
// `$(` of a recipe line that opens neither a variable nor a function of make is a substitution that make empties before
// the shell runs, as the name of the archive lost its version (T28.129). The functions are those of GNU make.
const MAKE_FUNCTIONS = new Set(['abspath', 'addprefix', 'addsuffix', 'and', 'basename', 'call', 'dir', 'error', 'eval', 'file', 'filter', 'filter-out', 'findstring', 'firstword',
  'flavor', 'foreach', 'if', 'info', 'intcmp', 'join', 'lastword', 'let', 'notdir', 'or', 'origin', 'patsubst', 'realpath', 'shell', 'sort', 'strip', 'subst', 'suffix', 'value',
  'warning', 'wildcard', 'word', 'wordlist', 'words']);

test('no recipe of the Makefile gives make a command substitution of the shell', () => {
  const emptied: string[] = [];
  for (const [index, line] of readFileSync(path.join(ROOT, 'Makefile'), 'utf8').split('\n').entries()) {
    if (!line.startsWith('\t')) continue;
    for (const match of line.matchAll(/(?<!\$)\$\(([^()\s,:]*)(.?)/gu)) {
      const [, name = '', next = ''] = match;
      const variable = /^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name) && (next === ')' || next === ':');
      const called = MAKE_FUNCTIONS.has(name) && (next === ' ' || next === ',');
      if (!variable && !called) emptied.push(`Makefile:${index + 1}: ${line.slice(match.index, match.index + 60)}`);
    }
  }
  assert.deepEqual(emptied, []);
});
