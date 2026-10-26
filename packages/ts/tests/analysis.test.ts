// EDT-10: the public analyzer returns canonical AST, tags and classified ranges.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze, parse, Source, TemplateError, type TemplateAnalysis } from '@polyspec/template';
import { jsonDocument } from '../../../scripts/json-document.mts';

interface Range { kind: string; start: number; end: number }
interface Tag extends Range { echo: boolean; bodyStart: number; bodyEnd: number }
interface Expected { ast: unknown; tags: Tag[]; tokens: Range[] }
const fixture = jsonDocument<{ cases: { id: string; name: string; source: string; expected: Expected }[] }>('analysis contexts', {
  type: 'object', required: ['cases'], $defs: {
    token: { type: 'object', required: ['kind', 'start', 'end'], properties: {
      kind: { type: 'string' }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 },
    } },
    tag: { type: 'object', required: ['kind', 'start', 'end', 'echo', 'bodyStart', 'bodyEnd'], properties: {
      kind: { type: 'string' }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 },
      echo: { type: 'boolean' }, bodyStart: { type: 'integer', minimum: 0 }, bodyEnd: { type: 'integer', minimum: 0 },
    } },
  }, properties: { cases: { type: 'array', minItems: 1, items: {
    type: 'object', required: ['id', 'name', 'source', 'expected'], properties: {
      id: { type: 'string' }, name: { type: 'string' }, source: { type: 'string' },
      expected: { type: 'object', required: ['ast', 'tags', 'tokens'], properties: {
        ast: { type: 'object' }, tags: { type: 'array', items: { $ref: '#/$defs/tag' } }, tokens: { type: 'array', items: { $ref: '#/$defs/token' } },
      } },
    },
  } } },
}).read(fileURLToPath(new URL('../../../tests/fixtures/analysis-context.json', import.meta.url)));

describe('public analysis', () => {
  it('covers every public tag and token kind', () => {
    expect([...new Set(fixture.cases.flatMap(item => item.expected.tags.map(tag => tag.kind)))].sort()).toEqual(
      ['assignment', 'block', 'close', 'comment', 'directive', 'echo', 'else', 'elseif', 'for', 'if', 'ifblock', 'include']);
    expect([...new Set(fixture.cases.flatMap(item => item.expected.tokens.map(token => token.kind)))].sort()).toEqual(
      ['comment', 'delimiter', 'function', 'keyword', 'number', 'operator', 'path', 'property', 'string', 'variable']);
    expect(fixture.cases.some(item => item.source.includes('😀'))).toBe(true);
    for (const item of fixture.cases) {
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
  it.each(fixture.cases)('preserves $id', item => {
    const source = Source.fromText(item.name, item.source);
    const result: TemplateAnalysis = analyze(item.source, item.name);
    expect({
      ast: result.ast,
      tags: result.tags.map(tag => ({ ...tag, start: source.byteAt(tag.start), end: source.byteAt(tag.end),
        bodyStart: source.byteAt(tag.bodyStart), bodyEnd: source.byteAt(tag.bodyEnd) })),
      tokens: result.tokens.map(token => ({ ...token, start: source.byteAt(token.start), end: source.byteAt(token.end) })),
    }).toEqual(item.expected);
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
