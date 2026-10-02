// Formatting and typing indentation: format() and lineIndentation() of the language service with the client's indent unit (EDT-12, EDT-13).
import type { FormatError, TemplateDocument } from '@polyspec/template-language';
import { TextEdit, type FormattingOptions, type Position, type Range } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { nameOf } from './documents.js';
import { rangeOf } from './results.js';

/** The `templateBlocks` option of the formatter and of the typing indentation. */
export type TemplateBlocks = 'indent' | 'flat';

const LABELS: Record<FormatError['reason'], string> = { parse: 'parse error', html: 'HTML structure', invariant: 'formatted AST differs' };

/** The indent unit of the client options: `tabSize` spaces, or a tab when `insertSpaces` is off. */
export function indentOf(options: FormattingOptions): string {
  return options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
}

/** The `format.templateBlocks` value of a settings section; any value other than `flat` is `indent`. */
export function templateBlocksOf(settings: unknown): TemplateBlocks {
  const format = typeof settings === 'object' && settings !== null ? (settings as { format?: unknown }).format : undefined;
  const value = typeof format === 'object' && format !== null ? (format as { templateBlocks?: unknown }).templateBlocks : undefined;
  return value === 'flat' ? 'flat' : 'indent';
}

/**
 * The edits of document or range formatting: one edit that replaces the whole text, or none when the text is
 * formatted. An error of format() returns no edits and is passed to `warn` as `path:line:col: LABEL: message`.
 */
export function formatEdits(
  text: TextDocument,
  document: TemplateDocument,
  options: FormattingOptions,
  templateBlocks: TemplateBlocks,
  range: Range | null,
  warn: (message: string) => void,
): TextEdit[] {
  const result = document.format({
    indent: indentOf(options),
    templateBlocks,
    ...(range === null ? {} : { range: { start: text.offsetAt(range.start), end: text.offsetAt(range.end) } }),
  });
  if (!result.ok) {
    const { error } = result;
    warn(`${nameOf(text.uri)}:${error.line}:${error.col}: ${error.code ?? LABELS[error.reason]}: ${error.message}; no edits returned`);
    return [];
  }
  if (!result.changed) return [];
  return [TextEdit.replace(rangeOf(text, 0, document.text.length), result.text)];
}

/**
 * The edit of `textDocument/onTypeFormatting`: sets the indentation of the line at the position to
 * `lineIndentation()`, or returns no edit when the line already has it.
 */
export function typingEdits(text: TextDocument, document: TemplateDocument, position: Position, options: FormattingOptions, templateBlocks: TemplateBlocks): TextEdit[] {
  const line = document.lineOf(text.offsetAt({ line: position.line, character: 0 }));
  const start = document.lineStart(line);
  const indentation = document.lineIndentation(line, { indent: indentOf(options), templateBlocks });
  const leading = /[ \t]*/y;
  leading.lastIndex = start;
  const current = (leading.exec(document.text) as RegExpExecArray)[0];
  if (current === indentation) return [];
  return [TextEdit.replace(rangeOf(text, start, start + current.length), indentation)];
}
