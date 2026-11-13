// `make lint-rust` runs cargo clippy in each Cargo workspace of the checkout. The recipe excludes the binding crates, which
// make lint-bindings lints after make bindings writes their generated folders. An excluded package that a workspace does
// not hold is a defect of the recipe: cargo warns that it is not found, and the exclusion means nothing in that workspace.
// The test reads the recipe from a make dry run, the steps from the lint utility that the recipe runs, and the packages of
// each workspace from cargo metadata, and requires every --exclude of a step to name a package of its workspace.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface Step { label: string; args: string[]; cwd: string }

// The command line of the lint utility in the dry run of make lint-rust: its script and its arguments.
function recipe(): { script: string; args: string[] } {
  const output = execFileSync('make', ['--no-print-directory', '-n', 'lint-rust'], { cwd: ROOT, encoding: 'utf8' });
  const line = output.split('\n').find(text => /\/lint-rust\.m?[jt]s\b/u.test(text));
  assert.ok(line !== undefined, `the dry run of make lint-rust runs no lint-rust utility:\n${output}`);
  const words = line.trim().split(/\s+/u);
  const index = words.findIndex(word => /\/lint-rust\.m?[jt]s$/u.test(word));
  return { script: words[index] ?? '', args: words.slice(index + 1) };
}

// The names of the packages of the Cargo workspace in `folder`.
function packages(folder: string): Set<string> {
  const cargo = path.join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  const metadata = execFileSync(cargo, ['metadata', '--offline', '--locked', '--no-deps', '--format-version', '1'], { cwd: path.join(ROOT, folder), encoding: 'utf8' });
  const parsed: unknown = JSON.parse(metadata);
  assert.ok(typeof parsed === 'object' && parsed !== null && 'packages' in parsed && Array.isArray(parsed.packages), `cargo metadata of ${folder} has no packages`);
  return new Set(parsed.packages.map((entry: unknown) => {
    assert.ok(typeof entry === 'object' && entry !== null && 'name' in entry && typeof entry.name === 'string', `a package of ${folder} has no name`);
    return entry.name;
  }));
}

// The lint utility of kit exports lintSteps, the steps of the lint of a root with the arguments of its caller.
function isLintModule(value: unknown): value is { lintSteps: (root: string, args: readonly string[]) => Step[] } {
  return typeof value === 'object' && value !== null && 'lintSteps' in value && typeof value.lintSteps === 'function';
}

test('every package that make lint-rust excludes is a package of the workspace of its step', { timeout: 60_000 }, async () => {
  const { script, args } = recipe();
  const loaded: unknown = await import(pathToFileURL(script).href);
  assert.ok(isLintModule(loaded), `${script} exports no lintSteps`);
  const steps = loaded.lintSteps(ROOT, args);
  assert.ok(steps.length > 1, `make lint-rust has ${steps.length} steps; the checkout has more than one Cargo workspace`);
  const found: string[] = [];
  for (const step of steps) {
    const held = packages(step.cwd);
    step.args.forEach((arg, index) => {
      const name = step.args[index + 1];
      if (arg === '--exclude' && name !== undefined && !held.has(name)) found.push(`${step.label}: --exclude ${name}`);
    });
  }
  assert.deepEqual(found, [], `make lint-rust excludes packages that the workspace of the step does not hold:\n${found.join('\n')}`);
});
