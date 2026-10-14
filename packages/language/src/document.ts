// Language service document: one analysis of a template text and every editor result of EDT-4 to EDT-13.
import { analyzePrefix, type SyntaxTag, type TemplateError } from '@polyspec/template';
import { format, type FormatOptions, type FormatResult } from './format.js';
import { lineIndentations } from './indent.js';
import { indexOfByte } from './positions.js';
import { findRoot, pathDiagnostics, type DocumentLocation, type TemplateRoot } from './root.js';
import { constructAt, constructsOf, matchingTagOf, type Construct } from './structure.js';
import type { Token } from './tokens.js';

/** Options of {@link openDocument}. */
export interface DocumentOptions {
  /** Template name of diagnostics. The default is `template.tpl`. */
  name?: string;
  /** Engine delimiter option as two characters (LEX-22). The default is `{}`. */
  delimiters?: string;
  /** The file of the document and the host that reaches the files around it (EDT-18). Without it no root is declared. */
  location?: DocumentLocation;
}

/** A parser error of the text, a path diagnostic (EDT-7, EDT-20) or a marker diagnostic (EDT-19). */
export interface Diagnostic {
  start: number;
  end: number;
  code: string;
  message: string;
  severity: 'error';
  source: 'polyspec-template';
}

/** A string index range. */
export interface Range {
  start: number;
  end: number;
}

/** A tag range with the grammar kind of the parser. */
export interface TagRange extends Range {
  kind: SyntaxTag['kind'];
}

/** A folding range by 0-based line numbers (EDT-10). */
export interface FoldingRange {
  startLine: number;
  endLine: number;
}

/** Options of {@link TemplateDocument.lineIndentation}. */
export interface LineIndentationOptions {
  /** Indent unit: a run of spaces or one tab. */
  indent: string;
  /** `indent` (default): template blocks add an indentation level. `flat`: they add none. */
  templateBlocks?: 'indent' | 'flat';
}

/** Format options of a document; the name and the delimiters come from the document. */
export type DocumentFormatOptions = Omit<FormatOptions, 'name' | 'delimiters'>;

const BOM = '﻿';

/** One analysis of a template text and its editor results. Positions are UTF-16 string indexes into `text` (EDT-5). */
export class TemplateDocument {
  /** The parser error of a text that does not parse, otherwise the path diagnostics (EDT-7, EDT-20). */
  readonly diagnostics: readonly Diagnostic[];
  /** The marker in the nearest ancestor of the document, or null when none declares a root (EDT-18). */
  readonly root: TemplateRoot | null;
  /** Every accepted tag except comments (EDT-9). */
  readonly tags: readonly TagRange[];
  /** The highlight tokens of the accepted tags, sorted and not overlapping (EDT-8). */
  readonly tokens: readonly Token[];
  /** The closed block constructs (EDT-10). */
  readonly constructs: readonly Construct[];
  private readonly accepted: readonly TagRange[];
  private readonly lineStarts: number[];

  constructor(readonly text: string, private readonly options: DocumentOptions = {}) {
    const shift = text.startsWith(BOM) ? BOM.length : 0;
    const source = text.slice(shift);
    const name = options.name ?? 'template.tpl';
    const analysis = analyzePrefix(source, name, options.delimiters === undefined ? {} : { delimiters: options.delimiters });
    this.accepted = analysis.tags.map(tag => ({ kind: tag.kind, start: tag.start + shift, end: tag.end + shift }));
    this.root = options.location === undefined ? null : findRoot(options.location);
    this.diagnostics = analysis.error !== null
      ? [diagnosticOf(source, analysis.error, shift)]
      : pathDiagnostics(analysis.ast, options.location, this.root).map(item => rangeOf(source, item.span[0], item.span[1], item.code, item.message, shift));
    this.tags = this.accepted.filter(tag => tag.kind !== 'comment');
    this.tokens = analysis.tokens.map(token => ({ start: token.start + shift, end: token.end + shift, type: token.kind }));
    this.constructs = constructsOf(this.accepted);
    this.lineStarts = [0];
    for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) this.lineStarts.push(index + 1);
  }

  /** The number of lines of the text. */
  get lineCount(): number {
    return this.lineStarts.length;
  }

  /** The 0-based line of a string index. */
  lineOf(index: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      const start = this.lineStarts[middle];
      if (start !== undefined && start <= index) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  /** The string index where a 0-based line starts. */
  lineStart(line: number): number {
    const start = this.lineStarts[line];
    if (start === undefined) throw new RangeError(`line ${line} is outside the text`);
    return start;
  }

  /** The constructs whose close tag starts on a later line, from the opening line to the line before the close tag (EDT-10). */
  foldingRanges(): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    for (const construct of this.constructs) {
      const close = construct.tags.at(-1);
      // A closed construct ends with its close tag.
      if (close === undefined) throw new Error(`The construct at ${construct.start} has no tags`);
      const startLine = this.lineOf(construct.start);
      const endLine = this.lineOf(close.start) - 1;
      if (endLine > startLine) ranges.push({ startLine, endLine });
    }
    return ranges;
  }

  /** The tags of the construct with a tag containing the index, including the index after the tag (EDT-11). */
  highlights(index: number): Range[] {
    const found = constructAt(this.constructs, index);
    return found === null ? [] : found.construct.tags.map(tag => ({ start: tag.start, end: tag.end }));
  }

  /** The start of the next tag of the construct under the index, or of the innermost construct around it (EDT-11). */
  matchingTag(index: number): number | null {
    return matchingTagOf(this.constructs, index);
  }

  /** Formats the text with the document's name and delimiters (EDT-12). */
  format(options: DocumentFormatOptions = {}): FormatResult {
    const base: FormatOptions = this.options.delimiters === undefined ? { name: this.options.name ?? 'template.tpl' } : { name: this.options.name ?? 'template.tpl', delimiters: this.options.delimiters };
    return format(this.text, { ...base, ...options });
  }

  /**
   * The indentation a line gets while it is typed (EDT-13): the formatter's rule over the accepted tags without
   * requiring a balanced structure. A line inside an element or a tag whose lines the formatter keeps keeps its
   * indentation.
   */
  lineIndentation(line: number, options: LineIndentationOptions): string {
    if (!/^(?: +|\t)$/.test(options.indent)) throw new RangeError('indent must be a run of spaces or one tab');
    const start = this.lineStart(line);
    const computed = lineIndentations(this.text, this.accepted, options.indent, options.templateBlocks ?? 'indent', true);
    if ('error' in computed) throw new Error(computed.error.message);
    const entry = computed.lines.find(item => item.start === start);
    if (entry === undefined) throw new RangeError(`line ${line} is outside the text`);
    return entry.indentation ?? this.text.slice(entry.start, entry.end);
  }
}

/** Analyzes a template text once (EDT-4). */
export function openDocument(text: string, options: DocumentOptions = {}): TemplateDocument {
  return new TemplateDocument(text, options);
}

function diagnosticOf(source: string, error: TemplateError, shift: number): Diagnostic {
  return rangeOf(source, error.offset, error.end, error.code, error.message, shift);
}

// A diagnostic over the string range of a byte range, at least one character long when the text has one.
function rangeOf(source: string, offset: number, endOffset: number, code: string, message: string, shift: number): Diagnostic {
  const start = Math.min(indexOfByte(source, offset), source.length);
  let end = Math.max(indexOfByte(source, endOffset), start);
  if (end === start) end = Math.min(start + 1, source.length);
  return { start: start + shift, end: Math.max(end, start) + shift, code, message, severity: 'error', source: 'polyspec-template' };
}
