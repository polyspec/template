// The server through its protocol over standard input and output: capabilities (EDT-14), the editor fixtures (EDT-17)
// and the conversion of UTF-16 positions (EDT-5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDocument, TOKEN_TYPES } from '@polyspec/template-language';
import type { Position, SemanticTokens, TextEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error The fixture script is plain JavaScript without declarations.
import { editorResults, fixtureDirectory, fixtureNames, queryIndexes } from '../../../scripts/editor-fixtures.mjs';
import { Client } from './client.js';
import { decodeTokens, serverResults, SPACES } from './results.js';

const names = (fixtureNames as () => string[])();
const expectedOf = (text: string): unknown => (editorResults as (document: unknown) => unknown)(openDocument(text));
const indexesOf = (text: string): number[] => (queryIndexes as (document: unknown) => number[])(openDocument(text));
const uriOf = (name: string): string => pathToFileURL(join(fixtureDirectory as string, name)).href;

// A text with a byte order mark, CRLF line ends, characters outside the ASCII range and the BMP and a comment over two lines.
const UNICODE = '﻿<ul title="é😀">\r\n{@ x = xs}\r\n<li>{= x | upper}😀{= "é"}</li>{* a\r\nb *}\r\n{/}\r\n</ul>\r\n';

let client: Client;
let version = 0;
const unique = (name: string): string => `file:///work/${++version}/${name}`;

beforeAll(async () => {
  client = await Client.start({ configuration: true, multiline: true });
});
afterAll(async () => {
  expect(await client.stop()).toBe(0);
});

describe('initialize', () => {
  it('declares the capabilities of EDT-14', () => {
    expect(client.initialized?.capabilities).toEqual({
      positionEncoding: 'utf-16',
      textDocumentSync: { openClose: true, change: 1 },
      semanticTokensProvider: { legend: { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [] }, full: true },
      foldingRangeProvider: true,
      documentHighlightProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      documentOnTypeFormattingProvider: { firstTriggerCharacter: '\n', moreTriggerCharacter: ['>', '}'] },
    });
    expect(client.initialized?.serverInfo?.name).toBe('template-lsp');
  });
});

describe('editor fixtures', () => {
  it('has fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });
  for (const name of names) {
    it(name, async () => {
      const text = readFileSync(join(fixtureDirectory as string, name), 'utf8');
      const expected = JSON.parse(readFileSync(join(fixtureDirectory as string, name.replace(/\.tpl$/, '.json')), 'utf8')) as { matchingTags: Record<string, unknown> };
      const indexes = Object.keys(expected.matchingTags).map(Number);
      expect(await serverResults(client, uriOf(name), text, indexes)).toEqual(expected);
    });
  }
});

describe('positions', () => {
  it('converts UTF-16 positions of a text with a byte order mark, CRLF and astral characters', async () => {
    expect(await serverResults(client, unique('unicode.tpl'), UNICODE, indexesOf(UNICODE))).toEqual(expectedOf(UNICODE));
  });

  it('splits a token over several lines for a client without multilineTokenSupport', async () => {
    const single = await Client.start({ configuration: true, multiline: false });
    try {
      const uri = unique('unicode.tpl');
      await single.open(uri, UNICODE);
      const text = TextDocument.create(uri, 'polyspec-template', 1, UNICODE);
      const { data } = await single.request<SemanticTokens>('textDocument/semanticTokens/full', { textDocument: { uri } });
      const tokens = decodeTokens(text, data, TOKEN_TYPES);
      const comment = UNICODE.indexOf('{*');
      expect(tokens.filter(token => token[2] === 'comment')).toEqual([
        [comment, UNICODE.indexOf('\r\n', comment), 'comment'],
        [UNICODE.indexOf('b *}'), UNICODE.indexOf('*}') + 2, 'comment'],
      ]);
      const expected = (expectedOf(UNICODE) as { tokens: unknown[] }).tokens.filter(token => (token as string[])[2] !== 'comment');
      expect(tokens.filter(token => token[2] !== 'comment')).toEqual(expected);
    } finally {
      expect(await single.stop()).toBe(0);
    }
  });
});

describe('diagnostics', () => {
  it('publishes the diagnostics of every version and clears them when the document closes', async () => {
    const uri = unique('page.tpl');
    await client.open(uri, '<p>\n  {? a}\n</p>');
    const opened = await client.diagnosticsOf(uri, params => params.version === 1);
    expect(opened.diagnostics).toEqual([
      { range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } }, severity: 1, code: 'E_PARSE_UNCLOSED_BLOCK', source: 'polyspec-template', message: openDocument('<p>\n  {? a}\n</p>').diagnostics[0]?.message },
    ]);
    await client.change(uri, '<p>{? a}x{/}</p>', 2);
    expect((await client.diagnosticsOf(uri, params => params.version === 2)).diagnostics).toEqual([]);
    await client.change(uri, '{/}', 3);
    expect((await client.diagnosticsOf(uri, params => params.version === 3)).diagnostics.map(item => item.code)).toEqual(['E_PARSE_UNEXPECTED_CLOSE']);
    await client.close(uri);
    expect((await client.diagnosticsOf(uri, params => params.version === undefined)).diagnostics).toEqual([]);
  });
});

describe('formatting', () => {
  it('reads polyspec-template.format.templateBlocks of the document with workspace/configuration', async () => {
    const uri = unique('blocks.tpl');
    await client.open(uri, '<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>');
    const requests = client.configurationRequests.length;
    client.settings = { format: { templateBlocks: 'flat' } };
    try {
      const [flat] = await client.request<TextEdit[]>('textDocument/formatting', { textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } });
      expect(flat?.newText).toBe('<ul>\n    {@ x = xs}\n    <li>{= x}</li>\n    {/}\n</ul>');
    } finally {
      client.settings = { format: { templateBlocks: 'indent' } };
    }
    expect(client.configurationRequests.slice(requests)).toEqual([{ items: [{ scopeUri: uri, section: 'polyspec-template' }] }]);
    const [tabs] = await client.request<TextEdit[]>('textDocument/formatting', { textDocument: { uri }, options: { tabSize: 4, insertSpaces: false } });
    expect(tabs?.newText).toBe('<ul>\n\t{@ x = xs}\n\t\t<li>{= x}</li>\n\t{/}\n</ul>');
  });

  it('uses templateBlocks indent for a client without workspace/configuration', async () => {
    const plain = await Client.start({ configuration: false, multiline: true });
    try {
      const uri = unique('blocks.tpl');
      await plain.open(uri, '<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>');
      const [edit] = await plain.request<TextEdit[]>('textDocument/formatting', { textDocument: { uri }, options: SPACES });
      expect(edit?.newText).toBe('<ul>\n  {@ x = xs}\n    <li>{= x}</li>\n  {/}\n</ul>');
      expect(plain.configurationRequests).toEqual([]);
    } finally {
      expect(await plain.stop()).toBe(0);
    }
  });

  it('returns no edits and logs the position of a format error', async () => {
    const uri = 'file:///work/broken.tpl';
    await client.open(uri, '<div>\n<p>a</div>');
    const messages = client.messages.length;
    expect(await client.request<TextEdit[]>('textDocument/formatting', { textDocument: { uri }, options: SPACES })).toEqual([]);
    expect(client.messages.slice(messages)).toEqual(['/work/broken.tpl:2:5: HTML structure: the end tag </div> does not match the open element <p>; no edits returned']);
  });

  it('formats only the tags inside the range of rangeFormatting', async () => {
    const uri = unique('range.tpl');
    await client.open(uri, '{=a}{=b}');
    const edits = await client.request<TextEdit[]>('textDocument/rangeFormatting', {
      textDocument: { uri },
      range: { start: { line: 0, character: 4 }, end: { line: 0, character: 8 } },
      options: SPACES,
    });
    expect(TextDocument.applyEdits(TextDocument.create(uri, 'polyspec-template', 1, '{=a}{=b}'), edits)).toBe('{=a}{= b}');
  });

  it('returns no edits for a formatted document', async () => {
    const uri = unique('formatted.tpl');
    await client.open(uri, '<p>{= a}</p>\n');
    expect(await client.request<TextEdit[]>('textDocument/formatting', { textDocument: { uri }, options: SPACES })).toEqual([]);
  });
});

describe('onTypeFormatting', () => {
  const type = async (uri: string, position: Position, ch: string): Promise<TextEdit[]> =>
    client.request<TextEdit[]>('textDocument/onTypeFormatting', { textDocument: { uri }, position, ch, options: SPACES });

  it('sets the indentation of the current line after > and }', async () => {
    const uri = unique('typing.tpl');
    await client.open(uri, '<ul>\n{@ x = xs}\n  <li>\n    {/}');
    expect(await type(uri, { line: 1, character: 10 }, '}')).toEqual([{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '  ' }]);
    expect(await type(uri, { line: 3, character: 7 }, '}')).toEqual([{ range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } }, newText: '  ' }]);
  });

  it('returns no edit when the line has its indentation', async () => {
    const uri = unique('typed.tpl');
    await client.open(uri, '<ul>\n  <li>');
    expect(await type(uri, { line: 1, character: 6 }, '>')).toEqual([]);
  });
});

describe('custom requests', () => {
  it('returns null for a document that is not open', async () => {
    const textDocument = { uri: 'file:///work/closed.tpl' };
    expect(await client.request('polyspec-template/tagRanges', { textDocument })).toBeNull();
    expect(await client.request('polyspec-template/matchingTag', { textDocument, position: { line: 0, character: 0 } })).toBeNull();
  });
});
