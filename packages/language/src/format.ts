// Formatter entry: formats every tag and the indentation of every line, and refuses a result whose AST differs from the source AST.
import { analyze, DelimiterOptionError, parse, TemplateError, type FormatError, type FormatOptions, type FormatResult } from '@polyspec/template';
import { formatBody } from './body.js';
import { indentEdits } from './indent.js';
import { sameTree, withoutLineIndentation } from './invariant.js';

export type { FormatError, FormatOptions, FormatResult } from '@polyspec/template';

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
    // FMT-14: a source that does not parse, and an invalid delimiters option, are the parse result; any other failure is the
    // formatter's own and is thrown, not reported as an error of the source.
    if (error instanceof TemplateError || error instanceof DelimiterOptionError) return { ok: false, error: parseError(error) };
    throw error;
  }

  const shift = bom.length;
  const range = options.range === undefined ? null : { start: options.range.start - shift, end: options.range.end - shift };
  const edits: Edit[] = [];
  for (const tag of analysis.tags) {
    if (tag.kind === 'directive') continue;
    if (range !== null && (tag.start < range.start || tag.end > range.end)) continue;
    const tokens = analysis.tokens.filter(token => token.start >= tag.bodyStart && token.end <= tag.bodyEnd);
    const body = formatBody({ kind: tag.kind, source: text, bodyStart: tag.bodyStart, bodyEnd: tag.bodyEnd, tokens });
    if (body === null || body === text.slice(tag.bodyStart, tag.bodyEnd)) continue;
    edits.push({ start: tag.bodyStart, end: tag.bodyEnd, text: body });
  }
  if (indent !== null) {
    const indentation = indentEdits(text, analysis.tags, { unit: indent, templateBlocks: options.templateBlocks ?? 'indent', range });
    if ('error' in indentation) {
      return { ok: false, error: { reason: 'html', code: null, ...positionOf(text, indentation.error.index), message: indentation.error.message } };
    }
    edits.push(...indentation.edits);
    edits.sort((left, right) => left.start - right.start);
  }
  const [first] = edits;
  if (first === undefined) return { ok: true, text: source, changed: false };

  const formatted = apply(text, edits);
  let after: ReturnType<typeof parse>;
  try {
    after = parse(formatted, name, parseOptions);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { reason: 'invariant', code: null, ...positionOf(text, first.start), message: `formatted text does not parse: ${detail}` } };
  }
  const same = indent === null ? sameTree(analysis.ast, after) : sameTree(withoutLineIndentation(analysis.ast), withoutLineIndentation(after));
  if (!same) {
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

function parseError(error: TemplateError | DelimiterOptionError): FormatError {
  if (error instanceof TemplateError) {
    return { reason: 'parse', code: error.code, line: error.line, col: error.col, message: error.message };
  }
  return { reason: 'parse', code: null, line: 0, col: 0, message: error.message };
}

// The 1-based line and byte column of a string index, counted as the parser counts them.
function positionOf(text: string, index: number): { line: number; col: number } {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const line = text.slice(0, lineStart).split('\n').length;
  return { line, col: new TextEncoder().encode(text.slice(lineStart, index)).length + 1 };
}
