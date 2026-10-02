// Tag body formatting: writes the body of each tag kind in the formatting style (GRM-2).
import { joinTokens } from './expression.js';

/** The tag kinds that the parser reports for accepted tags. */
export type TagKind = 'assignment' | 'block' | 'close' | 'comment' | 'directive' | 'echo' | 'else' | 'elseif' | 'for' | 'if' | 'ifblock' | 'include';

/** An expression token with its string range in the source. */
export interface TokenRange {
  start: number;
  end: number;
}

const LOOP_HEAD = /^@[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/;
const ASSIGN_HEAD = /^:[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*/%]=|=)/;
const WHITESPACE = /^[ \t\r\n]*$/;

/** The source text of one tag body and the expression tokens that the parser read inside it. */
export interface BodyInput {
  kind: TagKind;
  source: string;
  bodyStart: number;
  bodyEnd: number;
  tokens: readonly TokenRange[];
}

/**
 * Returns the formatted body of a tag, or null when the tag is kept as written: comments,
 * directives, bodies that contain a line terminator and bodies whose expression tokens do not
 * cover every non-whitespace character.
 */
export function formatBody(input: BodyInput): string | null {
  const { kind, source, bodyStart, bodyEnd } = input;
  const body = source.slice(bodyStart, bodyEnd);
  if (/[\r\n]/.test(body)) return null;
  const lead = body.length - body.trimStart().length;
  const head = body.slice(lead);
  const at = bodyStart + lead;
  const expression = (from: number): string | null => expressionText(input, from);
  switch (kind) {
    case 'comment':
    case 'directive':
      return null;
    case 'echo':
      return withRest('=', expression(at + 1));
    case 'if':
      return withRest('?', expression(at + 1));
    case 'elseif':
      return withRest(':?', expression(at + 2));
    case 'else':
      return ':';
    case 'close':
      return '/';
    case 'ifblock':
      return withRest('?#', head.slice(2).trim());
    case 'include':
      return withRest('+', head.slice(1).trim());
    case 'block':
      return withRest('#', words(head.slice(1)).join(' '));
    case 'for': {
      const match = LOOP_HEAD.exec(head);
      if (!match) return null;
      const iter = expression(at + match[0].length);
      return iter === null ? null : `@ ${match[1]} = ${iter}`;
    }
    case 'assignment': {
      const match = ASSIGN_HEAD.exec(head);
      if (!match) return null;
      const operator = match[2] as string;
      if (operator === '++' || operator === '--') {
        return source.slice(at + match[0].length, bodyEnd).trim() === '' ? `:${match[1]}${operator}` : null;
      }
      const value = expression(at + match[0].length);
      return value === null ? null : `:${match[1]} ${operator} ${value}`;
    }
  }
}

function withRest(sigil: string, rest: string | null): string | null {
  if (rest === null) return null;
  return rest === '' ? sigil : `${sigil} ${rest}`;
}

// Joins the tokens in [from, bodyEnd). Returns null when anything other than whitespace lies between them.
function expressionText(input: BodyInput, from: number): string | null {
  const tokens = input.tokens.filter(token => token.start >= from && token.end <= input.bodyEnd);
  let cursor = from;
  const texts: string[] = [];
  for (const token of tokens) {
    if (!WHITESPACE.test(input.source.slice(cursor, token.start))) return null;
    texts.push(input.source.slice(token.start, token.end));
    cursor = token.end;
  }
  if (!WHITESPACE.test(input.source.slice(cursor, input.bodyEnd))) return null;
  if (texts.length === 0) return null;
  return joinTokens(texts);
}

// Splits a block tag body at horizontal whitespace outside string literals.
function words(text: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string;
    if (quote !== null) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current !== '') result.push(current);
      current = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    current += char;
  }
  if (current !== '') result.push(current);
  return result;
}
