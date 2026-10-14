// The format results of the conformance cases (CNF-17): every case whose input parses formats to the entries of its
// expected.format.json, with the default options (indent) and with indent null (keep); a case whose input does not
// parse has no such file and formats to the parse error.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, type FormatOptions, type FormatResult } from '../src/index.js';
import { repositoryRoot } from './helpers.js';

const casesDir = join(repositoryRoot, 'tests', 'cases');

type Expected = { text: string } | { error: { reason: string; code: string | null; line: number; col: number } };

function caseIds(): string[] {
  return readdirSync(casesDir, { withFileTypes: true })
    .filter(group => group.isDirectory())
    .flatMap(group => readdirSync(join(casesDir, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `${group.name}/${entry.name}`))
    .sort((a, b) => a.localeCompare(b));
}

function outcome(result: FormatResult): Expected {
  if (result.ok) return { text: result.text };
  const { reason, code, line, col } = result.error;
  return { error: { reason, code, line, col } };
}

describe('conformance cases', () => {
  for (const id of caseIds()) {
    const dir = join(casesDir, id);
    it(`${id} format`, () => {
      const optionsPath = join(dir, 'options.json');
      const delimiters = existsSync(optionsPath) ? (JSON.parse(readFileSync(optionsPath, 'utf8')) as { delimiters?: string }).delimiters : undefined;
      const options: FormatOptions = delimiters === undefined ? { name: 'input.tpl' } : { name: 'input.tpl', delimiters };
      const expectedPath = join(dir, 'expected.format.json');
      // format() takes text; a source that is not UTF-8 does not parse (E_LEX_INVALID_UTF8), as the command reports.
      let source: string;
      try {
        source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(join(dir, 'input.tpl')));
      } catch {
        expect(existsSync(expectedPath)).toBe(false);
        return;
      }
      const indent = format(source, options);
      const keep = format(source, { ...options, indent: null });
      if (!existsSync(join(dir, 'expected.ast.json'))) {
        expect(existsSync(expectedPath)).toBe(false);
        expect([indent.ok || indent.error.reason, keep.ok || keep.error.reason]).toEqual(['parse', 'parse']);
        return;
      }
      const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as { indent: Expected; keep: Expected };
      expect({ indent: outcome(indent), keep: outcome(keep) }).toEqual(expected);
    });
  }
});
