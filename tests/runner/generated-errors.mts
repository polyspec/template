// The error of a generated case as the generated runners compare it with expected.error.json: a thrown error, or the
// error that a generated program reported, with its code, template, line and column. An error without one of them has
// no position, which fails the case by name instead of being compared with a stand-in position.
import { errorField, type ExpectedError, firstDifference } from './cases.mts';
import { parsedJsonObject } from './checked.mts';

/** The error of a case with its position. */
export interface PositionedError {
  code: string;
  template: string;
  line: number;
  col: number;
}

/**
 * The difference between the expected error of a case and the `error` of its `step` (compile or render), or null when
 * they are equal: an error without a code or a case without an expected error is an unexpected failure of the step, and
 * an error without its template, line or column names the missing part.
 */
export function errorDifference(expected: ExpectedError | null, error: unknown, step: string): string | null {
  const code = errorField(error, 'code');
  if (expected === null || typeof code !== 'string') return `unexpected ${step} failure`;
  const template = errorField(error, 'template');
  const line = errorField(error, 'line');
  const col = errorField(error, 'col');
  if (typeof template !== 'string' || typeof line !== 'number' || typeof col !== 'number') {
    return `the ${step} error ${code} has no position: template ${JSON.stringify(template)}, line ${JSON.stringify(line)}, col ${JSON.stringify(col)}`;
  }
  const actual: PositionedError = { code, template, line, col };
  return firstDifference(expected, actual);
}

/** The result that the case process of a generated PHP or Python program prints as JSON. */
export interface CaseResult {
  html?: string;
  error?: unknown;
  failure?: string;
}

/** The result of a case process, parsed from its standard output `text`; `language` names the process in an error. */
export function parsedCaseResult(text: string, language: string): CaseResult {
  const value = parsedJsonObject(text, `the ${language} result ${JSON.stringify(text)}`);
  const result: CaseResult = {};
  for (const key of ['html', 'failure'] as const) {
    const field = value[key];
    if (field === undefined) continue;
    if (typeof field !== 'string') throw new Error(`the ${language} result has a ${key} that is no string: ${text}`);
    result[key] = field;
  }
  if ('error' in value) result.error = value.error;
  return result;
}
