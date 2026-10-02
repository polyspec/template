// Result conversion: language service results at UTF-16 string indexes to Language Server Protocol positions (EDT-5).
import { TOKEN_TYPES, type TemplateDocument } from '@polyspec/template-language';
import {
  DiagnosticSeverity,
  DocumentHighlightKind,
  FoldingRangeKind,
  type Diagnostic,
  type DocumentHighlight,
  type FoldingRange,
  type Position,
  type Range,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/** The range of two string indexes. */
export function rangeOf(text: TextDocument, start: number, end: number): Range {
  return { start: text.positionAt(start), end: text.positionAt(end) };
}

/** The parser error of the document (EDT-7). */
export function diagnosticsOf(text: TextDocument, document: TemplateDocument): Diagnostic[] {
  return document.diagnostics.map(item => ({
    range: rangeOf(text, item.start, item.end),
    severity: DiagnosticSeverity.Error,
    code: item.code,
    source: item.source,
    message: item.message,
  }));
}

/**
 * The tokens of the document in the relative encoding of `textDocument/semanticTokens` with {@link TOKEN_TYPES} as
 * the legend (EDT-8). A client without `multilineTokenSupport` gets a token that spans lines as one token per line.
 */
export function semanticTokensOf(text: TextDocument, document: TemplateDocument, multiline: boolean): number[] {
  const data: number[] = [];
  let previous: Position = { line: 0, character: 0 };
  const push = (start: Position, length: number, type: number): void => {
    const line = start.line - previous.line;
    data.push(line, line === 0 ? start.character - previous.character : start.character, length, type, 0);
    previous = start;
  };
  for (const token of document.tokens) {
    const type = TOKEN_TYPES.indexOf(token.type);
    const start = text.positionAt(token.start);
    const end = text.positionAt(token.end);
    if (multiline || start.line === end.line) {
      push(start, token.end - token.start, type);
      continue;
    }
    for (let line = start.line; line <= end.line; line++) {
      const from = line === start.line ? token.start : text.offsetAt({ line, character: 0 });
      const to = line === end.line ? token.end : text.offsetAt({ line, character: Number.MAX_SAFE_INTEGER });
      if (to > from) push(text.positionAt(from), to - from, type);
    }
  }
  return data;
}

/**
 * The folding ranges of the document (EDT-10). A line of the language service starts at a string index; the range
 * ends on the protocol line before the line of the close tag.
 */
export function foldingRangesOf(text: TextDocument, document: TemplateDocument): FoldingRange[] {
  return document.foldingRanges().map(range => ({
    startLine: text.positionAt(document.lineStart(range.startLine)).line,
    endLine: text.positionAt(document.lineStart(range.endLine + 1)).line - 1,
    kind: FoldingRangeKind.Region,
  }));
}

/** The tags of the construct at a position (EDT-11). */
export function highlightsOf(text: TextDocument, document: TemplateDocument, position: Position): DocumentHighlight[] {
  return document.highlights(text.offsetAt(position)).map(range => ({ range: rangeOf(text, range.start, range.end), kind: DocumentHighlightKind.Text }));
}

/** The start of the matching tag of a position (EDT-11). */
export function matchingTagOf(text: TextDocument, document: TemplateDocument, position: Position): Position | null {
  const target = document.matchingTag(text.offsetAt(position));
  return target === null ? null : text.positionAt(target);
}

/** The ranges of every accepted tag except comments (EDT-9). */
export function tagRangesOf(text: TextDocument, document: TemplateDocument): Range[] {
  return document.tags.map(tag => rangeOf(text, tag.start, tag.end));
}
