// The tokens of the conformance cases (CNF-16): every case whose input parses has the tokens of expected.tokens.json, the
// EDT-8 tokens of analyze() as [start, end, type] with UTF-8 byte offsets counted after the byte order mark (FMT-1,
// FMT-2), and a case whose input does not parse has no such file. Each case is a top-level test named by its id, as the
// suite unit tokens of config/parity.json reads the results.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { analyze, Source } from '../src/index.js';
import { casesDir } from './helpers.js';

function caseIds(): string[] {
  return readdirSync(casesDir, { withFileTypes: true })
    .filter(group => group.isDirectory())
    .flatMap(group => readdirSync(join(casesDir, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `${group.name}/${entry.name}`))
    .sort((a, b) => a.localeCompare(b));
}

for (const id of caseIds()) {
  const dir = join(casesDir, id);
  it(id, () => {
    const expectedPath = join(dir, 'expected.tokens.json');
    if (!existsSync(join(dir, 'expected.ast.json'))) {
      expect(existsSync(expectedPath)).toBe(false);
      return;
    }
    const optionsPath = join(dir, 'options.json');
    const delimiters = existsSync(optionsPath) ? (JSON.parse(readFileSync(optionsPath, 'utf8')) as { delimiters?: string }).delimiters : undefined;
    const source = new Uint8Array(readFileSync(join(dir, 'input.tpl')));
    const { tokens } = analyze(source, 'input.tpl', delimiters === undefined ? {} : { delimiters });
    const text = Source.fromBytes('input.tpl', source);
    const actual = tokens.map(token => [text.byteAt(token.start), text.byteAt(token.end), token.kind]);
    expect(actual).toEqual(JSON.parse(readFileSync(expectedPath, 'utf8')));
  });
}
