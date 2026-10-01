// Block constructs and parse errors with string positions, and their agreement with the AST spans.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from '@polyspec/template';
import { describe, expect, it } from 'vitest';
import { constructAt, templateStructure, type Construct } from '../src/index.js';
import { repositoryRoot, templateFiles } from './helpers.js';

function constructs(source: string): Construct[] {
  const result = templateStructure(source);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.constructs;
}

describe('templateStructure', () => {
  it('returns the tags of an if construct in source order', () => {
    const source = '{? a}x{:? b}y{:}z{/}';
    expect(constructs(source)).toEqual([{
      kind: 'if', start: 0, end: 20,
      tags: [
        { kind: 'if', start: 0, end: 5 },
        { kind: 'elseif', start: 6, end: 12 },
        { kind: 'else', start: 13, end: 16 },
        { kind: 'close', start: 17, end: 20 },
      ],
    }]);
  });

  it('returns every tag in source order, including tags outside constructs and after a byte order mark', () => {
    const source = '\uFEFF{* note *}{: n = 1}{= n}{? n}{+ "p.tpl"}{/}{# box}';
    const result = templateStructure(source);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.tags.map(tag => [tag.kind, source.slice(tag.start, tag.end)])).toEqual([
      ['comment', '{* note *}'], ['assignment', '{: n = 1}'], ['echo', '{= n}'], ['if', '{? n}'], ['include', '{+ "p.tpl"}'], ['close', '{/}'], ['block', '{# box}'],
    ]);
  });

  it('assigns branch and close tags to the innermost construct', () => {
    const source = '{@ x = xs}{? x}a{:}b{/}{:}none{/}';
    const [loop, condition] = constructs(source);
    expect(loop?.tags.map(tag => source.slice(tag.start, tag.end))).toEqual(['{@ x = xs}', '{:}', '{/}']);
    expect(condition?.tags.map(tag => source.slice(tag.start, tag.end))).toEqual(['{? x}', '{:}', '{/}']);
    expect(loop?.tags[1]?.start).toBe(23);
  });

  it('includes if-blocks and wrapped tags', () => {
    const source = '<!-- {{?# head}} -->x<!-- {{/}} -->';
    expect(constructs(source)).toEqual([{
      kind: 'ifblock', start: 0, end: 35,
      tags: [{ kind: 'ifblock', start: 0, end: 20 }, { kind: 'close', start: 21, end: 35 }],
    }]);
  });

  it('returns the parse error at string positions after multi-byte text and a byte order mark', () => {
    const source = '﻿<p>제목</p>\n<b>{/}</b>';
    const result = templateStructure(source);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'E_PARSE_UNEXPECTED_CLOSE', line: 2, col: 4 }) });
    if (result.ok) return;
    expect(source.slice(result.error.start, result.error.start + 3)).toBe('{/}');
    expect(result.error.end).toBeGreaterThan(result.error.start);
  });

  it('reports an unclosed block at its opening tag', () => {
    const result = templateStructure('<p>\n  {? a}\n</p>');
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'E_PARSE_UNCLOSED_BLOCK', line: 2, col: 3, start: 6 }) });
  });

  it('reports a misplaced else tag', () => {
    expect(templateStructure('a{:}b')).toEqual({ ok: false, error: expect.objectContaining({ code: 'E_PARSE_ELSE_OUTSIDE_BLOCK', start: 1 }) });
  });

  it('uses the delimiter option', () => {
    expect(templateStructure('[= a][? b]x[/]', { delimiters: '[]' })).toEqual({
      ok: true,
      tags: [{ kind: 'echo', start: 0, end: 5 }, { kind: 'if', start: 5, end: 10 }, { kind: 'close', start: 11, end: 14 }],
      constructs: [expect.objectContaining({ kind: 'if', start: 5, end: 14 })],
    });
  });
});

describe('constructAt', () => {
  const source = '{? a}x{:}y{/}';
  const list = constructs(source);
  it('finds the construct of a tag, including the position after the tag', () => {
    expect(constructAt(list, 0)?.tag).toBe(0);
    expect(constructAt(list, 5)?.tag).toBe(0);
    expect(constructAt(list, 7)?.tag).toBe(1);
    expect(constructAt(list, 12)?.tag).toBe(2);
  });
  it('returns null outside tags', () => {
    expect(constructAt(constructs('{? a}xyz{/}'), 6)).toBeNull();
  });
});

// Collects the [start, end] byte spans of block nodes and of if-branch opening tags.
function blockSpans(nodes: unknown[], blocks: string[], branches: string[]): void {
  for (const node of nodes as Record<string, unknown>[]) {
    if (node.type === 'If' || node.type === 'For' || node.type === 'IfBlock') blocks.push(JSON.stringify(node.span));
    if (node.type === 'If') {
      for (const branch of node.branches as { span: number[]; body: unknown[] }[]) {
        branches.push(JSON.stringify(branch.span));
        blockSpans(branch.body, blocks, branches);
      }
    }
    for (const key of ['body', 'else', 'empty']) {
      if (node.type !== 'If' || key !== 'body') {
        const child = node[key];
        if (Array.isArray(child)) blockSpans(child, blocks, branches);
      }
    }
  }
}

describe('agreement with the AST', () => {
  const files = templateFiles(join(repositoryRoot, 'tests/cases'));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const optionsPath = join(dirname(file), 'options.json');
    const delimiters = existsSync(optionsPath) ? (JSON.parse(readFileSync(optionsPath, 'utf8')) as { delimiters?: string }).delimiters : undefined;
    const options = delimiters === undefined ? {} : { delimiters };
    it(file.slice(repositoryRoot.length + 1), () => {
      const result = templateStructure(source, options);
      let ast;
      try {
        ast = parse(source, 'x.tpl', options);
      } catch {
        expect(result.ok).toBe(false);
        return;
      }
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const text = source.startsWith('﻿') ? source.slice(1) : source;
      const shift = source.length - text.length;
      const bytes = (index: number): number => Buffer.byteLength(text.slice(0, index - shift));
      const blocks: string[] = [];
      const branches: string[] = [];
      blockSpans(ast.body, blocks, branches);
      expect(result.constructs.map(item => JSON.stringify([bytes(item.start), bytes(item.end)])).sort()).toEqual(blocks.sort());
      const opening = result.constructs.flatMap(item => item.tags.filter(tag => tag.kind === 'if' || tag.kind === 'elseif'));
      expect(opening.map(tag => JSON.stringify([bytes(tag.start), bytes(tag.end)])).sort()).toEqual(branches.sort());
    });
  }
});
