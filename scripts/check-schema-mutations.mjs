#!/usr/bin/env node
// Proves that the AST presence check of CNF-15 rejects a case without its AST file and a parse
// error case with an AST file.
import { join, resolve } from 'node:path';
import { astPresenceFailures, readCaseFiles } from './conformance-case-files.mjs';

const root = resolve(import.meta.dirname, '..');
const original = readCaseFiles(join(root, 'tests', 'cases'));
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

if (astPresenceFailures(original).length) throw new Error('the committed cases do not satisfy CNF-15');
for (const [name, mutate] of mutations) {
  const cases = structuredClone(original);
  mutate(cases);
  if (!astPresenceFailures(cases).length) throw new Error(`accepted mutation: ${name}`);
}
process.stdout.write(`[schema] ${mutations.length} AST presence mutations rejected\n`);
