// The parser of the language service is the Rust core through its WebAssembly binding (src/core.ts). The binding gives
// ranges in UTF-8 bytes; the language service gives the tags and tokens in string indexes (EDT-10) and names the errors
// of a source by its own classes, with the position that the parser counts (ERR-2).
import * as binding from '@polyspec/template/wasm';
import { describe, expect, it } from 'vitest';
import { analyze, analyzePrefix, DelimiterError, OutsideRootError, parse, resolvePath, SourceError } from '../src/core.js';

const range = (item: { start: number; end: number }): [number, number] => [item.start, item.end];

describe('the parser of the core', () => {
  it('gives the tags and tokens of a text that is not ASCII in string indexes, where the binding gives bytes', () => {
    const text = 'é{= a}😀{* c *}{+ "p.tpl"}';
    expect(Array.from(binding.analyze(text, 't').tags, range)).toEqual([[2, 7], [11, 18], [18, 29]]);
    const analysis = analyze(text, 't');
    expect(analysis.tags.map(range)).toEqual([[1, 6], [8, 15], [15, 26]]);
    expect(analysis.tags.map(tag => text.slice(tag.bodyStart, tag.bodyEnd))).toEqual(['= a', '* c *', '+ "p.tpl"']);
    expect(analysis.tokens.map(token => text.slice(token.start, token.end))).toEqual(['{', '=', 'a', '}', '{* c *}', '{', '+', '"p.tpl"', '}']);
  });

  it('gives the same numbers as the binding for a text of ASCII', () => {
    const text = '{= a}{? b}x{/}';
    expect(analyze(text, 't').tags.map(range)).toEqual(Array.from(binding.analyze(text, 't').tags, range));
  });

  it('gives the error of a source that does not parse with its position', () => {
    expect(analyzePrefix('{= }', 't').error).toMatchObject({ code: 'parse_unexpected_token', line: 1, col: 4, offset: 3, end: 4 });
    expect(() => analyze('é\n{= }', 't')).toThrow(SourceError);
    try {
      analyze('é\n{= }', 't');
    } catch (error) {
      expect(error).toMatchObject({ code: 'parse_unexpected_token', line: 2, col: 4, offset: 6 });
    }
  });

  it('finds a surrogate without its pair in the text of the host, which the binding refuses without a position', () => {
    expect(() => binding.analyzePrefix('{= a}x\ud800y', 't')).toThrow(binding.TemplateValueError);
    for (const run of [() => analyzePrefix('{= a}x\ud800y', 't'), () => parse('{= a}x\ud800y', 't')]) {
      try {
        run();
        expect.unreachable('a text with a lone surrogate was accepted');
      } catch (error) {
        expect(error).toBeInstanceOf(SourceError);
        expect(error).toMatchObject({ code: 'lex_invalid_utf8', line: 1, col: 7, offset: 6, end: 7 });
      }
    }
    expect(() => analyzePrefix('é\n\udc00', 't')).toThrow(expect.objectContaining({ line: 2, col: 1, offset: 3 }));
    expect(analyzePrefix('😀{= a}', 't').error).toBeNull();
  });

  it('gives bytes that are not UTF-8 the position of the first such byte', () => {
    const cases: [number[], number][] = [[[0x7b, 0x3d, 0x20, 0x61, 0x7d, 0x61, 0xff, 0x62], 6], [[0x61, 0xc0, 0xaf], 1], [[0xed, 0xa0, 0x80], 0], [[0x0a, 0xe2, 0x82], 1]];
    for (const [bytes, offset] of cases) {
      expect(() => parse(new Uint8Array(bytes), 't')).toThrow(expect.objectContaining({ code: 'lex_invalid_utf8', offset, end: offset + 1 }));
    }
    expect(() => parse(new Uint8Array([0x0a, 0xff]), 't')).toThrow(expect.objectContaining({ line: 2, col: 1 }));
    expect(parse(new TextEncoder().encode('é{= a}😀'), 't').name).toBe('t');
  });

  it('names an invalid delimiters option and a path that leaves the root by its own classes', () => {
    expect(() => analyze('{= a}', 't', { delimiters: 'x' })).toThrow(DelimiterError);
    expect(resolvePath('a/b.tpl', './c.tpl')).toBe('a/c.tpl');
    expect(() => resolvePath('a/b.tpl', '../../c.tpl')).toThrow(OutsideRootError);
  });
});
