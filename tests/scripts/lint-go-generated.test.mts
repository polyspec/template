// `make lint-go` lints each Go module of the checkout, and the module packages/go holds the Go binding, whose files
// `make bindings` writes (zz_generated_*.go, ignored by Git). A lint of that module before the binding is written reads
// the files that an earlier generation left, so the recipe generates the binding first.
// The test reads the steps from the lint utility that the recipe runs and the commands from a make dry run, and requires
// the generation to come before the lint utility when a step lints packages/go.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface Step { label: string; args: string[]; cwd: string }

// The lint utility of kit exports lintSteps, the steps of the lint of a root with the arguments of its caller.
function isLintModule(value: unknown): value is { lintSteps: (root: string, args: readonly string[]) => Step[] } {
  return typeof value === 'object' && value !== null && 'lintSteps' in value && typeof value.lintSteps === 'function';
}

test('make lint-go writes the Go binding before it lints the module packages/go', async () => {
  const lines = execFileSync('make', ['--no-print-directory', '-n', 'lint-go'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const lint = lines.findIndex(text => /\/lint-go\.m?[jt]s\b/u.test(text));
  assert.ok(lint >= 0, `the dry run of make lint-go runs no lint-go utility:\n${lines.join('\n')}`);
  const words = lines[lint]?.trim().split(/\s+/u) ?? [];
  const script = words.find(word => /\/lint-go\.m?[jt]s$/u.test(word)) ?? '';
  const loaded: unknown = await import(pathToFileURL(script).href);
  assert.ok(isLintModule(loaded), `${script} exports no lintSteps`);
  const steps = loaded.lintSteps(ROOT, words.slice(words.indexOf(script) + 1));
  assert.ok(steps.some(step => path.relative(ROOT, step.cwd) === 'packages/go'), 'make lint-go lints the module packages/go');
  const generate = lines.findIndex(text => /\sgenerate --root\s/u.test(text));
  assert.ok(generate >= 0 && generate < lint, `make lint-go lints packages/go without writing the binding first:\n${lines.join('\n')}`);
});
