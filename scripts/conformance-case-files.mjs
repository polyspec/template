// Reads the expected files of the conformance cases and checks the presence rules of CNF-2 and CNF-15 and the content
// of the token and format files.
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

// The token types of EDT-8 and the format error reasons of FMT-14.
const TOKEN_TYPES = new Set(['delimiter', 'keyword', 'variable', 'property', 'function', 'string', 'number', 'operator', 'comment', 'path']);
const REASONS = new Set(['parse', 'invariant', 'html']);

const isOffset = value => Number.isInteger(value) && value >= 0;
const keysAre = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();

// The first defect of a token array of CNF-2: [start, end, type] with byte offsets, sorted and not overlapping.
function tokensDefect(tokens) {
  if (!Array.isArray(tokens)) return 'is no array';
  let previousEnd = 0;
  for (const [index, token] of tokens.entries()) {
    if (!Array.isArray(token) || token.length !== 3) return `token ${index} is no [start, end, type]`;
    const [start, end, type] = token;
    if (!isOffset(start) || !isOffset(end) || end <= start) return `token ${index} has no byte range start < end`;
    if (!TOKEN_TYPES.has(type)) return `token ${index} has the type ${JSON.stringify(type)}, which EDT-8 does not define`;
    if (start < previousEnd) return `token ${index} starts before the end of the token before it`;
    previousEnd = end;
  }
  return null;
}

// The first defect of a format result of CNF-2: {text} or {error: {reason, code, line, col}}.
function resultDefect(result) {
  if (keysAre(result, ['text'])) return typeof result.text === 'string' ? null : 'has a text that is no string';
  if (!keysAre(result, ['error'])) return 'is neither {text} nor {error}';
  const { error } = result;
  if (!keysAre(error, ['reason', 'code', 'line', 'col'])) return 'has an error without exactly reason, code, line and col';
  if (!REASONS.has(error.reason)) return `has the reason ${JSON.stringify(error.reason)}, which FMT-14 does not define`;
  if (error.code !== null && typeof error.code !== 'string') return 'has a code that is neither a string nor null';
  if (!Number.isInteger(error.line) || !Number.isInteger(error.col)) return 'has a line or col that is no integer';
  return null;
}

/** CNF-2, CNF-15: a case has expected.tokens.json and expected.format.json exactly when it has expected.ast.json. */
export function formatFileFailures(cases) {
  const failures = [];
  for (const testCase of cases) {
    for (const [name, value] of [['expected.tokens.json', testCase.tokens], ['expected.format.json', testCase.format]]) {
      if (testCase.hasAst && value === null) failures.push(`${testCase.id}: ${name} is missing`);
      if (!testCase.hasAst && value !== null) failures.push(`${testCase.id}: ${name} exists although the case has no expected.ast.json`);
    }
    if (testCase.tokens !== null) {
      const defect = tokensDefect(testCase.tokens);
      if (defect) failures.push(`${testCase.id}: expected.tokens.json ${defect}`);
    }
    if (testCase.format !== null) {
      if (!keysAre(testCase.format, ['indent', 'keep'])) failures.push(`${testCase.id}: expected.format.json has not exactly the keys indent and keep`);
      else {
        for (const mode of ['indent', 'keep']) {
          const defect = resultDefect(testCase.format[mode]);
          if (defect) failures.push(`${testCase.id}: expected.format.json ${mode} ${defect}`);
        }
      }
    }
  }
  return failures;
}
