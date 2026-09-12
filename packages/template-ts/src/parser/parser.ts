// Template parser: text scanning, tag bodies, block structure and standalone lines
// as defined in docs/spec/lexical.md and docs/spec/grammar.md.
import type { Block, Expr, If, IfBlock, For, Node, Set as SetNode, Template } from '../ast.js';
import { errorAt, type ErrorCode, type TemplateError } from '../errors.js';
import type { Token, TokenType } from '../expr/lexer.js';
import { ExpressionParser } from '../expr/parser.js';
import type { Source } from '../source.js';
import { RawTagReader } from './block-tag.js';
import {
  DEFAULT_DELIMITERS, isHorizontalSpace, parseDelimiters, sigilAfter, skipHorizontalSpace, startsTag, wrappedTagAt,
  type Delimiters, type Wrapper,
} from './scanner.js';
import { standaloneRanges, type Range, type TagRange } from './standalone.js';

/** Parser-owned source range for one accepted template tag. */
export interface SyntaxTag extends TagRange {
  kind: 'assignment' | 'block' | 'close' | 'comment' | 'directive' | 'echo' | 'else' | 'elseif' | 'for' | 'if' | 'ifblock' | 'include';
}

/** Canonical AST and the exact tag ranges accepted while producing it. */
export interface TemplateAnalysis {
  ast: Template;
  tags: readonly SyntaxTag[];
  tokens: readonly SyntaxToken[];
}

/** Expression token range emitted by the lexer used during template parsing. */
export interface SyntaxToken {
  start: number;
  end: number;
  kind: 'keyword' | 'number' | 'operator' | 'string' | 'variable';
}

function syntaxToken(token: Token): SyntaxToken {
  const keywords: ReadonlySet<TokenType> = new Set(['NULL', 'TRUE', 'FALSE']);
  const variables: ReadonlySet<TokenType> = new Set(['IDENT', 'DOT_IDENT', 'DOT_INDEX']);
  const kind: SyntaxToken['kind'] = token.type === 'STRING' ? 'string'
    : token.type === 'NUMBER' ? 'number'
      : keywords.has(token.type) ? 'keyword'
        : variables.has(token.type) ? 'variable' : 'operator';
  return { start: token.start, end: token.end, kind };
}

function syntaxKind(sigil: string | null, assignment = false): SyntaxTag['kind'] {
  if (assignment) return 'assignment';
  switch (sigil) {
    case null: throw new Error('bare assignments are not accepted');
    case '*': return 'comment';
    case '=': return 'echo';
    case '@': return 'for';
    case '?': return 'if';
    case '?#': return 'ifblock';
    case ':?': return 'elseif';
    case ':': return 'else';
    case '/': return 'close';
    case '+': return 'include';
    case '#': return 'block';
    case '%': return 'directive';
    default: throw new Error(`unknown accepted tag sigil ${JSON.stringify(sigil)}`);
  }
}

const RESERVED = new Set(['true', 'false', 'null', 'in']);
const ASSIGN_HEAD = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*/%]=|=(?![=>]))/;
const LOOP_HEAD = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/;

interface TextPiece {
  kind: 'text';
  start: number;
  end: number;
  value: string;
}

type Item = TextPiece | Node;

interface Frame {
  node: If | For | IfBlock;
  // The item list that receives new items.
  items: Item[];
  hasElse: boolean;
  openStart: number;
}

interface TagContext {
  // String index of the tag start, including the wrapper.
  start: number;
  // String index of the open delimiter (the second one for a wrapped tag).
  open: number;
  closeCount: number;
  wrapper: Wrapper | null;
}

export function parseTemplate(source: Source, delimiters: Delimiters = DEFAULT_DELIMITERS): Template {
  return analyzeTemplate(source, delimiters).ast;
}

/** Parses a template once and returns its AST with parser-owned syntax ranges. */
export function analyzeTemplate(source: Source, delimiters: Delimiters = DEFAULT_DELIMITERS): TemplateAnalysis {
  return new TemplateParser(source, delimiters).parse();
}

class TemplateParser {
  private delimiters: Delimiters;
  private readonly text: string;
  private readonly root: Item[] = [];
  private readonly frames: Frame[] = [];
  private readonly tags: SyntaxTag[] = [];
  private readonly expressionParsers: ExpressionParser[] = [];
  private sawTag = false;
  private textBeforeFirstTagIsWhitespace = true;

  constructor(private readonly source: Source, delimiters: Delimiters) {
    this.delimiters = delimiters;
    this.text = source.text;
  }

  private get name(): string {
    return this.source.name;
  }

  private fail(code: ErrorCode, start: number, end: number, message: string): TemplateError {
    return errorAt(code, this.name, this.source.lines, this.source.span(start, end), message);
  }

  private get items(): Item[] {
    const frame = this.frames[this.frames.length - 1];
    return frame ? frame.items : this.root;
  }

  parse(): TemplateAnalysis {
    this.scan();
    const frame = this.frames[this.frames.length - 1];
    if (frame) {
      throw this.fail('E_PARSE_UNCLOSED_BLOCK', frame.openStart, frame.openStart + 1, 'block is not closed before the end of the file');
    }
    const removed = standaloneRanges(this.text, this.tags);
    return {
      ast: { type: 'Template', name: this.name, body: this.finalize(this.root, removed) },
      tags: this.tags,
      tokens: this.expressionParsers.flatMap(parser => parser.lexer.consumed
        .filter(token => token.type !== 'CLOSE' && token.type !== 'EOF')
        .map(syntaxToken)),
    };
  }

  // Pass 1: text scanning and tag parsing.
  private scan(): void {
    const text = this.text;
    let index = 0;
    let textStart = 0;
    const flushText = (end: number): void => {
      if (end > textStart) this.pushText(textStart, end, text.slice(textStart, end));
    };
    while (index < text.length) {
      const char = text[index] as string;
      const { open } = this.delimiters;
      if (char === '\\' && text[index + 1] === open && startsTag(text, index + 1, this.delimiters)) {
        flushText(index);
        this.pushText(index, index + 2, open);
        index += 2;
        textStart = index;
        continue;
      }
      if (char === open && startsTag(text, index, this.delimiters)) {
        flushText(index);
        index = this.parseTag({ start: index, open: index, closeCount: 1, wrapper: null });
        textStart = index;
        continue;
      }
      const wrapper = wrappedTagAt(text, index, this.delimiters);
      if (wrapper !== null) {
        flushText(index);
        const openIndex = skipHorizontalSpace(text, index + wrapper.opener.length) + 1;
        index = this.parseTag({ start: index, open: openIndex, closeCount: 2, wrapper });
        textStart = index;
        continue;
      }
      index++;
    }
    flushText(text.length);
  }

  private pushText(start: number, end: number, value: string): void {
    if (!this.sawTag && this.textBeforeFirstTagIsWhitespace && !/^[ \t\r\n]*$/.test(value)) {
      this.textBeforeFirstTagIsWhitespace = false;
    }
    this.items.push({ kind: 'text', start, end, value });
  }

  private closeSequence(context: TagContext): string {
    return this.delimiters.close.repeat(context.closeCount);
  }

  // Parses one tag starting at context.start and returns the string index after it.
  private parseTag(context: TagContext): number {
    const text = this.text;
    const sigil = sigilAfter(text, context.open);
    const bodyStart = sigil === null ? context.open + 1 : skipHorizontalSpace(text, skipHorizontalSpace(text, context.open + 1) + sigil.length);
    const isDirective = sigil === '%';
    const firstTag = !this.sawTag;
    this.sawTag = true;

    let end: number;
    let echo = false;
    switch (sigil) {
      case '*':
        end = this.parseComment(context, bodyStart);
        break;
      case '=': {
        echo = true;
        const parser = this.expressionParser(context, bodyStart);
        const expr = parser.parseExpression();
        end = this.finishTag(context, parser.expectClose());
        this.items.push({ type: 'Echo', expr, span: this.source.span(context.start, end) });
        break;
      }
      case '@':
        end = this.parseLoop(context, bodyStart);
        break;
      case '?': {
        const parser = this.expressionParser(context, bodyStart);
        const test = parser.parseExpression();
        end = this.finishTag(context, parser.expectClose());
        const span = this.source.span(context.start, end);
        const node: If = { type: 'If', branches: [{ test, body: [], span }], else: null, span };
        this.openFrame(node, node.branches[0]!.body as unknown as Item[], context.start);
        break;
      }
      case '?#': {
        const parser = this.expressionParser(context, bodyStart);
        const id = parser.expect('IDENT');
        end = this.finishTag(context, parser.expectClose());
        const node: IfBlock = { type: 'IfBlock', id: id.value, body: [], else: null, span: this.source.span(context.start, end) };
        this.openFrame(node, node.body as unknown as Item[], context.start);
        break;
      }
      case ':?': {
        const frame = this.frames[this.frames.length - 1];
        if (!frame) throw this.fail('E_PARSE_ELSE_OUTSIDE_BLOCK', context.start, context.start + 1, '"{:?}" outside of a block');
        if (frame.node.type !== 'If') throw this.fail('E_PARSE_ELSEIF_NOT_IN_IF', context.start, context.start + 1, '"{:?}" inside a loop or if-block');
        if (frame.hasElse) throw this.fail('E_PARSE_ELSEIF_AFTER_ELSE', context.start, context.start + 1, '"{:?}" after "{:}"');
        const parser = this.expressionParser(context, bodyStart);
        const test = parser.parseExpression();
        end = this.finishTag(context, parser.expectClose());
        const body: Node[] = [];
        frame.node.branches.push({ test, body, span: this.source.span(context.start, end) });
        frame.items = body as unknown as Item[];
        break;
      }
      case ':': {
        if (ASSIGN_HEAD.test(text.slice(bodyStart))) {
          end = this.parseAssignment(context, bodyStart);
          break;
        }
        const frame = this.frames[this.frames.length - 1];
        if (!frame) throw this.fail('E_PARSE_ELSE_OUTSIDE_BLOCK', context.start, context.start + 1, '"{:}" outside of a block');
        if (frame.hasElse) throw this.fail('E_PARSE_DUPLICATE_ELSE', context.start, context.start + 1, 'second "{:}" in the same block');
        end = this.finishTag(context, this.expectCloseRaw(context, bodyStart));
        const body: Node[] = [];
        if (frame.node.type === 'For') frame.node.empty = body;
        else frame.node.else = body;
        frame.hasElse = true;
        frame.items = body as unknown as Item[];
        break;
      }
      case '/': {
        const frame = this.frames.pop();
        if (!frame) throw this.fail('E_PARSE_UNEXPECTED_CLOSE', context.start, context.start + 1, '"{/}" without an open block');
        end = this.finishTag(context, this.expectCloseRaw(context, bodyStart));
        frame.node.span = this.source.span(frame.openStart, end);
        this.items.push(frame.node);
        break;
      }
      case '+': {
        const reader = this.rawReader(context);
        const path = reader.readIncludePath(bodyStart);
        end = this.finishTag(context, this.expectCloseRaw(context, path.end));
        this.items.push({ type: 'Include', path: path.path, span: this.source.span(context.start, end) });
        break;
      }
      case '#': {
        const reader = this.rawReader(context);
        const body = reader.readBlockBody(bodyStart);
        end = this.finishTag(context, this.expectCloseRaw(context, body.end));
        const node: Block = { type: 'Block', id: body.id, path: body.path, scope: body.scope, span: this.source.span(context.start, end) };
        this.items.push(node);
        break;
      }
      case '%':
        end = this.parseDirective(context, bodyStart, firstTag);
        break;
      case null:
        throw this.fail('E_PARSE_UNEXPECTED_TOKEN', bodyStart, bodyStart + 1, 'unknown tag');
      default:
        throw this.fail('E_PARSE_UNEXPECTED_TOKEN', bodyStart, bodyStart + 1, 'unknown tag');
    }
    if (isDirective && !firstTag) {
      throw this.fail('E_PARSE_INVALID_DIRECTIVE', context.start, context.start + 1, 'delimiter directive is not the first tag');
    }
    const assignment = sigil === ':' && ASSIGN_HEAD.test(text.slice(bodyStart));
    this.tags.push({ start: context.start, end, echo, kind: syntaxKind(sigil, assignment) });
    return end;
  }

  private expressionParser(context: TagContext, start: number): ExpressionParser {
    const parser = new ExpressionParser(
      this.source,
      start,
      { close: this.delimiters.close, closeCount: context.closeCount, openIndex: context.open },
      this.name,
    );
    this.expressionParsers.push(parser);
    return parser;
  }

  private rawReader(context: TagContext): RawTagReader {
    return new RawTagReader(this.source, this.name, this.delimiters.close, context.closeCount, (code, start, end, message) =>
      this.fail(code, start, end, message));
  }

  // Skips horizontal whitespace and consumes the close delimiter sequence; returns the index after it.
  private expectCloseRaw(context: TagContext, index: number): number {
    const at = skipHorizontalSpace(this.text, index);
    const sequence = this.closeSequence(context);
    if (this.text.startsWith(sequence, at)) return at + sequence.length;
    if (this.text.indexOf(this.delimiters.close, at) < 0) {
      throw this.fail('E_PARSE_UNTERMINATED_TAG', context.open, context.open + 1, 'tag is not terminated');
    }
    throw this.fail('E_PARSE_UNEXPECTED_TOKEN', at, at + 1, `unexpected ${JSON.stringify(this.text[at])} before the end of the tag`);
  }

  // For a wrapped tag, consumes the wrapper closer after the close delimiters (LEX-19).
  private finishTag(context: TagContext, afterClose: number): number {
    if (context.wrapper === null) return afterClose;
    const at = skipHorizontalSpace(this.text, afterClose);
    if (!this.text.startsWith(context.wrapper.closer, at)) {
      throw this.fail('E_PARSE_INVALID_WRAPPER', context.start, context.start + context.wrapper.opener.length, `wrapped tag is not followed by ${JSON.stringify(context.wrapper.closer)}`);
    }
    return at + context.wrapper.closer.length;
  }

  private parseComment(context: TagContext, bodyStart: number): number {
    const terminator = '*' + this.closeSequence(context);
    const at = this.text.indexOf(terminator, bodyStart);
    if (at < 0) throw this.fail('E_PARSE_UNTERMINATED_COMMENT', context.open, context.open + 1, 'comment is not terminated');
    return this.finishTag(context, at + terminator.length);
  }

  private parseLoop(context: TagContext, bodyStart: number): number {
    const head = LOOP_HEAD.exec(this.text.slice(bodyStart));
    if (!head) {
      const at = skipHorizontalSpace(this.text, bodyStart);
      throw this.fail('E_PARSE_UNEXPECTED_TOKEN', at, at + 1, 'loop requires "name = expression"');
    }
    const name = head[1] as string;
    const nameStart = bodyStart + head[0].indexOf(name);
    if (RESERVED.has(name)) throw this.fail('E_PARSE_RESERVED_NAME', nameStart, nameStart + name.length, `${name} is a reserved word`);
    const parser = this.expressionParser(context, bodyStart + head[0].length);
    const iter = parser.parseExpression();
    const end = this.finishTag(context, parser.expectClose());
    const span = this.source.span(context.start, end);
    const node: For = { type: 'For', name, iter, body: [], empty: null, span };
    this.openFrame(node, node.body as unknown as Item[], context.start);
    return end;
  }

  private parseAssignment(context: TagContext, bodyStart: number): number {
    const head = ASSIGN_HEAD.exec(this.text.slice(bodyStart));
    if (!head) throw this.fail('E_PARSE_UNEXPECTED_TOKEN', bodyStart, bodyStart + 1, 'unknown tag');
    const name = head[1] as string;
    const operator = head[2] as string;
    if (RESERVED.has(name)) throw this.fail('E_PARSE_RESERVED_NAME', bodyStart, bodyStart + name.length, `${name} is a reserved word`);
    const variable: Expr = { type: 'Var', name, span: this.source.span(bodyStart, bodyStart + name.length) };
    const afterOperator = bodyStart + head[0].length;
    let expr: Expr;
    let end: number;
    if (operator === '++' || operator === '--') {
      end = this.finishTag(context, this.expectCloseRaw(context, afterOperator));
      const operatorStart = afterOperator - 2;
      const one: Expr = { type: 'Literal', kind: 'number', value: 1, span: this.source.span(operatorStart, afterOperator) };
      expr = { type: 'Binary', op: operator === '++' ? '+' : '-', left: variable, right: one, span: this.source.span(bodyStart, afterOperator) };
    } else {
      const parser = this.expressionParser(context, afterOperator);
      const value = parser.parseExpression();
      end = this.finishTag(context, parser.expectClose());
      if (operator === '=') {
        expr = value;
      } else {
        const op = operator[0] as '+' | '-' | '*' | '/' | '%';
        expr = { type: 'Binary', op, left: variable, right: value, span: this.source.span(bodyStart, parser.end) };
      }
    }
    const node: SetNode = { type: 'Set', name, expr, span: this.source.span(context.start, end) };
    this.items.push(node);
    return end;
  }

  private parseDirective(context: TagContext, bodyStart: number, firstTag: boolean): number {
    const invalid = (message: string): TemplateError =>
      this.fail('E_PARSE_INVALID_DIRECTIVE', context.start, context.start + 1, message);
    if (!firstTag || !this.textBeforeFirstTagIsWhitespace) throw invalid('delimiter directive is not the first tag');
    let index = skipHorizontalSpace(this.text, bodyStart);
    if (!this.text.startsWith('delimiter', index)) throw invalid('directive is not "delimiter"');
    index = skipHorizontalSpace(this.text, index + 'delimiter'.length);
    let value = '';
    while (index < this.text.length && !isHorizontalSpace(this.text.charCodeAt(index)) && !this.text.startsWith(this.closeSequence(context), index)) {
      value += this.text[index];
      index++;
      if (value.length > 2) break;
    }
    const delimiters = parseDelimiters(value);
    if (delimiters === null) throw invalid(`${JSON.stringify(value)} is not a delimiter pair`);
    const end = this.finishTag(context, this.expectCloseRaw(context, index));
    this.delimiters = delimiters;
    return end;
  }

  private openFrame(node: If | For | IfBlock, items: Item[], openStart: number): void {
    this.frames.push({ node, items, hasElse: false, openStart });
  }

  // Pass 3: applies standalone removal to text pieces and merges them into Text nodes.
  private finalize(items: Item[], removed: Range[]): Node[] {
    const nodes: Node[] = [];
    let pending: TextPiece[] = [];
    const flush = (): void => {
      if (!pending.length) return;
      const value = pending.map(piece => piece.value).join('');
      if (value.length > 0) {
        nodes.push({
          type: 'Text',
          value,
          span: this.source.span(pending[0]!.start, pending[pending.length - 1]!.end),
        });
      }
      pending = [];
    };
    for (const item of items) {
      if ('kind' in item) {
        for (const piece of cutPiece(item, removed)) pending.push(piece);
        continue;
      }
      flush();
      nodes.push(this.finalizeNode(item, removed));
    }
    flush();
    return nodes;
  }

  private finalizeNode(node: Node, removed: Range[]): Node {
    switch (node.type) {
      case 'If':
        for (const branch of node.branches) branch.body = this.finalize(branch.body as unknown as Item[], removed);
        if (node.else) node.else = this.finalize(node.else as unknown as Item[], removed);
        return node;
      case 'For':
        node.body = this.finalize(node.body as unknown as Item[], removed);
        if (node.empty) node.empty = this.finalize(node.empty as unknown as Item[], removed);
        return node;
      case 'IfBlock':
        node.body = this.finalize(node.body as unknown as Item[], removed);
        if (node.else) node.else = this.finalize(node.else as unknown as Item[], removed);
        return node;
      default:
        return node;
    }
  }
}

// Removes the parts of a text piece that fall inside removed ranges.
function cutPiece(piece: TextPiece, removed: Range[]): TextPiece[] {
  const result: TextPiece[] = [];
  let cursor = piece.start;
  const push = (start: number, end: number): void => {
    if (end <= start) return;
    const value = piece.end - piece.start === piece.value.length
      ? piece.value.slice(start - piece.start, end - piece.start)
      : piece.value;
    result.push({ kind: 'text', start, end, value });
  };
  for (const range of removed) {
    if (range.end <= cursor) continue;
    if (range.start >= piece.end) break;
    push(cursor, Math.min(range.start, piece.end));
    cursor = Math.max(cursor, range.end);
  }
  push(cursor, piece.end);
  return result;
}
