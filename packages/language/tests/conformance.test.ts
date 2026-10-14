// The format results of the conformance cases (CNF-18): every case whose input parses formats to the entries of its
// expected.format.json, with the default options (indent) and with indent null (keep); a case whose input does not
// parse, also one that is not UTF-8, has no such file and formats to the parse error. The bytes are formatted as the
// command formats them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { caseIds, caseOptions, casesDir } from '../../../tests/runner/case-list.mts';
import { formatBytes } from '../src/cli/main.js';
import type { FormatOptions, FormatResult } from '../src/index.js';

type Expected = { text: string } | { error: { reason: string; code: string | null; line: number; col: number } };

function outcome(result: FormatResult): Expected {
  if (result.ok) return { text: result.text };
  const { reason, code, line, col } = result.error;
  return { error: { reason, code, line, col } };
}

// Each case is a top-level test named by its id, as the suite unit formatting of config/parity.json reads the results.
it.each(caseIds())('%s', id => {
  const dir = join(casesDir, id);
  const { delimiters } = caseOptions(id);
  const options: FormatOptions = delimiters === undefined ? {} : { delimiters };
  const expectedPath = join(dir, 'expected.format.json');
  const bytes = readFileSync(join(dir, 'input.tpl'));
  const indent = formatBytes(bytes, 'input.tpl', options);
  const keep = formatBytes(bytes, 'input.tpl', { ...options, indent: null });
  if (!existsSync(join(dir, 'expected.ast.json'))) {
    expect(existsSync(expectedPath)).toBe(false);
    expect([indent.ok || indent.error.reason, keep.ok || keep.error.reason]).toEqual(['parse', 'parse']);
    return;
  }
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as { indent: Expected; keep: Expected };
  expect({ indent: outcome(indent), keep: outcome(keep) }).toEqual(expected);
});
