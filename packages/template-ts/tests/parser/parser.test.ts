// Parser behavior that the fixtures do not cover directly.
import { describe, expect, it } from 'vitest';
import { parse, TemplateError } from '../../src/index.js';

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
