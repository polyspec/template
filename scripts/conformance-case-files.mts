// Reads the expected files of the conformance cases and checks the presence rules of CNF-2 and CNF-15 and, with the
// schemas of contracts/schema/, the content of the token and format files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ajv, JSONSchemaType, Schema, ValidateFunction } from 'ajv';
import { caseIds, casesDir } from '../tests/runner/case-list.mts';
import { jsonDocument, readJson } from './json-document.mts';

// A JSON Schema of contracts/schema, which ajv compiles.
const schemaObjectDocument = jsonDocument<Record<string, unknown>>('JSON Schema', { type: 'object' });

/** The expected error of a case that the runners compare: the kind, the template and the 1-based position. */
export interface ExpectedError {
  code: string;
  template: string;
  line: number;
  col: number;
}

/**
 * The failure of a case as expected.error.json writes it (F-3 of the plan, ERR-1): `raises` with the kind, the HTTP
 * status (none for a template error), the category of the kind, the message that a rule fixes (none here) and the
 * properties that the case compares, the template and the position of ERR-3.
 */
export interface ExpectedRaises {
  raises: {
    kind: string;
    status: string | null;
    category: string;
    message: string | null;
    properties: { template: string; line: number; col: number };
  };
}

/** The schema of the raises object, which the filesystem cases also use for their expected failure. */
export const RAISES_SCHEMA: Schema = {
  type: 'object',
  required: ['kind', 'status', 'category', 'message', 'properties'],
  properties: {
    kind: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
    // A template error has no HTTP status, and ERR-3 compares no message.
    status: { type: 'string', nullable: true },
    category: { type: 'string', enum: ['value', 'type', 'io', 'store', 'busy', 'internal'] },
    message: { type: 'string', nullable: true },
    properties: {
      type: 'object',
      required: ['template', 'line', 'col'],
      properties: { template: { type: 'string' }, line: { type: 'integer' }, col: { type: 'integer' } },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const raisesDocument = jsonDocument<ExpectedRaises>('expected error', {
  type: 'object',
  required: ['raises'],
  properties: { raises: RAISES_SCHEMA },
  additionalProperties: false,
});

/** The error that a runner compares, from the raises object of a case. */
export function expectedErrorOf(raises: ExpectedRaises['raises']): ExpectedError {
  return { code: raises.kind, ...raises.properties };
}

/**
 * The category of each kind, from the error table of the interface contract (packages/rust/interface.json, design E-1):
 * a variant `polyspec_template::ErrorCode::E_<KIND>` has the kind `<kind>`.
 */
export function kindCategories(root: string): Map<string, string> {
  const contract = readJson(join(root, 'packages/rust/interface.json'));
  const rows = (contract as { errors?: { kinds?: { variant: string; category: string }[] } }).errors?.kinds;
  if (rows === undefined) throw new Error('packages/rust/interface.json has no errors.kinds');
  return new Map(rows.map(row => [row.variant.replace(/^.*::E_/, '').toLowerCase(), row.category]));
}

/** The expected.error.json of an error that an implementation wrote, with the category of its kind. */
export function raisesOf(error: ExpectedError, categories: Map<string, string>): ExpectedRaises {
  const category = categories.get(error.code);
  if (category === undefined) throw new Error(`the kind ${error.code} is not in the error table of packages/rust/interface.json`);
  return {
    raises: {
      kind: error.code,
      status: null,
      category,
      message: null,
      properties: { template: error.template, line: error.line, col: error.col },
    },
  };
}

/** The former form of expected.error.json, which the cases of the legacy packages keep: the code `E_<KIND>`. */
const legacyErrorDocument = jsonDocument<ExpectedError>('expected error of a legacy case', {
  type: 'object',
  required: ['code', 'template', 'line', 'col'],
  properties: { code: { type: 'string', pattern: '^E_[A-Z0-9_]+$' }, template: { type: 'string' }, line: { type: 'integer' }, col: { type: 'integer' } },
  additionalProperties: false,
});

/** The error of a legacy case, with the kind of its code `E_<KIND>`. */
export function legacyExpectedError(error: ExpectedError): ExpectedError {
  return { ...error, code: error.code.slice(2).toLowerCase() };
}

/** The expected.error.json of a case, as the error that a runner compares; a legacy case has the former form. */
export const expectedErrorDocument = {
  parse: (text: string, source: string): ExpectedError =>
    /"raises"\s*:/.test(text) ? expectedErrorOf(raisesDocument.parse(text, source).raises) : legacyExpectedError(legacyErrorDocument.parse(text, source)),
  read: (path: string): ExpectedError => expectedErrorDocument.parse(readFileSync(path, 'utf8'), path),
};

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
    const read = (name: string): unknown => (existsSync(join(dir, name)) ? readJson(join(dir, name)) : null);
    const errorPath = join(dir, 'expected.error.json');
    return {
      id,
      hasAst: existsSync(join(dir, 'expected.ast.json')),
      expectedError: existsSync(errorPath) ? expectedErrorDocument.read(errorPath) : null,
      tokens: read('expected.tokens.json'),
      format: read('expected.format.json'),
    };
  });
}

/** Whether the expected error is a lexical or parse error of the entry template, which has no AST. */
function entryParseError(expectedError: ExpectedError): boolean {
  return expectedError.template === 'input.tpl' && /^(lex|parse)_/.test(expectedError.code);
}

/** CNF-15: a case has expected.ast.json exactly when its entry template parses. */
export function astPresenceFailures(cases: readonly CaseFile[]): string[] {
  const failures: string[] = [];
  for (const testCase of cases) {
    const parseError = testCase.expectedError !== null && entryParseError(testCase.expectedError) ? testCase.expectedError.code : null;
    if (!testCase.hasAst && parseError === null) failures.push(`${testCase.id}: expected.ast.json is missing`);
    if (testCase.hasAst && parseError !== null) failures.push(`${testCase.id}: expected.ast.json exists although input.tpl has the parse error ${parseError}`);
  }
  return failures;
}

/**
 * The Ajv validators of contracts/schema/tokens.schema.json and contracts/schema/format.schema.json, which hold the shape of the token and
 * format files of CNF-2, with the Ajv instance that describes their errors.
 */
export function caseFileValidators(ajv: Ajv, root: string): CaseFileValidators {
  const schema = (name: string): Record<string, unknown> => schemaObjectDocument.read(join(root, 'contracts', 'schema', name));
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
