// The language service document: diagnostics, tags, tokens, constructs, folding, highlights, matching tags and line
// indentation (EDT-4 to EDT-13), and the agreement of its constructs with the AST spans.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from '@polyspec/template';
import { describe, expect, it } from 'vitest';
import { openDocument, type TemplateDocument } from '../src/index.js';
import { repositoryRoot, templateFiles } from './helpers.js';

function slices(document: TemplateDocument, ranges: ReadonlyArray<{ start: number; end: number }>): string[] {
  return ranges.map(range => document.text.slice(range.start, range.end));
}

describe('constructs', () => {
  it('returns the tags of an if construct in source order', () => {
    expect(openDocument('{? a}x{:? b}y{:}z{/}').constructs).toEqual([{
      kind: 'if', start: 0, end: 20,
      tags: [
        { kind: 'if', start: 0, end: 5 },
        { kind: 'elseif', start: 6, end: 12 },
        { kind: 'else', start: 13, end: 16 },
        { kind: 'close', start: 17, end: 20 },
      ],
    }]);
  });

  it('assigns branch and close tags to the innermost construct', () => {
    const document = openDocument('{@ x = xs}{? x}a{:}b{/}{:}none{/}');
    const [loop, condition] = document.constructs;
    expect(slices(document, loop?.tags ?? [])).toEqual(['{@ x = xs}', '{:}', '{/}']);
    expect(slices(document, condition?.tags ?? [])).toEqual(['{? x}', '{:}', '{/}']);
  });

  it('includes if-blocks and wrapped tags', () => {
    expect(openDocument('<!-- {{?# head}} -->x<!-- {{/}} -->').constructs).toEqual([{
      kind: 'ifblock', start: 0, end: 35,
      tags: [{ kind: 'ifblock', start: 0, end: 20 }, { kind: 'close', start: 21, end: 35 }],
    }]);
  });

  it('leaves out a construct that is not closed', () => {
    const document = openDocument('{@ x = xs}{? x}a{/}');
    expect(document.constructs.map(construct => construct.kind)).toEqual(['if']);
  });
});

describe('tags and diagnostics', () => {
  it('lists every tag except comments, after a byte order mark', () => {
    const document = openDocument('﻿{* note *}{:n = 1}{= n}{? n}{+ "p.tpl"}{/}{# box}');
    expect(document.diagnostics).toEqual([]);
    expect(document.tags.map(tag => [tag.kind, document.text.slice(tag.start, tag.end)])).toEqual([
      ['assignment', '{:n = 1}'], ['echo', '{= n}'], ['if', '{? n}'], ['include', '{+ "p.tpl"}'], ['close', '{/}'], ['block', '{# box}'],
    ]);
  });

  it('reports the parse error at string positions after multi-byte text and a byte order mark', () => {
    const document = openDocument('﻿<p>제목</p>\n<b>{/}</b>');
    const [diagnostic] = document.diagnostics;
    expect(diagnostic).toMatchObject({ code: 'E_PARSE_UNEXPECTED_CLOSE', severity: 'error', source: 'polyspec-template' });
    expect(document.text.slice(diagnostic?.start, (diagnostic?.start ?? 0) + 3)).toBe('{/}');
    expect(diagnostic?.end).toBeGreaterThan(diagnostic?.start ?? 0);
  });

  it('reports an unclosed block at its opening tag and keeps every tag of the text', () => {
    const document = openDocument('<p>\n  {? a}\n  {= b}\n</p>');
    expect(document.diagnostics).toEqual([expect.objectContaining({ code: 'E_PARSE_UNCLOSED_BLOCK', start: 6, end: 7 })]);
    expect(slices(document, document.tags)).toEqual(['{? a}', '{= b}']);
    expect(document.constructs).toEqual([]);
  });

  it('keeps the tags before a tag that fails', () => {
    const document = openDocument('{= a}{= b +}{= c}');
    expect(document.diagnostics[0]?.code).toBe('E_PARSE_UNEXPECTED_TOKEN');
    expect(slices(document, document.tags)).toEqual(['{= a}']);
  });

  it('uses the delimiter option', () => {
    const document = openDocument('[= a][? b]x[/]', { delimiters: '[]' });
    expect(document.tags).toEqual([{ kind: 'echo', start: 0, end: 5 }, { kind: 'if', start: 5, end: 10 }, { kind: 'close', start: 11, end: 14 }]);
  });
});

describe('tokens', () => {
  function tokens(text: string, options = {}): string[] {
    const document = openDocument(text, options);
    return document.tokens.map(token => `${token.type} ${text.slice(token.start, token.end)}`);
  }

  it('classifies delimiters, sigils, names, properties, functions, literals and operators', () => {
    expect(tokens('{? length(p.props.posts) == 0}')).toEqual([
      'delimiter {', 'keyword ?', 'function length', 'operator (', 'variable p', 'property .props', 'property .posts', 'operator )', 'operator ==', 'number 0', 'delimiter }',
    ]);
    expect(tokens('{= t["a"] | escape}')).toEqual(['delimiter {', 'keyword =', 'variable t', 'operator [', 'string "a"', 'operator ]', 'operator |', 'function escape', 'delimiter }']);
    expect(tokens('{? a == true}')).toEqual(['delimiter {', 'keyword ?', 'variable a', 'operator ==', 'keyword true', 'delimiter }']);
  });

  it('classifies loop and assignment names, include paths, block words, directives and comments', () => {
    expect(tokens('{@ post = posts}{/}')).toEqual(['delimiter {', 'keyword @', 'variable post', 'operator =', 'variable posts', 'delimiter }', 'delimiter {', 'keyword /', 'delimiter }']);
    expect(tokens('{:n += 1}')).toEqual(['delimiter {', 'keyword :', 'variable n', 'operator +=', 'number 1', 'delimiter }']);
    expect(tokens('{+ parts/head.tpl}{+ "a b.tpl"}')).toEqual(['delimiter {', 'keyword +', 'path parts/head.tpl', 'delimiter }', 'delimiter {', 'keyword +', 'string "a b.tpl"', 'delimiter }']);
    expect(tokens('{# head "parts/head.tpl" title}')).toEqual(['delimiter {', 'keyword #', 'path head', 'string "parts/head.tpl"', 'path title', 'delimiter }']);
    expect(tokens('{% delimiter []}[= a]')).toEqual(['delimiter {', 'keyword %', 'keyword delimiter', 'string []', 'delimiter }', 'delimiter [', 'keyword =', 'variable a', 'delimiter ]']);
    expect(tokens('{* note *}')).toEqual(['comment {* note *}']);
  });

  it('classifies the wrapper of a wrapped tag as delimiter and keeps tokens sorted and apart', () => {
    expect(tokens('<!-- {{?# head}} -->')).toEqual(['delimiter <!-- {{', 'keyword ?#', 'variable head', 'delimiter }} -->']);
    const document = openDocument('<a href="{= a.b}">{? c}{= d(1, "x")}{/}</a>');
    for (const [index, token] of document.tokens.entries()) {
      expect(token.end).toBeGreaterThan(token.start);
      if (index > 0) expect(token.start).toBeGreaterThanOrEqual((document.tokens[index - 1] as { end: number }).end);
    }
  });

  it('keeps the tokens of a text whose block is not closed', () => {
    expect(tokens('{? a}{= b}')).toEqual(['delimiter {', 'keyword ?', 'variable a', 'delimiter }', 'delimiter {', 'keyword =', 'variable b', 'delimiter }']);
  });
});

describe('folding, highlights and matching tags', () => {
  it('folds constructs whose close tag is on a later line', () => {
    const document = openDocument('{@ x = xs}\n{? x}\na\n{/}\n{/}\n{? y}b{/}\n');
    expect(document.foldingRanges()).toEqual([{ startLine: 0, endLine: 3 }, { startLine: 1, endLine: 2 }]);
  });

  it('highlights every tag of the construct under the index, including the index after a tag', () => {
    const document = openDocument('{? a}x{:? b}y{:}z{/}');
    expect(slices(document, document.highlights(14))).toEqual(['{? a}', '{:? b}', '{:}', '{/}']);
    expect(slices(document, document.highlights(5))).toEqual(['{? a}', '{:? b}', '{:}', '{/}']);
    expect(document.highlights(13 - 1)).toEqual(document.highlights(12));
    expect(openDocument('{? a}xyz{/}').highlights(6)).toEqual([]);
  });

  it('moves to the next tag of the construct and from outside tags to the next tag of the enclosing construct', () => {
    const document = openDocument('{? a}x{:}yy{/}');
    expect(document.matchingTag(0)).toBe(6);
    expect(document.matchingTag(7)).toBe(11);
    expect(document.matchingTag(13)).toBe(0);
    expect(document.matchingTag(9)).toBe(11);
    expect(openDocument('plain').matchingTag(2)).toBeNull();
  });

  it('converts between lines and string indexes', () => {
    const document = openDocument('a\r\nb\nc');
    expect(document.lineCount).toBe(3);
    expect([document.lineStart(1), document.lineStart(2)]).toEqual([3, 5]);
    expect([document.lineOf(0), document.lineOf(2), document.lineOf(3), document.lineOf(6)]).toEqual([0, 0, 1, 2]);
    expect(() => document.lineStart(3)).toThrow(RangeError);
  });
});

describe('line indentation', () => {
  const options = { indent: '  ' };

  it('gives a typed line the depth of the elements and blocks open before it', () => {
    const document = openDocument('<ul>\n{@ x = xs}\n\n{/}\n</ul>');
    expect([0, 1, 2, 3, 4].map(line => document.lineIndentation(line, options))).toEqual(['', '  ', '    ', '  ', '']);
    const typing = openDocument('<ul>\n  {@ x = xs}\nx');
    expect(typing.lineIndentation(2, options)).toBe('    ');
    expect(typing.lineIndentation(2, { indent: '\t', templateBlocks: 'flat' })).toBe('\t');
  });

  it('does not require a balanced structure and dedents end tags and branch tags', () => {
    const document = openDocument('<div>\n<p>\ntext\n</div>\n{? a}\n<b>\n{:}\n');
    expect([2, 3, 5, 6].map(line => document.lineIndentation(line, options))).toEqual(['    ', '', '  ', '']);
  });

  it('indents a blank line, which Enter creates, by the same depth', () => {
    expect(openDocument('<ul>\n').lineIndentation(1, options)).toBe('  ');
    expect(openDocument('<ul>\n    \n</ul>').lineIndentation(1, options)).toBe('  ');
    expect(openDocument('<ul>\n{@ x = xs}\n').lineIndentation(2, options)).toBe('    ');
    expect(openDocument('<ul>\n{@ x = xs}\n').lineIndentation(2, { indent: '  ', templateBlocks: 'flat' })).toBe('  ');
  });

  it('keeps the indentation of a line inside pre', () => {
    expect(openDocument('<pre>\n   x\n</pre>').lineIndentation(1, options)).toBe('   ');
  });

  it('rejects an indent unit that is not spaces or one tab', () => {
    expect(() => openDocument('a').lineIndentation(0, { indent: ' \t' })).toThrow(RangeError);
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
      const document = openDocument(source, options);
      let ast;
      try {
        ast = parse(source, 'x.tpl', options);
      } catch {
        expect(document.diagnostics).toHaveLength(1);
        return;
      }
      expect(document.diagnostics).toEqual([]);
      const text = source.startsWith('﻿') ? source.slice(1) : source;
      const shift = source.length - text.length;
      const bytes = (index: number): number => Buffer.byteLength(text.slice(0, index - shift));
      const blocks: string[] = [];
      const branches: string[] = [];
      blockSpans(ast.body, blocks, branches);
      expect(document.constructs.map(item => JSON.stringify([bytes(item.start), bytes(item.end)])).sort()).toEqual(blocks.sort());
      const opening = document.constructs.flatMap(item => item.tags.filter(tag => tag.kind === 'if' || tag.kind === 'elseif'));
      expect(opening.map(tag => JSON.stringify([bytes(tag.start), bytes(tag.end)])).sort()).toEqual(branches.sort());
      for (const [index, token] of document.tokens.entries()) {
        expect(token.end).toBeGreaterThan(token.start);
        if (index > 0) expect(token.start).toBeGreaterThanOrEqual((document.tokens[index - 1] as { end: number }).end);
      }
    });
  }
});
