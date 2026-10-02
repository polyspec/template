// Highlight tokens: classifies the delimiters, sigils and body of every accepted tag (EDT-8).
import type { TagParts } from './tags.js';

/** The token types of EDT-8, in the order of the LSP semantic token legend. */
export const TOKEN_TYPES = ['delimiter', 'keyword', 'variable', 'property', 'function', 'string', 'number', 'operator', 'comment', 'path'] as const;

/** One token type of EDT-8. */
export type TokenType = (typeof TOKEN_TYPES)[number];

/** A classified range of the text. `start` and `end` are string indexes. */
export interface Token {
  start: number;
  end: number;
  type: TokenType;
}

/** An expression token of the parser. */
export interface ParserToken {
  start: number;
  end: number;
  kind: 'keyword' | 'number' | 'operator' | 'string' | 'variable';
}

// Sigils, longest first, as the scanner reads them.
const SIGILS = ['?#', ':?', '=', '@', '?', ':', '/', '+', '#', '%'];
const OPERATOR = /[=+\-*/%<>!&|?:.,()[\]{}^~]/;

/**
 * Returns the tokens of one tag: its delimiters, its sigil, the parser's expression tokens and the parts of the body
 * that are not expressions (a loop variable, an assignment name, an include path, the words of a block tag or a
 * directive). `tokens` are the parser tokens inside the body, in order.
 */
export function tagTokens(text: string, kind: string, start: number, end: number, parts: TagParts, tokens: readonly ParserToken[]): Token[] {
  if (kind === 'comment') return [{ start, end, type: 'comment' }];
  const result: Token[] = [];
  const push = (from: number, to: number, type: TokenType): void => {
    if (to > from) result.push({ start: from, end: to, type });
  };
  push(start, parts.bodyStart, 'delimiter');
  let index = skipSpace(text, parts.bodyStart, parts.bodyEnd);
  const sigil = SIGILS.find(item => text.startsWith(item, index));
  if (sigil !== undefined) {
    push(index, index + sigil.length, 'keyword');
    index += sigil.length;
  }
  let next = 0;
  while (true) {
    index = skipSpace(text, index, parts.bodyEnd);
    if (index >= parts.bodyEnd) break;
    while (next < tokens.length && (tokens[next] as ParserToken).start < index) next++;
    const token = tokens[next];
    if (token !== undefined && token.start === index) {
      push(token.start, token.end, parserType(text, token, parts.bodyStart, parts.bodyEnd));
      index = token.end;
      next++;
      continue;
    }
    index = gapToken(text, kind, index, parts.bodyEnd, push);
  }
  push(parts.bodyEnd, end, 'delimiter');
  return result;
}

function parserType(text: string, token: ParserToken, bodyStart: number, bodyEnd: number): TokenType {
  if (token.kind !== 'variable') return token.kind;
  if (text[skipSpace(text, token.end, bodyEnd)] === '(') return 'function';
  if (text[token.start] === '.' || text[token.start - 1] === '.') return 'property';
  const before = previousNonSpace(text, token.start, bodyStart);
  return before === '|' ? 'function' : 'variable';
}

// Classifies the text at `index` that no parser token covers and returns the index after it.
function gapToken(text: string, kind: string, index: number, end: number, push: (from: number, to: number, type: TokenType) => void): number {
  const character = text[index] as string;
  if (character === '"' || character === "'") {
    const close = text.indexOf(character, index + 1);
    const stop = close < 0 || close >= end ? end : close + 1;
    push(index, stop, 'string');
    return stop;
  }
  if (kind === 'include' || kind === 'block' || kind === 'directive') {
    let stop = index;
    while (stop < end && text[stop] !== ' ' && text[stop] !== '\t' && text[stop] !== '\n' && text[stop] !== '\r') stop++;
    const word = text.slice(index, stop);
    push(index, stop, kind === 'directive' ? (word === 'delimiter' ? 'keyword' : 'string') : 'path');
    return stop;
  }
  const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index, end));
  if (name !== null) {
    const stop = index + name[0].length;
    push(index, stop, text[skipSpace(text, stop, end)] === '(' ? 'function' : 'variable');
    return stop;
  }
  const number = /^[0-9]+(?:\.[0-9]+)?/.exec(text.slice(index, end));
  if (number !== null) {
    push(index, index + number[0].length, 'number');
    return index + number[0].length;
  }
  let stop = index + 1;
  if (OPERATOR.test(character)) {
    while (stop < end && OPERATOR.test(text[stop] as string)) stop++;
  }
  push(index, stop, 'operator');
  return stop;
}

function skipSpace(text: string, index: number, end: number): number {
  while (index < end && (text[index] === ' ' || text[index] === '\t' || text[index] === '\n' || text[index] === '\r')) index++;
  return index;
}

function previousNonSpace(text: string, index: number, start: number): string | undefined {
  let position = index - 1;
  while (position >= start && (text[position] === ' ' || text[position] === '\t' || text[position] === '\n' || text[position] === '\r')) position--;
  return position >= start ? text[position] : undefined;
}
