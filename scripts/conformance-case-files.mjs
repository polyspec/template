// Reads the expected files of the conformance cases and checks the presence rule of CNF-2 and CNF-15.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Returns one record per case directory: its id, whether it has an AST file and its expected error. */
export function readCaseFiles(casesDir) {
  const cases = [];
  if (!existsSync(casesDir)) return cases;
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(casesDir, group.name, entry.name);
      const errorPath = join(dir, 'expected.error.json');
      cases.push({
        id: `${group.name}/${entry.name}`,
        hasAst: existsSync(join(dir, 'expected.ast.json')),
        expectedError: existsSync(errorPath) ? JSON.parse(readFileSync(errorPath, 'utf8')) : null,
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
