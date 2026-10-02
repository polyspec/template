// Indentation of lines by the nesting of HTML elements and template blocks, and the html error.
import { describe, expect, it } from 'vitest';
import { format, type FormatOptions, type FormatResult } from '../src/index.js';

function text(result: FormatResult): string {
  if (!result.ok) throw new Error(`format failed: ${JSON.stringify(result.error)}`);
  return result.text;
}

function lines(...items: string[]): string {
  return items.join('\n');
}

function formatted(source: string, options: FormatOptions = {}): string {
  const once = text(format(source, options));
  expect(format(once, options)).toEqual({ ok: true, text: once, changed: false });
  return once;
}

const BOARD = lines(
  '<div class="board-list">',
  '<h2>{= t["list.heading"]}</h2>',
  '{? length(p.props.posts) == 0}',
  '<p>{= t["list.empty"]}</p>',
  '{:}',
  '<ul>',
  '{@ post = p.props.posts}',
  '<li><a href="{= post.href}">{= post.title}</a></li>',
  '{/}',
  '</ul>',
  '{/}',
  '</div>',
  '',
);

describe('indentation', () => {
  it('indents HTML elements and template blocks by two spaces', () => {
    expect(formatted(BOARD)).toBe(lines(
      '<div class="board-list">',
      '  <h2>{= t["list.heading"]}</h2>',
      '  {? length(p.props.posts) == 0}',
      '    <p>{= t["list.empty"]}</p>',
      '  {:}',
      '    <ul>',
      '      {@ post = p.props.posts}',
      '        <li><a href="{= post.href}">{= post.title}</a></li>',
      '      {/}',
      '    </ul>',
      '  {/}',
      '</div>',
      '',
    ));
  });

  it('gives template blocks no level with templateBlocks flat', () => {
    expect(formatted(BOARD, { templateBlocks: 'flat' })).toBe(lines(
      '<div class="board-list">',
      '  <h2>{= t["list.heading"]}</h2>',
      '  {? length(p.props.posts) == 0}',
      '  <p>{= t["list.empty"]}</p>',
      '  {:}',
      '  <ul>',
      '    {@ post = p.props.posts}',
      '    <li><a href="{= post.href}">{= post.title}</a></li>',
      '    {/}',
      '  </ul>',
      '  {/}',
      '</div>',
      '',
    ));
  });

  it('uses the indent unit and replaces existing indentation', () => {
    const source = lines('<ul>', '        <li>a</li>', '\t<li>b</li>', '</ul>');
    expect(formatted(source, { indent: '\t' })).toBe(lines('<ul>', '\t<li>a</li>', '\t<li>b</li>', '</ul>'));
    expect(formatted(source, { indent: '    ' })).toBe(lines('<ul>', '    <li>a</li>', '    <li>b</li>', '</ul>'));
  });

  it('keeps every line with indent null and formats only the tags', () => {
    expect(formatted('<ul>\n        <li>{=a}</li>\n</ul>', { indent: null })).toBe('<ul>\n        <li>{= a}</li>\n</ul>');
  });

  it('rejects an indent unit that is not spaces or one tab', () => {
    expect(() => format('<p></p>', { indent: ' \t' })).toThrow(/indent/);
    expect(() => format('<p></p>', { indent: '' })).toThrow(/indent/);
  });

  it('empties blank lines and keeps the text after the indentation', () => {
    expect(formatted('<div>\n   \n  a   b  \n</div>')).toBe('<div>\n\n  a   b  \n</div>');
  });

  it('keeps the indentation inside pre, textarea, script, style and comments, including the end tag line', () => {
    const source = lines(
      '<div>',
      '<pre>',
      '    code {= x}',
      '</pre>',
      '<textarea>',
      '   <b>text</b>',
      '   </textarea>',
      '<script>',
      '  if (a < b) { f("</div>"); }',
      '    </script>',
      '<style>',
      '      p { color: red; }',
      '</style>',
      '<!--',
      '        <div>',
      '-->',
      '<p>a</p>',
      '</div>',
    );
    expect(formatted(source)).toBe(lines(
      '<div>',
      '  <pre>',
      '    code {= x}',
      '</pre>',
      '  <textarea>',
      '   <b>text</b>',
      '   </textarea>',
      '  <script>',
      '  if (a < b) { f("</div>"); }',
      '    </script>',
      '  <style>',
      '      p { color: red; }',
      '</style>',
      '  <!--',
      '        <div>',
      '-->',
      '  <p>a</p>',
      '</div>',
    ));
  });

  it('indents the lines of a multi-line start tag one level more and keeps lines inside quoted values', () => {
    const source = lines(
      '<div>',
      '<input',
      'type="text"',
      '      name="q">',
      '<p title="first',
      '      second">x</p>',
      '</div>',
    );
    expect(formatted(source)).toBe(lines(
      '<div>',
      '  <input',
      '    type="text"',
      '    name="q">',
      '  <p title="first',
      '      second">x</p>',
      '</div>',
    ));
  });

  it('keeps the continuation lines of a tag that spans lines', () => {
    const source = lines('<div>', '{= a +', '      b}', '</div>');
    expect(formatted(source)).toBe(lines('<div>', '  {= a +', '      b}', '</div>'));
  });

  it('opens no element for void elements, self-closing tags, doctype and processing instructions', () => {
    const source = lines('<!DOCTYPE html>', '<div>', '<br>', '<img src="a.png" />', '<svg><path d="M0"/></svg>', '<p>x</p>', '</div>');
    expect(formatted(source)).toBe(lines('<!DOCTYPE html>', '<div>', '  <br>', '  <img src="a.png" />', '  <svg><path d="M0"/></svg>', '  <p>x</p>', '</div>'));
  });

  it('accepts branches that open the same elements and indents each branch from the start of the block', () => {
    const source = lines('<main>', '{? a}', '<div class="x">', '{:}', '<div class="y">', '{/}', '<p>{= b}</p>', '</div>', '</main>');
    expect(formatted(source)).toBe(lines('<main>', '  {? a}', '    <div class="x">', '  {:}', '    <div class="y">', '  {/}', '    <p>{= b}</p>', '  </div>', '</main>'));
  });

  it('reads template tags inside a start tag and end tags in any letter case', () => {
    const source = lines('<DIV {? a}class="x"{/}>', '<span>{= b}</span>', '</div>');
    expect(formatted(source)).toBe(lines('<DIV {? a}class="x"{/}>', '  <span>{= b}</span>', '</div>'));
  });

  it('indents with custom delimiters and keeps a byte order mark and CRLF', () => {
    expect(formatted('﻿<ul>\r\n[@ x = xs]\r\n<li>[= x]</li>\r\n[/]\r\n</ul>\r\n', { delimiters: '[]' }))
      .toBe('﻿<ul>\r\n  [@ x = xs]\r\n    <li>[= x]</li>\r\n  [/]\r\n</ul>\r\n');
  });

  it('indents only the lines that start inside the range', () => {
    const source = lines('<ul>', '<li>a</li>', '<li>{=b}</li>', '</ul>');
    const start = source.indexOf('<li>{=b}');
    expect(text(format(source, { range: { start, end: source.length } }))).toBe(lines('<ul>', '<li>a</li>', '  <li>{= b}</li>', '</ul>'));
  });
});

describe('html error', () => {
  function htmlError(source: string): { line: number; col: number; message: string } {
    const result = format(source);
    if (result.ok || result.error.reason !== 'html') throw new Error(`expected an html error: ${JSON.stringify(result)}`);
    expect(result.error.code).toBeNull();
    return result.error;
  }

  it('reports an end tag that does not match the open element', () => {
    expect(htmlError('<div>\n<p>a</div>')).toMatchObject({ line: 2, col: 5 });
  });

  it('reports an element that is not closed', () => {
    expect(htmlError('<ul>\n<li>a\n</ul>')).toMatchObject({ line: 3, col: 1 });
    expect(htmlError('<div>\n<p>a</p>')).toMatchObject({ line: 1, col: 1 });
  });

  it('reports branches that end with different elements and a block without else that changes the elements', () => {
    expect(htmlError('{? a}<div class="x">{:}<p>{/}\n</div>')).toMatchObject({ line: 1, col: 27 });
    expect(htmlError('{? a}<div>{/}\n</div>')).toMatchObject({ line: 1, col: 11 });
    expect(htmlError('{? a}<div>{:? b}<div>{/}\n</div>')).toMatchObject({ line: 1, col: 22 });
  });

  it('changes nothing for an html error, and indent null formats the same source', () => {
    expect(text(format('<div>\n<p>{=a}</div>', { indent: null }))).toBe('<div>\n<p>{= a}</div>');
  });
});
