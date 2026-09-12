// Expression parser as defined in EXP-7 to EXP-16 and AST-4, AST-5.
import { isLoopMetaField, type BinaryOp, type Expr, type List, type MapLiteral, type Span, type Spread } from '../ast.js';
import type { TemplateError } from '../errors.js';
import type { Source } from '../source.js';
import { ExpressionLexer, type LexerOptions, type Token, type TokenType } from './lexer.js';

const EQUALITY: Partial<Record<TokenType, BinaryOp>> = { EQ: '==', NE: '!=', SEQ: '===', SNE: '!==' };
const COMPARISON: Partial<Record<TokenType, BinaryOp>> = { LT: '<', GT: '>', LE: '<=', GE: '>=', IN: 'in' };
const ADDITIVE: Partial<Record<TokenType, BinaryOp>> = { PLUS: '+', MINUS: '-' };
const MULTIPLICATIVE: Partial<Record<TokenType, BinaryOp>> = { STAR: '*', SLASH: '/', PERCENT: '%' };

const EXPRESSION_START: ReadonlySet<TokenType> = new Set([
  'IDENT', 'NUMBER', 'STRING', 'NULL', 'TRUE', 'FALSE', 'LPAREN', 'LBRACKET', 'BANG', 'MINUS',
]);

export const EXPRESSION_DEPTH_LIMIT = 64;

interface BracketEntry {
  key: Expr;
  value: Expr | null;
}

export class ExpressionParser {
  readonly lexer: ExpressionLexer;
  private depth = 0;

  constructor(
    private readonly source: Source,
    start: number,
    private readonly options: LexerOptions,
    template: string,
  ) {
    this.lexer = new ExpressionLexer(source, start, options, template);
  }

  // Consumes the close delimiter of a tag (LEX-11) and returns the string index after it.
  expectClose(): number {
    const token = this.peek();
    if (token.type === 'CLOSE') {
      this.next();
      return token.end;
    }
    if (token.type === 'EOF') throw this.unexpected(token);
    const close = this.options.close as string;
    let end = -1;
    for (let k = 0; k < this.options.closeCount; k++) {
      const part = this.peek();
      if (part.value !== close || (k > 0 && part.start !== end)) throw this.unexpected(part);
      this.next();
      end = part.end;
    }
    return end;
  }

  // Whether the next token is the end of the tag or of the input.
  atEnd(): boolean {
    const token = this.peek();
    return token.type === 'CLOSE' || token.type === 'EOF';
  }

  // String index after the last consumed token.
  get end(): number {
    return this.lexer.consumedEnd;
  }

  peek(): Token {
    return this.lexer.peek();
  }

  next(): Token {
    return this.lexer.next();
  }

  unexpected(token: Token): TemplateError {
    if (this.options.openIndex !== null && this.options.close !== null) {
      const remaining = this.source.text.indexOf(this.options.close, token.start);
      if (remaining < 0) {
        return this.lexer.error('E_PARSE_UNTERMINATED_TAG', this.options.openIndex, this.options.openIndex + 1, 'tag is not terminated');
      }
    }
    if (token.type === 'EOF') {
      return this.lexer.error('E_PARSE_UNEXPECTED_TOKEN', token.start, token.start, 'unexpected end of input');
    }
    return this.lexer.error('E_PARSE_UNEXPECTED_TOKEN', token.start, token.end, `unexpected token ${JSON.stringify(token.value)}`);
  }

  expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) throw this.unexpected(token);
    return this.next();
  }

  private span(start: number, end: number): Span {
    return this.source.span(start, end);
  }

  private enter(): void {
    this.depth++;
    if (this.depth > EXPRESSION_DEPTH_LIMIT) {
      const token = this.peek();
      throw this.lexer.error('E_RUNTIME_LIMIT', token.start, token.end, `expression nesting exceeds ${EXPRESSION_DEPTH_LIMIT}`);
    }
  }

  private leave(): void {
    this.depth--;
  }

  parseExpression(): Expr {
    this.enter();
    const start = this.peek().start;
    let left = this.parseTernary();
    while (this.peek().type === 'PIPE') {
      this.next();
      const name = this.expect('IDENT');
      const args: Expr[] = [left];
      let end = name.end;
      if (this.peek().type === 'LPAREN') {
        this.next();
        this.parseArguments(args);
        end = this.expect('RPAREN').end;
      }
      left = { type: 'Call', name: name.value, args, span: this.span(start, end) };
    }
    this.leave();
    return left;
  }

  private parseTernary(): Expr {
    const start = this.peek().start;
    const test = this.parseCoalesce();
    const token = this.peek();
    if (token.type === 'QUESTION') {
      this.next();
      const then = this.parseTernary();
      this.expect('COLON');
      const otherwise = this.parseTernary();
      return { type: 'Ternary', test, then, else: otherwise, span: this.span(start, this.end) };
    }
    if (token.type === 'ELVIS') {
      this.next();
      const otherwise = this.parseTernary();
      return { type: 'Ternary', test, then: null, else: otherwise, span: this.span(start, this.end) };
    }
    return test;
  }

  private parseCoalesce(): Expr {
    const start = this.peek().start;
    const left = this.parseOr();
    if (this.peek().type !== 'COALESCE') return left;
    const operator = this.next();
    if (!EXPRESSION_START.has(this.peek().type)) {
      const literal: Expr = { type: 'Literal', kind: 'null', value: null, span: this.span(operator.end, operator.end) };
      return { type: 'Binary', op: '??', left, right: literal, span: this.span(start, operator.end) };
    }
    const right = this.parseCoalesce();
    return { type: 'Binary', op: '??', left, right, span: this.span(start, this.end) };
  }

  private parseOr(): Expr {
    const start = this.peek().start;
    let left = this.parseAnd();
    while (this.peek().type === 'OR') {
      this.next();
      const right = this.parseAnd();
      left = { type: 'Binary', op: '||', left, right, span: this.span(start, this.end) };
    }
    return left;
  }

  private parseAnd(): Expr {
    const start = this.peek().start;
    let left = this.parseEquality();
    while (this.peek().type === 'AND') {
      this.next();
      const right = this.parseEquality();
      left = { type: 'Binary', op: '&&', left, right, span: this.span(start, this.end) };
    }
    return left;
  }

  private parseEquality(): Expr {
    const start = this.peek().start;
    const left = this.parseComparison();
    const op = EQUALITY[this.peek().type];
    if (!op) return left;
    this.next();
    const right = this.parseComparison();
    const node: Expr = { type: 'Binary', op, left, right, span: this.span(start, this.end) };
    if (EQUALITY[this.peek().type]) throw this.unexpected(this.peek());
    return node;
  }

  private parseComparison(): Expr {
    const start = this.peek().start;
    const left = this.parseAdditive();
    const op = COMPARISON[this.peek().type];
    if (!op) return left;
    this.next();
    const right = this.parseAdditive();
    const node: Expr = { type: 'Binary', op, left, right, span: this.span(start, this.end) };
    if (COMPARISON[this.peek().type]) throw this.unexpected(this.peek());
    return node;
  }

  private parseAdditive(): Expr {
    const start = this.peek().start;
    let left = this.parseMultiplicative();
    for (;;) {
      const op = ADDITIVE[this.peek().type];
      if (!op) return left;
      this.next();
      const right = this.parseMultiplicative();
      left = { type: 'Binary', op, left, right, span: this.span(start, this.end) };
    }
  }

  private parseMultiplicative(): Expr {
    const start = this.peek().start;
    let left = this.parseUnary();
    for (;;) {
      const op = MULTIPLICATIVE[this.peek().type];
      if (!op) return left;
      this.next();
      const right = this.parseUnary();
      left = { type: 'Binary', op, left, right, span: this.span(start, this.end) };
    }
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (token.type === 'BANG' || token.type === 'MINUS') {
      this.next();
      this.enter();
      const operand = this.parseUnary();
      this.leave();
      return { type: 'Unary', op: token.type === 'BANG' ? '!' : '-', operand, span: this.span(token.start, this.end) };
    }
    return this.parsePostfix(false);
  }

  // Parses a postfix expression. With adjacentOnly, accessors and calls must touch the previous token (GRM-14).
  parsePostfix(adjacentOnly: boolean): Expr {
    this.enter();
    const first = this.peek();
    const start = first.start;
    let node: Expr;
    if (first.type === 'IDENT') {
      this.next();
      const after = this.peek();
      if (after.type === 'LPAREN' && (!adjacentOnly || after.start === first.end)) {
        this.next();
        const args: Expr[] = [];
        this.parseArguments(args);
        const close = this.expect('RPAREN');
        node = { type: 'Call', name: first.value, args, span: this.span(start, close.end) };
      } else if (after.type === 'DOT_IDENT' && isLoopMetaField(after.value.slice(1))) {
        this.next();
        const field = after.value.slice(1);
        if (!isLoopMetaField(field)) throw this.unexpected(after);
        node = { type: 'LoopMeta', loop: first.value, field, span: this.span(start, after.end) };
      } else {
        node = { type: 'Var', name: first.value, span: this.span(start, first.end) };
      }
    } else {
      node = this.parsePrimary();
    }
    for (;;) {
      const token = this.peek();
      if (adjacentOnly && token.start !== this.end) break;
      if (token.type === 'DOT_IDENT' || token.type === 'DOT_INDEX') {
        this.next();
        node = { type: 'Member', object: node, key: token.value.slice(1), span: this.span(start, token.end) };
      } else if (token.type === 'LBRACKET') {
        this.next();
        const index = this.parseExpression();
        const close = this.expect('RBRACKET');
        node = { type: 'Index', object: node, index, span: this.span(start, close.end) };
      } else if (token.type === 'LPAREN') {
        throw this.unexpected(token);
      } else {
        break;
      }
    }
    this.leave();
    return node;
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    switch (token.type) {
      case 'NULL':
        this.next();
        return { type: 'Literal', kind: 'null', value: null, span: this.span(token.start, token.end) };
      case 'TRUE':
      case 'FALSE':
        this.next();
        return { type: 'Literal', kind: 'bool', value: token.type === 'TRUE', span: this.span(token.start, token.end) };
      case 'NUMBER':
        this.next();
        return { type: 'Literal', kind: 'number', value: Number(token.value), span: this.span(token.start, token.end) };
      case 'STRING':
        this.next();
        return { type: 'Literal', kind: 'string', value: token.decoded ?? '', span: this.span(token.start, token.end) };
      case 'LPAREN': {
        this.next();
        const inner = this.parseExpression();
        this.expect('RPAREN');
        return inner;
      }
      case 'LBRACKET':
        return this.parseBracket();
      default:
        throw this.unexpected(token);
    }
  }

  private parseBracket(): List | MapLiteral {
    const open = this.next();
    const entries: (BracketEntry | Spread)[] = [];
    let arrows = 0;
    while (this.peek().type !== 'RBRACKET') {
      const token = this.peek();
      if (token.type === 'SPREAD') {
        this.next();
        const expr = this.parseExpression();
        entries.push({ type: 'Spread', expr, span: this.span(token.start, this.end) });
      } else {
        const key = this.parseExpression();
        if (this.peek().type === 'ARROW') {
          this.next();
          arrows++;
          entries.push({ key, value: this.parseExpression() });
        } else {
          entries.push({ key, value: null });
        }
      }
      if (this.peek().type === 'COMMA') {
        this.next();
        continue;
      }
      if (this.peek().type !== 'RBRACKET') throw this.unexpected(this.peek());
    }
    const close = this.next();
    const span = this.span(open.start, close.end);
    if (arrows === 0) {
      return { type: 'List', items: entries.map(entry => ('type' in entry ? entry : entry.key)), span };
    }
    const mapEntries: ({ key: Expr; value: Expr } | Spread)[] = [];
    for (const entry of entries) {
      if ('type' in entry) {
        mapEntries.push(entry);
      } else if (entry.value === null) {
        const [start] = entry.key.span;
        throw this.lexer.error('E_PARSE_UNEXPECTED_TOKEN', this.indexOfByte(start), this.indexOfByte(start) + 1, 'map literal entry without "=>"');
      } else {
        mapEntries.push({ key: entry.key, value: entry.value });
      }
    }
    return { type: 'Map', entries: mapEntries, span };
  }

  private parseArguments(args: Expr[]): void {
    while (this.peek().type !== 'RPAREN') {
      args.push(this.parseExpression());
      if (this.peek().type === 'COMMA') {
        this.next();
        continue;
      }
      if (this.peek().type !== 'RPAREN') throw this.unexpected(this.peek());
    }
  }

  private indexOfByte(byte: number): number {
    let low = 0;
    let high = this.source.text.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.source.byteAt(mid) < byte) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}
