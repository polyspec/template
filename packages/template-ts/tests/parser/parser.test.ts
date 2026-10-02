// Parser behavior that the fixtures do not cover directly.
import { describe, expect, it } from 'vitest';
import { analyze, analyzePrefix, parse, TemplateError } from '../../src/index.js';

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof TemplateError) return error.code;
    throw error;
  }
}

describe('tag start rule', () => {
  it('leaves JavaScript and CSS braces as text', () => {
    const ast = parse('{/* c */}{/re/.test(s)}.a { @media x { } }{ x = 1 }', 't.tpl');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]?.type).toBe('Text');
  });
  it('starts a tag for the sigil forms', () => {
    const ast = parse('{= a}{@ i = xs}{/}{? a}{:}{/}', 't.tpl');
    expect(ast.body.map(node => node.type)).toEqual(['Echo', 'For', 'If']);
  });
});

describe('delimiters', () => {
  it('accepts the engine option and the directive', () => {
    expect(parse(';= a;', 't.tpl', { delimiters: ';;' }).body[0]?.type).toBe('Echo');
    const ast = parse('{% delimiter [] }\n[= a[0]]\n', 't.tpl');
    expect(ast.body.map(node => node.type)).toEqual(['Echo', 'Text']);
  });
  it('rejects a directive that is not the first tag', () => {
    expect(codeOf(() => parse('{= a}{% delimiter ;;}', 't.tpl'))).toBe('E_PARSE_INVALID_DIRECTIVE');
    expect(codeOf(() => parse('{% delimiter ab}', 't.tpl'))).toBe('E_PARSE_INVALID_DIRECTIVE');
  });
});

describe('block structure', () => {
  it('reports the structural errors', () => {
    expect(codeOf(() => parse('{/}', 't.tpl'))).toBe('E_PARSE_UNEXPECTED_CLOSE');
    expect(codeOf(() => parse('{? a}', 't.tpl'))).toBe('E_PARSE_UNCLOSED_BLOCK');
    expect(codeOf(() => parse('{:}', 't.tpl'))).toBe('E_PARSE_ELSE_OUTSIDE_BLOCK');
    expect(codeOf(() => parse('{? a}{:}{:}{/}', 't.tpl'))).toBe('E_PARSE_DUPLICATE_ELSE');
    expect(codeOf(() => parse('{? a}{:}{:? b}{/}', 't.tpl'))).toBe('E_PARSE_ELSEIF_AFTER_ELSE');
    expect(codeOf(() => parse('{?# a}{:? b}{/}', 't.tpl'))).toBe('E_PARSE_ELSEIF_NOT_IN_IF');
  });
});

describe('spans', () => {
  it('counts bytes, not code units', () => {
    const ast = parse('é{= a}', 't.tpl');
    expect(ast.body[1]?.span).toEqual([2, 7]);
  });
});

describe('syntax analysis', () => {
  it('returns only parser-accepted tag ranges and their grammar kinds', () => {
    const source = '<style>.a { @media x { } }</style>{/re/.test(s)}{= title}{? ok}yes{:}no{/}';
    const result = analyze(source, 't.tpl');
    expect(result.tags.map(tag => ({ source: source.slice(tag.start, tag.end), kind: tag.kind }))).toEqual([
      { source: '{= title}', kind: 'echo' },
      { source: '{? ok}', kind: 'if' },
      { source: '{:}', kind: 'else' },
      { source: '{/}', kind: 'close' },
    ]);
    expect(result.ast.body.map(node => node.type)).toEqual(['Text', 'Echo', 'If']);
    expect(result.tokens.map(token => ({ source: source.slice(token.start, token.end), kind: token.kind }))).toEqual([
      { source: 'title', kind: 'variable' },
      { source: 'ok', kind: 'variable' },
    ]);
  });
});

describe('prefix analysis', () => {
  const kinds = (source: string, result: ReturnType<typeof analyzePrefix>): string[] => result.tags.map(tag => `${tag.kind} ${source.slice(tag.start, tag.end)}`);

  it('returns every tag and token and no error for a source that parses', () => {
    const source = '{? a}{= b.c}{/}';
    const result = analyzePrefix(source, 't.tpl');
    expect(result.error).toBeNull();
    expect(result.tags).toEqual(analyze(source, 't.tpl').tags);
    expect(result.tokens).toEqual(analyze(source, 't.tpl').tokens);
  });

  it('returns every tag of a source whose block is not closed, with the parser error', () => {
    const source = '<ul>{@ x = xs}<li>{= x}</li>';
    const result = analyzePrefix(source, 't.tpl');
    expect(result.error).toBeInstanceOf(TemplateError);
    expect(result.error?.code).toBe('E_PARSE_UNCLOSED_BLOCK');
    expect(kinds(source, result)).toEqual(['for {@ x = xs}', 'echo {= x}']);
    // The loop variable and its `=` belong to the loop tag, not to an expression.
    expect(result.tokens.map(token => source.slice(token.start, token.end))).toEqual(['xs', 'x']);
  });

  it('returns the tags before a tag that fails and the tokens read until the error', () => {
    const source = '{= a}{? b}{= c +}{= d}{/}';
    const result = analyzePrefix(source, 't.tpl');
    expect(result.error?.code).toBe('E_PARSE_UNEXPECTED_TOKEN');
    expect(kinds(source, result)).toEqual(['echo {= a}', 'if {? b}']);
    expect(result.tokens.map(token => source.slice(token.start, token.end))).toEqual(['a', 'b', 'c', '+']);
  });

  it('uses the delimiter option', () => {
    const source = '[? a]x';
    expect(kinds(source, analyzePrefix(source, 't.tpl', { delimiters: '[]' }))).toEqual(['if [? a]']);
  });
});
