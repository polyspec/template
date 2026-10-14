#!/usr/bin/env node
// Proves that the presence checks of CNF-15 reject a case without its AST, token or format file, a parse error case
// with such a file, and that schema/tokens.schema.json, schema/format.schema.json and the token order check reject a
// token or format file without the content of CNF-2.
import { resolve } from 'node:path';
import Ajv from 'ajv';
import { astPresenceFailures, caseFileValidators, formatFileFailures, readCaseFiles } from './conformance-case-files.mjs';

const root = resolve(import.meta.dirname, '..');
const validators = caseFileValidators(new Ajv({ strict: true, allErrors: true }), root);
const original = readCaseFiles();
const withAst = original.find(testCase => testCase.hasAst);
const parseError = original.find(testCase => !testCase.hasAst);
if (!withAst || !parseError) throw new Error('the case set has no AST case or no parse error case');

const mutations = [
  ['missing expected.ast.json', cases => { cases.find(testCase => testCase.id === withAst.id).hasAst = false; }],
  ['expected.ast.json for a parse error', cases => { cases.find(testCase => testCase.id === parseError.id).hasAst = true; }],
  ['parse error of an included template', cases => {
    const testCase = cases.find(item => item.id === withAst.id);
    testCase.hasAst = false;
    testCase.expectedError = { code: 'E_PARSE_UNEXPECTED_TOKEN', template: 'part.tpl', line: 1, col: 1 };
  }],
];

// The mutations of the token and format files of the first AST case.
const fileMutations = [
  ['missing expected.tokens.json', testCase => { testCase.tokens = null; }],
  ['missing expected.format.json', testCase => { testCase.format = null; }],
  ['token file that is no array', testCase => { testCase.tokens = { 0: [0, 1, 'delimiter'] }; }],
  ['token with two members', testCase => { testCase.tokens = [[0, 1]]; }],
  ['token with four members', testCase => { testCase.tokens = [[0, 1, 'delimiter', 'x']]; }],
  ['token with an unknown type', testCase => { testCase.tokens = [[0, 1, 'name']]; }],
  ['token with a negative offset', testCase => { testCase.tokens = [[-1, 1, 'delimiter']]; }],
  ['token with a fractional offset', testCase => { testCase.tokens = [[0, 1.5, 'delimiter']]; }],
  ['token with a string offset', testCase => { testCase.tokens = [['0', 1, 'delimiter']]; }],
  ['token that ends before it starts', testCase => { testCase.tokens = [[2, 1, 'delimiter']]; }],
  ['empty token', testCase => { testCase.tokens = [[1, 1, 'delimiter']]; }],
  ['unsorted tokens', testCase => { testCase.tokens = [[2, 3, 'keyword'], [0, 1, 'delimiter']]; }],
  ['overlapping tokens', testCase => { testCase.tokens = [[0, 2, 'delimiter'], [1, 3, 'keyword']]; }],
  ['format without keep', testCase => { testCase.format = { indent: { text: '' } }; }],
  ['format with another mode', testCase => { testCase.format = { indent: { text: '' }, keep: { text: '' }, tab: { text: '' } }; }],
  ['format result that is neither text nor error', testCase => { testCase.format = { indent: {}, keep: { text: '' } }; }],
  ['format text that is no string', testCase => { testCase.format = { indent: { text: 1 }, keep: { text: '' } }; }],
  ['format error with an unknown reason', testCase => { testCase.format = { indent: { error: { reason: 'lex', code: null, line: 1, col: 1 } }, keep: { text: '' } }; }],
  ['format error without col', testCase => { testCase.format = { indent: { error: { reason: 'html', code: null, line: 1 } }, keep: { text: '' } }; }],
  ['format error with a numeric code', testCase => { testCase.format = { indent: { error: { reason: 'html', code: 1, line: 1, col: 1 } }, keep: { text: '' } }; }],
  ['format error with line 0', testCase => { testCase.format = { indent: { error: { reason: 'html', code: null, line: 0, col: 1 } }, keep: { text: '' } }; }],
  ['format error with a fractional col', testCase => { testCase.format = { indent: { error: { reason: 'html', code: null, line: 1, col: 1.5 } }, keep: { text: '' } }; }],
  ['format error with a message', testCase => { testCase.format = { indent: { error: { reason: 'html', code: null, line: 1, col: 1, message: 'x' } }, keep: { text: '' } }; }],
  ['format result with text and error', testCase => { testCase.format = { indent: { text: '', error: { reason: 'html', code: null, line: 1, col: 1 } }, keep: { text: '' } }; }],
];

if (astPresenceFailures(original).length) throw new Error('the committed cases do not satisfy CNF-15');
if (formatFileFailures(original, validators).length) throw new Error(`the committed token and format files do not satisfy CNF-2: ${formatFileFailures(original, validators).join('; ')}`);
for (const [name, mutate] of mutations) {
  const cases = structuredClone(original);
  mutate(cases);
  if (!astPresenceFailures(cases).length) throw new Error(`accepted mutation: ${String(name)}`);
}
for (const [name, mutate] of fileMutations) {
  const cases = structuredClone(original);
  mutate(cases.find(testCase => testCase.id === withAst.id));
  if (!formatFileFailures(cases, validators).length) throw new Error(`accepted mutation: ${String(name)}`);
}
for (const [name, mutate] of [
  ['expected.tokens.json for a parse error', testCase => { testCase.tokens = []; }],
  ['expected.format.json for a parse error', testCase => { testCase.format = { indent: { text: '' }, keep: { text: '' } }; }],
]) {
  const cases = structuredClone(original);
  mutate(cases.find(testCase => testCase.id === parseError.id));
  if (!formatFileFailures(cases, validators).length) throw new Error(`accepted mutation: ${String(name)}`);
}
process.stdout.write(`[schema] ${mutations.length} AST presence mutations and ${fileMutations.length + 2} token and format file mutations rejected\n`);
