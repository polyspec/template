// Expected formatter output, idempotency and error results.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, type FormatResult } from '../src/index.js';
import { sameTree } from '../src/invariant.js';
import { fixtures } from './helpers.js';

function text(result: FormatResult): string {
  if (!result.ok) throw new Error(`format failed: ${JSON.stringify(result.error)}`);
  return result.text;
}

describe('fixtures', () => {
  const names = readdirSync(join(fixtures, 'input')).filter(name => name.endsWith('.tpl')).sort();
  it('has an expected file for every input', () => {
    expect(readdirSync(join(fixtures, 'expected')).filter(name => name.endsWith('.tpl')).sort()).toEqual(names);
  });
  for (const name of names) {
    const input = readFileSync(join(fixtures, 'input', name), 'utf8');
    const expected = readFileSync(join(fixtures, 'expected', name), 'utf8');
    it(`formats ${name}`, () => {
      expect(text(format(input, { name }))).toBe(expected);
    });
    it(`is idempotent on ${name}`, () => {
      const once = text(format(input, { name }));
      const twice = format(once, { name });
      expect(twice).toEqual({ ok: true, text: once, changed: false });
    });
  }
});

describe('format', () => {
  it('reports an unchanged source', () => {
    expect(format('<p>{= a}</p>')).toEqual({ ok: true, text: '<p>{= a}</p>', changed: false });
  });

  it('keeps a byte order mark and CRLF line terminators', () => {
    const source = '\uFEFF<ul>\r\n{@ x=xs}\r\n<li>{=x}</li>\r\n{/}\r\n</ul>\r\n';
    expect(text(format(source))).toBe('\uFEFF<ul>\r\n  {@ x = xs}\r\n    <li>{= x}</li>\r\n  {/}\r\n</ul>\r\n');
  });

  it('formats only the tags inside a range', () => {
    const source = '{=a}{=b}{=c}';
    expect(text(format(source, { range: { start: 4, end: 8 } }))).toBe('{=a}{= b}{=c}');
  });

  it('formats with the delimiter option', () => {
    expect(text(format('[= a[0]+1]\n[= [1,2][1]]', { delimiters: '[]' }))).toBe('[= a[0] + 1]\n[= [1, 2][1]]');
  });

  it('formats a wrapped tag with same-character delimiters', () => {
    expect(text(format('var page = ";;=json(page)|raw;;";', { delimiters: ';;' }))).toBe('var page = ";;= json(page) | raw;;";');
  });

  it('returns the parser error position for a source that does not parse', () => {
    expect(format('<p>\n  {? a}\n</p>', { name: 'x.tpl' })).toEqual({
      ok: false,
      error: { reason: 'parse', code: 'E_PARSE_UNCLOSED_BLOCK', line: 2, col: 3, message: expect.any(String) },
    });
  });

  it('never changes a comment', () => {
    const source = '{*   a   *}{**}';
    expect(format(source)).toEqual({ ok: true, text: source, changed: false });
  });
});

describe('sameTree', () => {
  it('ignores spans and key order', () => {
    expect(sameTree({ type: 'Var', name: 'a', span: [0, 1] }, { span: [4, 5], name: 'a', type: 'Var' })).toBe(true);
  });

  it('detects a different value', () => {
    expect(sameTree({ type: 'Text', value: 'a ', span: [0, 2] }, { type: 'Text', value: 'a', span: [0, 1] })).toBe(false);
  });

  it('detects a different list length', () => {
    expect(sameTree({ body: [1, 2] }, { body: [1] })).toBe(false);
  });
});
