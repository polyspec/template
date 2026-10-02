// Formatter entry: formats every tag and the indentation of every line, and refuses a result whose AST differs from the source AST.
import { analyze, parse, TemplateError } from '@polyspec/template';
import { formatBody, type TagKind } from './body.js';
import { indentEdits } from './indent.js';
import { sameTree, withoutLineIndentation } from './invariant.js';
import { delimitersOf, tagParts, type Delimiters } from './tags.js';

/** Options of {@link format}. */
export interface FormatOptions {
  /** Template name used in error results. The default is `template.tpl`. */
  name?: string;
  /** Engine delimiter option as two characters (LEX-22). The default is `{}`. */
  delimiters?: string;
  /** String index range; only tags that lie completely inside it and lines that start inside it are formatted. */
  range?: { start: number; end: number };
  /** Indent unit: a run of spaces or one tab. The default is two spaces. `null` keeps the indentation of every line. */
  indent?: string | null;
  /** `indent` (default): template blocks add an indentation level like HTML elements. `flat`: they add none. */
  templateBlocks?: 'indent' | 'flat';
}

/** Why {@link format} returned no text. */
export interface FormatError {
  /**
   * `parse`: the source does not parse. `invariant`: the formatted text does not parse to the same AST. `html`: the
   * HTML structure is not balanced, so the lines cannot be indented.
   */
  reason: 'parse' | 'invariant' | 'html';
  /** Error code of the parser, or null for an AST difference. */
  code: string | null;
  /** 1-based line of the error position. */
  line: number;
  /** 1-based byte column of the error position, as in parser errors (ERR-1). */
  col: number;
  message: string;
}

/** The result of {@link format}: the formatted text, or the reason why the source is kept. */
export type FormatResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; error: FormatError };

interface Edit {
  start: number;
  end: number;
  text: string;
}

const BOM = '\uFEFF';

/**
 * Formats the whitespace inside the tags of a template and the indentation of its lines. Other text outside tags,
 * comments and directives are never changed. The source and the result are parsed, and the result is returned only
 * when both ASTs are equal without their `span` fields and, when lines are indented, without the spaces and tabs at
 * the start of lines of text.
 */
export function format(source: string, options: FormatOptions = {}): FormatResult {
  const indent = options.indent === undefined ? '  ' : options.indent;
  if (indent !== null && !/^(?: +|\t)$/.test(indent)) throw new RangeError('indent must be a run of spaces or one tab');
  const name = options.name ?? 'template.tpl';
  const bom = source.startsWith(BOM) ? BOM : '';
  const text = source.slice(bom.length);
  const parseOptions = options.delimiters === undefined ? {} : { delimiters: options.delimiters };
  let analysis: ReturnType<typeof analyze>;
  try {
    analysis = analyze(text, name, parseOptions);
  } catch (error) {
    return { ok: false, error: parseError(error) };
  }

  const shift = bom.length;
  const range = options.range === undefined ? null : { start: options.range.start - shift, end: options.range.end - shift };
  const edits: Edit[] = [];
  let delimiters: Delimiters = delimitersOf(options.delimiters ?? '{}');
  for (const tag of analysis.tags) {
    const parts = tagParts(text, tag.start, tag.end, delimiters);
    if (parts === null) continue;
    if (tag.kind === 'directive') {
      const value = /delimiter[ \t]*(\S\S)/.exec(parts.body);
      if (value) delimiters = delimitersOf(value[1] as string);
      continue;
    }
    if (range !== null && (tag.start < range.start || tag.end > range.end)) continue;
    const body = formatBody({ kind: tag.kind as TagKind, source: text, bodyStart: parts.bodyStart, bodyEnd: parts.bodyEnd, tokens: analysis.tokens });
    if (body === null || body === parts.body) continue;
    edits.push({ start: parts.bodyStart, end: parts.bodyEnd, text: body });
  }
  if (indent !== null) {
    const indentation = indentEdits(text, analysis.tags, { unit: indent, templateBlocks: options.templateBlocks ?? 'indent', range });
    if ('error' in indentation) {
      return { ok: false, error: { reason: 'html', code: null, ...positionOf(text, indentation.error.index), message: indentation.error.message } };
    }
    edits.push(...indentation.edits);
    edits.sort((left, right) => left.start - right.start);
  }
  if (edits.length === 0) return { ok: true, text: source, changed: false };

  const formatted = apply(text, edits);
  let after: ReturnType<typeof parse>;
  try {
    after = parse(formatted, name, parseOptions);
  } catch (error) {
    const first = edits[0] as Edit;
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { reason: 'invariant', code: null, ...positionOf(text, first.start), message: `formatted text does not parse: ${detail}` } };
  }
  const same = indent === null ? sameTree(analysis.ast, after) : sameTree(withoutLineIndentation(analysis.ast), withoutLineIndentation(after));
  if (!same) {
    const first = edits[0] as Edit;
    return { ok: false, error: { reason: 'invariant', code: null, ...positionOf(text, first.start), message: 'formatted text parses to a different AST' } };
  }
  return { ok: true, text: bom + formatted, changed: true };
}

function apply(text: string, edits: readonly Edit[]): string {
  let output = '';
  let cursor = 0;
  for (const edit of edits) {
    output += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return output + text.slice(cursor);
}

function parseError(error: unknown): FormatError {
  if (error instanceof TemplateError) {
    return { reason: 'parse', code: error.code, line: error.line, col: error.col, message: error.message };
  }
  return { reason: 'parse', code: null, line: 0, col: 0, message: error instanceof Error ? error.message : String(error) };
}

// The 1-based line and byte column of a string index, counted as the parser counts them.
function positionOf(text: string, index: number): { line: number; col: number } {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const line = text.slice(0, lineStart).split('\n').length;
  return { line, col: new TextEncoder().encode(text.slice(lineStart, index)).length + 1 };
}
