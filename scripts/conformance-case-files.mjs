// Reads the expected files of the conformance cases and checks the presence rules of CNF-2 and CNF-15 and, with the
// schemas of schema/, the content of the token and format files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Returns one record per case directory: its id, whether it has an AST file, its expected error and the content of its
 * token and format files, or null for an absent file.
 */
export function readCaseFiles(casesDir) {
  const cases = [];
  if (!existsSync(casesDir)) return cases;
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(casesDir, group.name, entry.name);
      const read = name => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null);
      cases.push({
        id: `${group.name}/${entry.name}`,
        hasAst: existsSync(join(dir, 'expected.ast.json')),
        expectedError: read('expected.error.json'),
        tokens: read('expected.tokens.json'),
        format: read('expected.format.json'),
      });
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

/** Whether the expected error is a lexical or parse error of the entry template, which has no AST. */
function entryParseError(expectedError) {
  return expectedError !== null && expectedError.template === 'input.tpl' && /^E_(LEX|PARSE)_/.test(String(expectedError.code));
}

/** CNF-15: a case has expected.ast.json exactly when its entry template parses. */
export function astPresenceFailures(cases) {
  const failures = [];
  for (const testCase of cases) {
    const parseError = entryParseError(testCase.expectedError);
    if (!testCase.hasAst && !parseError) failures.push(`${testCase.id}: expected.ast.json is missing`);
    if (testCase.hasAst && parseError) failures.push(`${testCase.id}: expected.ast.json exists although input.tpl has the parse error ${testCase.expectedError.code}`);
  }
  return failures;
}

/**
 * The Ajv validators of schema/tokens.schema.json and schema/format.schema.json, which hold the shape of the token and
 * format files of CNF-2.
 */
export function caseFileValidators(ajv, root) {
  const compile = name => ajv.compile(JSON.parse(readFileSync(join(root, 'schema', name), 'utf8')));
  return { tokens: compile('tokens.schema.json'), format: compile('format.schema.json') };
}

const describe = validate => validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');

// The first token of a schema-valid token array that is empty or starts before the end of the token before it: CNF-2
// sorts the tokens and lets none overlap, which JSON Schema cannot express.
function orderDefect(tokens) {
  let previousEnd = 0;
  for (const [index, [start, end]] of tokens.entries()) {
    if (end <= start) return `token ${index} has no byte range start < end`;
    if (start < previousEnd) return `token ${index} starts before the end of the token before it`;
    previousEnd = end;
  }
  return null;
}

/** CNF-2, CNF-15: a case has expected.tokens.json and expected.format.json exactly when it has expected.ast.json. */
export function formatFileFailures(cases, validators) {
  const failures = [];
  for (const testCase of cases) {
    for (const [name, value] of [['expected.tokens.json', testCase.tokens], ['expected.format.json', testCase.format]]) {
      if (testCase.hasAst && value === null) failures.push(`${testCase.id}: ${name} is missing`);
      if (!testCase.hasAst && value !== null) failures.push(`${testCase.id}: ${name} exists although the case has no expected.ast.json`);
    }
    if (testCase.tokens !== null) {
      if (!validators.tokens(testCase.tokens)) failures.push(`${testCase.id}: expected.tokens.json: ${describe(validators.tokens)}`);
      else {
        const defect = orderDefect(testCase.tokens);
        if (defect) failures.push(`${testCase.id}: expected.tokens.json ${defect}`);
      }
    }
    if (testCase.format !== null && !validators.format(testCase.format)) failures.push(`${testCase.id}: expected.format.json: ${describe(validators.format)}`);
  }
  return failures;
}
