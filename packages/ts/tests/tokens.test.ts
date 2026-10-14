// The tokens of the conformance cases (CNF-17): every case whose input parses has the tokens of expected.tokens.json, the
// EDT-8 tokens of analyze() as [start, end, type] with UTF-8 byte offsets counted after the byte order mark (FMT-1,
// FMT-2), and a case whose input does not parse has no such file. Each case is a top-level test named by its id, as the
// suite unit tokens of config/parity.json reads the results.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { caseIds, caseOptions, casesDir } from '../../../tests/runner/case-list.mts';
import { analyze, Source } from '../src/index.js';

it.each(caseIds())('%s', id => {
  const dir = join(casesDir, id);
  const expectedPath = join(dir, 'expected.tokens.json');
  if (!existsSync(join(dir, 'expected.ast.json'))) {
    expect(existsSync(expectedPath)).toBe(false);
    return;
  }
  const { delimiters } = caseOptions(id);
  const source = new Uint8Array(readFileSync(join(dir, 'input.tpl')));
  const { tokens } = analyze(source, 'input.tpl', delimiters === undefined ? {} : { delimiters });
  const text = Source.fromBytes('input.tpl', source);
  const actual = tokens.map(token => [text.byteAt(token.start), text.byteAt(token.end), token.kind]);
  expect(actual).toEqual(JSON.parse(readFileSync(expectedPath, 'utf8')));
});
