// Expression tokens as defined in EXP-1 to EXP-6 and CNF-13.
import { errorAt, type ErrorCode, type TemplateError } from '../errors.js';
import type { Source } from '../source.js';

export type TokenType =
  | 'IDENT' | 'NUMBER' | 'STRING' | 'DOT_IDENT' | 'DOT_INDEX'
  | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET' | 'COMMA' | 'PIPE'
  | 'QUESTION' | 'COLON' | 'ELVIS' | 'COALESCE' | 'ARROW' | 'SPREAD'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT' | 'BANG'
  | 'EQ' | 'NE' | 'SEQ' | 'SNE' | 'LT' | 'GT' | 'LE' | 'GE' | 'AND' | 'OR' | 'IN'
  | 'NULL' | 'TRUE' | 'FALSE' | 'EOF'
  | 'CLOSE';

export interface Token {
  type: TokenType;
  value: string;
  // String indexes into the source text.
  start: number;
  end: number;
  // Decoded string value for STRING tokens.
  decoded?: string;
}

const OPERATORS: [string, TokenType][] = [
  ['===', 'SEQ'], ['!==', 'SNE'], ['...', 'SPREAD'],
  ['==', 'EQ'], ['!=', 'NE'], ['<=', 'LE'], ['>=', 'GE'], ['&&', 'AND'], ['||', 'OR'],
  ['??', 'COALESCE'], ['?:', 'ELVIS'], ['=>', 'ARROW'],
  ['(', 'LPAREN'], [')', 'RPAREN'], ['[', 'LBRACKET'], [']', 'RBRACKET'], [',', 'COMMA'],
  ['|', 'PIPE'], ['?', 'QUESTION'], [':', 'COLON'], ['+', 'PLUS'], ['-', 'MINUS'],
  ['*', 'STAR'], ['/', 'SLASH'], ['%', 'PERCENT'], ['!', 'BANG'], ['<', 'LT'], ['>', 'GT'],
];

// Characters that start an expression token; a close delimiter among them is lexed as its token.
const EXPRESSION_CHARS = new Set('()[],|?:=>.+-*/%!<&\'"'.split(''));

const POSTFIX_END: ReadonlySet<TokenType> = new Set(['IDENT', 'RPAREN', 'RBRACKET', 'DOT_IDENT', 'DOT_INDEX']);

function isIdentStart(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f;
}

function isIdentPart(code: number): boolean {
  return isIdentStart(code) || isDigit(code);
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a;
}

export interface LexerOptions {
  // Close delimiter character and how many times it is repeated to end the tag; null for a bare expression.
  close: string | null;
  closeCount: number;
  // String index of the tag start, used for E_PARSE_UNTERMINATED_TAG; null for a bare expression.
  openIndex: number | null;
}

export interface StringLiteral {
  decoded: string;
  end: number;
}

// Reads a string literal starting at the quote at `start` (EXP-3).
export function lexStringLiteral(source: Source, start: number, template: string): StringLiteral {
  const text = source.text;
  const quote = text[start] as string;
  const fail = (code: ErrorCode, from: number, to: number, message: string): TemplateError =>
    errorAt(code, template, source.lines, source.span(from, to), message);
  let decoded = '';
  let index = start + 1;
  for (;;) {
    if (index >= text.length) throw fail('E_PARSE_UNTERMINATED_STRING', start, start + 1, 'string literal is not terminated');
    const char = text[index] as string;
    if (char === quote) return { decoded, end: index + 1 };
    if (char !== '\\') {
      decoded += char;
      index++;
      continue;
    }
    const escape = text[index + 1];
    switch (escape) {
      case '\\': decoded += '\\'; index += 2; break;
      case "'": decoded += "'"; index += 2; break;
      case '"': decoded += '"'; index += 2; break;
      case 'n': decoded += '\n'; index += 2; break;
      case 'r': decoded += '\r'; index += 2; break;
      case 't': decoded += '\t'; index += 2; break;
      case 'u': {
        const hex = text.slice(index + 2, index + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw fail('E_PARSE_INVALID_ESCAPE', index, index + 2, 'invalid escape sequence');
        decoded += String.fromCharCode(parseInt(hex, 16));
        index += 6;
        break;
      }
      default:
        throw fail('E_PARSE_INVALID_ESCAPE', index, index + 2, 'invalid escape sequence');
    }
  }
}

export class ExpressionLexer {
  private index: number;
  private previous: Token | null = null;
  private lookahead: Token | null = null;
  private readonly closeIsExpressionChar: boolean;

  constructor(
    private readonly source: Source,
    start: number,
    private readonly options: LexerOptions,
    private readonly template: string,
  ) {
    this.index = start;
    this.closeIsExpressionChar = options.close !== null && EXPRESSION_CHARS.has(options.close);
  }

  get position(): number {
    return this.lookahead ? this.lookahead.start : this.index;
  }

  error(code: ErrorCode, start: number, end: number, message: string): TemplateError {
    return errorAt(code, this.template, this.source.lines, this.source.span(start, end), message);
  }

  peek(): Token {
    if (!this.lookahead) this.lookahead = this.read();
    return this.lookahead;
  }

  next(): Token {
    const token = this.peek();
    this.lookahead = null;
    this.previous = token;
    return token;
  }

  // Byte offset after the last consumed token.
  get consumedEnd(): number {
    return this.previous ? this.previous.end : this.index;
  }

  private read(): Token {
    const text = this.source.text;
    while (this.index < text.length && isWhitespace(text.charCodeAt(this.index))) this.index++;
    const start = this.index;
    if (start >= text.length) return { type: 'EOF', value: '', start, end: start };

    const close = this.options.close;
    if (close !== null && !this.closeIsExpressionChar) {
      const sequence = close.repeat(this.options.closeCount);
      if (text.startsWith(sequence, start)) {
        this.index = start + sequence.length;
        return { type: 'CLOSE', value: sequence, start, end: this.index };
      }
    }

    const code = text.charCodeAt(start);
    if (isIdentStart(code)) {
      let end = start + 1;
      while (end < text.length && isIdentPart(text.charCodeAt(end))) end++;
      this.index = end;
      const value = text.slice(start, end);
      const type: TokenType =
        value === 'null' ? 'NULL' : value === 'true' ? 'TRUE' : value === 'false' ? 'FALSE' : value === 'in' ? 'IN' : 'IDENT';
      return { type, value, start, end };
    }
    if (isDigit(code)) return this.readNumber(start);
    if (code === 0x22 || code === 0x27) return this.readString(start);
    if (code === 0x2e) return this.readDot(start);

    for (const [operator, type] of OPERATORS) {
      if (text.startsWith(operator, start)) {
        this.index = start + operator.length;
        return { type, value: operator, start, end: this.index };
      }
    }
    throw this.error('E_PARSE_UNEXPECTED_TOKEN', start, start + 1, `unexpected character ${JSON.stringify(text[start])}`);
  }

  private readNumber(start: number): Token {
    const text = this.source.text;
    let end = start;
    while (end < text.length && isDigit(text.charCodeAt(end))) end++;
    if (text[end] === '.' && end + 1 < text.length && isDigit(text.charCodeAt(end + 1))) {
      end++;
      while (end < text.length && isDigit(text.charCodeAt(end))) end++;
    }
    if (text[end] === 'e' || text[end] === 'E') {
      let cursor = end + 1;
      if (text[cursor] === '+' || text[cursor] === '-') cursor++;
      if (cursor < text.length && isDigit(text.charCodeAt(cursor))) {
        while (cursor < text.length && isDigit(text.charCodeAt(cursor))) cursor++;
        end = cursor;
      } else {
        throw this.error('E_PARSE_INVALID_NUMBER', start, cursor, `invalid number ${JSON.stringify(text.slice(start, cursor))}`);
      }
    }
    const following = text.charCodeAt(end);
    if (end < text.length && (isIdentPart(following) || following === 0x2e)) {
      let cursor = end + 1;
      while (cursor < text.length && (isIdentPart(text.charCodeAt(cursor)) || text[cursor] === '.')) cursor++;
      throw this.error('E_PARSE_INVALID_NUMBER', start, cursor, `invalid number ${JSON.stringify(text.slice(start, cursor))}`);
    }
    this.index = end;
    return { type: 'NUMBER', value: text.slice(start, end), start, end };
  }

  private readDot(start: number): Token {
    const text = this.source.text;
    if (text.startsWith('...', start)) {
      this.index = start + 3;
      return { type: 'SPREAD', value: '...', start, end: this.index };
    }
    const nextCode = text.charCodeAt(start + 1);
    const adjacent = this.previous !== null && this.previous.end === start && POSTFIX_END.has(this.previous.type);
    if (adjacent && isIdentStart(nextCode)) {
      let end = start + 2;
      while (end < text.length && isIdentPart(text.charCodeAt(end))) end++;
      this.index = end;
      return { type: 'DOT_IDENT', value: text.slice(start, end), start, end };
    }
    if (adjacent && isDigit(nextCode)) {
      let end = start + 2;
      while (end < text.length && isDigit(text.charCodeAt(end))) end++;
      this.index = end;
      return { type: 'DOT_INDEX', value: text.slice(start, end), start, end };
    }
    if (isDigit(nextCode)) {
      let end = start + 1;
      while (end < text.length && (isIdentPart(text.charCodeAt(end)) || text[end] === '.')) end++;
      throw this.error('E_PARSE_INVALID_NUMBER', start, end, `invalid number ${JSON.stringify(text.slice(start, end))}`);
    }
    throw this.error('E_PARSE_UNEXPECTED_TOKEN', start, start + 1, 'unexpected "."');
  }

  private readString(start: number): Token {
    const literal = lexStringLiteral(this.source, start, this.template);
    this.index = literal.end;
    return { type: 'STRING', value: this.source.text.slice(start, literal.end), start, end: literal.end, decoded: literal.decoded };
  }
}
