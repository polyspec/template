// What the generated runners share for a case: the type manifest of its templates and the verdict on its compile or render.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deriveTypeManifest } from '../../packages/compiler/src/type-manifest.mts';
import { parse } from '../../packages/ts/dist/index.mjs';
import { stepProgress } from './bounded.mts';
import { errorField, generatedCases, type TestCase, typeDefinitions } from './cases.mts';
import { type CaseResult, errorDifference } from './generated-errors.mts';

/** The parsed `.tpl` files of the case directory, by their names relative to it. */
function parsedTemplates(testCase: TestCase): Map<string, ReturnType<typeof parse>> {
  const templates = new Map<string, ReturnType<typeof parse>>();
  const pending: [string, string][] = [[testCase.dir, '']];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [directory, prefix] = next;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) pending.push([path, name]);
      else if (entry.isFile() && entry.name.endsWith('.tpl')) templates.set(name, parse(readFileSync(path), name, testCase.options));
    }
  }
  return templates;
}

/** The type manifest of the templates and the definitions of the case. */
export function caseTypeManifest(testCase: TestCase): ReturnType<typeof deriveTypeManifest> {
  return deriveTypeManifest(parsedTemplates(testCase), typeDefinitions(testCase));
}

/**
 * The failure of the case when the compile or the run threw `error`, or null when the error is the one the case expects. A
 * deadline fails the case with its message.
 */
export function compileFailure(testCase: TestCase, error: unknown): string | null {
  const message = String(errorField(error, 'message'));
  if (errorField(error, 'deadline')) return `${testCase.id}: ${message}`;
  const difference = errorDifference(testCase.expectedError, error, 'compile');
  return difference ? `${testCase.id}: compile ${difference}: ${message}` : null;
}

/**
 * The failure of the case after the generated program rendered it, or null when the result is the expected one: `rendered`
 * holds the `html` that the program returned, or the `error` that it reported.
 */
export function renderFailure(testCase: TestCase, rendered: { html?: string | undefined; error?: unknown }): string | null {
  if (rendered.error !== undefined) {
    const difference = errorDifference(testCase.expectedError, rendered.error, 'render');
    if (!difference) return null;
    const message = errorField(rendered.error, 'message');
    return `${testCase.id}: render ${difference}${typeof message === 'string' ? `: ${message}` : ''}`;
  }
  if (testCase.expectedError !== null) return `${testCase.id}: expected ${testCase.expectedError.code}, generated execution succeeded`;
  if (rendered.html === undefined) return `${testCase.id}: the generated program returned no html and no error`;
  return rendered.html === testCase.expectedHtml ? null : `${testCase.id}: generated HTML differs`;
}

/**
 * Runs the selected cases of a generated runner whose cases each run in a process: `execute` compiles the case, runs its
 * process and returns the result that the process printed (its `html` decoded). The run prints each case with its elapsed time,
 * removes `temporary` and exits with the status of the run.
 */
export async function runProcessCases(label: string, temporary: string, execute: (testCase: TestCase, id: string) => Promise<CaseResult>): Promise<never> {
  const failures: string[] = [];
  let passed = 0;
  const { cases, filtered } = generatedCases(process.argv.slice(2));
  const progress = stepProgress();
  try {
    for (const testCase of cases) {
      const failed = failures.length;
      progress.start(testCase.id);
      try {
        const actual = await execute(testCase, testCase.id.replaceAll('/', '--'));
        const failure = actual.failure ? `${testCase.id}: ${actual.failure}` : renderFailure(testCase, actual);
        if (failure) failures.push(failure); else passed++;
      } catch (error) {
        const failure = compileFailure(testCase, error);
        if (failure) failures.push(failure); else passed++;
      }
      if (failures.length > failed) progress.fail(testCase.id, undefined, failures.slice(failed).join('\n'));
      else progress.pass(testCase.id);
    }
    progress.close(`${label} generated conformance`);
    if (!filtered) assert.equal(passed + failures.length, cases.length);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return finishRun(label, passed, cases.length, failures);
}

/**
 * Compiles a case as a step of the progress: `compile` throws when the case does not compile. The step fails with the
 * failure of the case, unless the error is the one the case expects, which is a pass of the case: the result is `compiled`,
 * `expected` or `failed`.
 */
export function compileStep(testCase: TestCase, progress: ReturnType<typeof stepProgress>, failures: string[], compile: () => void): 'compiled' | 'expected' | 'failed' {
  const step = `${testCase.id} › compile`;
  progress.start(step);
  try {
    compile();
    progress.pass(step);
    return 'compiled';
  } catch (error) {
    const failure = compileFailure(testCase, error);
    if (failure) {
      failures.push(failure);
      progress.fail(step, undefined, failure);
      return 'failed';
    }
    progress.pass(step);
    return 'expected';
  }
}

/** Prints the failures and the count of passed cases of a generated run, and exits with the status of the run. */
export function finishRun(label: string, passed: number, total: number, failures: readonly string[]): never {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.stdout.write(`${passed}/${total} ${label} generated conformance cases passed\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}
