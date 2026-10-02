// Fixture form of the server results (EDT-17): every result is requested through the protocol and its positions are
// converted to string indexes, so it can be compared with the editor fixtures of the language service.
import type { DocumentHighlight, FoldingRange, InitializeResult, Position, SemanticTokens, TextEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Client } from './client.js';

/** The formatting options of the fixtures: an indent unit of two spaces. */
export const SPACES = { tabSize: 2, insertSpaces: true };

// The labels of format errors in the server log, by the reason of the fixtures; a parse error is logged with its code.
const REASONS: Record<string, string> = { 'HTML structure': 'html', 'formatted AST differs': 'invariant' };

/** The string index where every line of the language service starts (EDT-5). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) starts.push(index + 1);
  return starts;
}

/** Decodes the relative encoding of semantic tokens into `[start, end, type]` string index triples. */
export function decodeTokens(text: TextDocument, data: readonly number[], legend: readonly string[]): Array<[number, number, string]> {
  const tokens: Array<[number, number, string]> = [];
  let line = 0;
  let character = 0;
  for (let index = 0; index < data.length; index += 5) {
    const [deltaLine, deltaStart, length, type] = data.slice(index, index + 4) as [number, number, number, number];
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;
    const start = text.offsetAt({ line, character });
    tokens.push([start, start + length, legend[type] as string]);
  }
  return tokens;
}

/** The results of a document opened on the server, in the form of `editorResults()` of `scripts/editor-fixtures.mjs`. */
export async function serverResults(client: Client, uri: string, source: string, indexes: readonly number[]): Promise<unknown> {
  const text = TextDocument.create(uri, 'polyspec-template', 1, source);
  const textDocument = { uri };
  const at = (index: number): Position => text.positionAt(index);
  const indexOf = (position: Position): number => text.offsetAt(position);
  await client.open(uri, source);

  const published = await client.diagnosticsOf(uri, () => true);
  const legend = (client.initialized as InitializeResult).capabilities.semanticTokensProvider?.legend.tokenTypes ?? [];
  const tokens = await client.request<SemanticTokens>('textDocument/semanticTokens/full', { textDocument });
  const tags = await client.request<Array<{ start: Position; end: Position }>>('polyspec-template/tagRanges', { textDocument });
  const folding = await client.request<FoldingRange[]>('textDocument/foldingRange', { textDocument });

  const highlights: Record<number, Array<[number, number]>> = {};
  const matchingTags: Record<number, number | null> = {};
  for (const index of indexes) {
    const ranges = await client.request<DocumentHighlight[]>('textDocument/documentHighlight', { textDocument, position: at(index) });
    if (ranges.length > 0) highlights[index] = ranges.map(item => [indexOf(item.range.start), indexOf(item.range.end)]);
    const target = await client.request<Position | null>('polyspec-template/matchingTag', { textDocument, position: at(index) });
    matchingTags[index] = target === null ? null : indexOf(target);
  }

  const starts = lineStarts(source);
  const indentation = async (mode: string): Promise<string[]> => {
    client.settings = { format: { templateBlocks: mode } };
    const lines: string[] = [];
    for (const start of starts) {
      const edits = await client.request<TextEdit[]>('textDocument/onTypeFormatting', { textDocument, position: at(start), ch: '\n', options: SPACES });
      const typed = TextDocument.applyEdits(text, edits);
      lines.push((/^[ \t]*/.exec(typed.slice(start)) as RegExpExecArray)[0]);
    }
    return lines;
  };
  const lineIndentation = { indent: await indentation('indent'), flat: await indentation('flat') };

  client.settings = { format: { templateBlocks: 'indent' } };
  const messages = client.messages.length;
  const edits = await client.request<TextEdit[]>('textDocument/formatting', { textDocument, options: SPACES });
  const warning = client.messages.slice(messages).find(message => message.endsWith('; no edits returned'));
  const label = warning === undefined ? null : (/^.*?:\d+:\d+: ([^:]+): /.exec(warning)?.[1] ?? warning);
  const formatted = label === null ? TextDocument.applyEdits(text, edits) : edits.length > 0 ? { error: label, edits } : { error: REASONS[label] ?? (label.startsWith('E_') ? 'parse' : label) };

  return {
    diagnostics: published.diagnostics.map(item => ({ start: indexOf(item.range.start), end: indexOf(item.range.end), code: item.code })),
    tokens: decodeTokens(text, tokens.data, legend),
    tags: tags.map(range => [indexOf(range.start), indexOf(range.end)]),
    foldingRanges: folding.map(range => [range.startLine, range.endLine]),
    highlights,
    matchingTags,
    lineIndentation,
    formatted,
  };
}
