// EDT-10: the public analyzer returns canonical AST, tags and classified ranges.
import { describe, expect, it } from 'vitest';
import { analyze, parse, Source, TemplateError, type TemplateAnalysis } from '@polyspec/template';
import { analysisFixtures, projectRanges } from './analysis-fixtures.js';

const cases = analysisFixtures('analysis-context.json', 'full');

describe('public analysis', () => {
  it('covers every public tag and token kind', () => {
    expect([...new Set(cases.flatMap(item => item.expected.tags.map(tag => tag.kind)))].sort()).toEqual(
      ['assignment', 'block', 'close', 'comment', 'directive', 'echo', 'else', 'elseif', 'for', 'if', 'ifblock', 'include']);
    expect([...new Set(cases.flatMap(item => item.expected.tokens.map(token => token.kind)))].sort()).toEqual(
      ['comment', 'delimiter', 'function', 'keyword', 'number', 'operator', 'path', 'property', 'string', 'variable']);
    expect(cases.some(item => item.source.includes('😀'))).toBe(true);
    for (const item of cases) {
      const bytes = Source.fromText(item.name, item.source).bytes;
      for (const tag of item.expected.tags) {
        expect(tag.start).toBeLessThanOrEqual(tag.bodyStart);
        expect(tag.bodyStart).toBeLessThanOrEqual(tag.bodyEnd);
        expect(tag.bodyEnd).toBeLessThanOrEqual(tag.end);
        expect(tag.end).toBeLessThanOrEqual(bytes.length);
      }
      let end = 0;
      for (const token of item.expected.tokens) {
        expect(token.start).toBeGreaterThanOrEqual(end);
        expect(token.end).toBeGreaterThan(token.start);
        expect(token.end).toBeLessThanOrEqual(bytes.length);
        end = token.end;
      }
    }
  });
  it.each(cases)('preserves $id', item => {
    const source = Source.fromText(item.name, item.source);
    const result: TemplateAnalysis = analyze(item.source, item.name);
    expect({ ast: result.ast, ...projectRanges(source, result) }).toEqual(item.expected);
    expect(result.ast).toEqual(parse(item.source, item.name));
  });
  it('rejects an incomplete source with the parser error', () => {
    expect(() => analyze('{? x}', 'invalid.tpl')).toThrow(TemplateError);
    try { analyze('{? x}', 'invalid.tpl'); }
    catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      expect(error.code).toBe('E_PARSE_UNCLOSED_BLOCK');
    }
  });
});
