// Reads the expected files of the conformance cases and checks the presence rules of CNF-2 and CNF-15 and, with the
// schemas of contracts/schema/, the content of the token and format files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ajv, ValidateFunction } from 'ajv';
import { caseIds, casesDir } from '../tests/runner/case-list.mts';

/** The expected error of a case as expected.error.json holds it. */
export interface ExpectedError {
  template?: unknown;
  code?: unknown;
  line?: unknown;
  col?: unknown;
}

/** The expected files of one case; an absent file is null. */
export interface CaseFile {
  id: string;
  hasAst: boolean;
  expectedError: ExpectedError | null;
  tokens: unknown;
  format: unknown;
}

/** A token of expected.tokens.json: `[start, end, type]` with byte offsets (CNF-2). */
type Token = [number, number, string];

/** The validators of the token and format files with the Ajv instance that describes their errors. */
export interface CaseFileValidators {
  ajv: Ajv;
  tokens: ValidateFunction<Token[]>;
  format: ValidateFunction;
}

/**
 * Returns one record per case directory: its id, whether it has an AST file, its expected error and the content of its
 * token and format files, or null for an absent file.
 */
export function readCaseFiles(): CaseFile[] {
  if (!existsSync(casesDir)) return [];
  return caseIds().map(id => {
    const dir = join(casesDir, id);
    const read = (name: string): unknown => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null);
    return {
      id,
      hasAst: existsSync(join(dir, 'expected.ast.json')),
      expectedError: read('expected.error.json') as ExpectedError | null,
      tokens: read('expected.tokens.json'),
      format: read('expected.format.json'),
    };
  });
}

/** Whether the expected error is a lexical or parse error of the entry template, which has no AST. */
function entryParseError(expectedError: ExpectedError | null): boolean {
  return expectedError !== null && expectedError.template === 'input.tpl' && /^E_(LEX|PARSE)_/.test(String(expectedError.code));
}

/** CNF-15: a case has expected.ast.json exactly when its entry template parses. */
export function astPresenceFailures(cases: readonly CaseFile[]): string[] {
  const failures: string[] = [];
  for (const testCase of cases) {
    const parseError = entryParseError(testCase.expectedError);
    if (!testCase.hasAst && !parseError) failures.push(`${testCase.id}: expected.ast.json is missing`);
    if (testCase.hasAst && parseError) failures.push(`${testCase.id}: expected.ast.json exists although input.tpl has the parse error ${String(testCase.expectedError?.code)}`);
  }
  return failures;
}

/**
 * The Ajv validators of contracts/schema/tokens.schema.json and contracts/schema/format.schema.json, which hold the shape of the token and
 * format files of CNF-2, with the Ajv instance that describes their errors.
 */
export function caseFileValidators(ajv: Ajv, root: string): CaseFileValidators {
  const schema = (name: string): object => JSON.parse(readFileSync(join(root, 'contracts', 'schema', name), 'utf8')) as object;
  return { ajv, tokens: ajv.compile<Token[]>(schema('tokens.schema.json')), format: ajv.compile(schema('format.schema.json')) };
}

// The first token of a schema-valid token array that is empty or starts before the end of the token before it: CNF-2
// sorts the tokens and lets none overlap, which JSON Schema cannot express.
function orderDefect(tokens: readonly Token[]): string | null {
  let previousEnd = 0;
  for (const [index, [start, end]] of tokens.entries()) {
    if (end <= start) return `token ${index} has no byte range start < end`;
    if (start < previousEnd) return `token ${index} starts before the end of the token before it`;
    previousEnd = end;
  }
  return null;
}

/** CNF-2, CNF-15: a case has expected.tokens.json and expected.format.json exactly when it has expected.ast.json. */
export function formatFileFailures(cases: readonly CaseFile[], validators: CaseFileValidators): string[] {
  const failures: string[] = [];
  for (const testCase of cases) {
    for (const [name, value] of [['expected.tokens.json', testCase.tokens], ['expected.format.json', testCase.format]] as const) {
      if (testCase.hasAst && value === null) failures.push(`${testCase.id}: ${name} is missing`);
      if (!testCase.hasAst && value !== null) failures.push(`${testCase.id}: ${name} exists although the case has no expected.ast.json`);
    }
    if (testCase.tokens !== null) {
      if (!validators.tokens(testCase.tokens)) failures.push(`${testCase.id}: expected.tokens.json: ${validators.ajv.errorsText(validators.tokens.errors)}`);
      else {
        const defect = orderDefect(testCase.tokens);
        if (defect) failures.push(`${testCase.id}: expected.tokens.json ${defect}`);
      }
    }
    if (testCase.format !== null && !validators.format(testCase.format)) failures.push(`${testCase.id}: expected.format.json: ${validators.ajv.errorsText(validators.format.errors)}`);
  }
  return failures;
}
