// Tag body formatting: writes the body of each tag kind in the formatting style (GRM-2).
import type { SyntaxTag, SyntaxToken } from '@polyspec/template';
import { joinTokens, type ExpressionToken } from './expression.js';

/** The tag kinds that the parser reports for accepted tags. */
type TagKind = SyntaxTag['kind'];

const WHITESPACE = /^[ \t\r\n]*$/;

/** The source text of one tag body and the tokens that the parser classified inside it, its sigil first. */
export interface BodyInput {
  kind: TagKind;
  source: string;
  bodyStart: number;
  bodyEnd: number;
  tokens: readonly SyntaxToken[];
}

/**
 * Returns the formatted body of a tag, or null when the tag is kept as written: comments,
 * directives, bodies that contain a line terminator and bodies whose expression tokens do not
 * cover every non-whitespace character.
 */
export function formatBody(input: BodyInput): string | null {
  const { kind, source, bodyStart, bodyEnd, tokens } = input;
  const body = source.slice(bodyStart, bodyEnd);
  if (/[\r\n]/.test(body) || kind === 'comment' || kind === 'directive') return null;
  const sigil = tokens[0] as SyntaxToken;
  const rest = tokens.slice(1);
  const text = (token: SyntaxToken): string => source.slice(token.start, token.end);
  const after = source.slice(sigil.end, bodyEnd).trim();
  switch (kind) {
    case 'echo':
      return withRest('=', expressionText(input, rest, sigil.end));
    case 'if':
      return withRest('?', expressionText(input, rest, sigil.end));
    case 'elseif':
      return withRest(':?', expressionText(input, rest, sigil.end));
    case 'else':
      return ':';
    case 'close':
      return '/';
    case 'ifblock':
      return withRest('?#', after);
    case 'include':
      return withRest('+', after);
    case 'block':
      return withRest('#', words(after).join(' '));
    case 'for': {
      // The loop variable and its `=`, then the iterated expression.
      const [name, equals] = rest as [SyntaxToken, SyntaxToken];
      const iter = expressionText(input, rest.slice(2), equals.end);
      return iter === null ? null : `@ ${text(name)} = ${iter}`;
    }
    case 'assignment': {
      // The assigned name and its operator, then the value unless the operator is `++` or `--`.
      const [name, operator] = rest as [SyntaxToken, SyntaxToken];
      if (rest.length === 2) return WHITESPACE.test(source.slice(operator.end, bodyEnd)) ? `:${text(name)}${text(operator)}` : null;
      const value = expressionText(input, rest.slice(2), operator.end);
      return value === null ? null : `:${text(name)} ${text(operator)} ${value}`;
    }
  }
}

function withRest(sigil: string, rest: string | null): string | null {
  if (rest === null) return null;
  return rest === '' ? sigil : `${sigil} ${rest}`;
}

// Joins the expression tokens that start at `from`. Returns null when anything other than whitespace lies between them.
function expressionText(input: BodyInput, tokens: readonly SyntaxToken[], from: number): string | null {
  let cursor = from;
  const joined: ExpressionToken[] = [];
  for (const token of tokens) {
    if (!WHITESPACE.test(input.source.slice(cursor, token.start))) return null;
    joined.push({ text: input.source.slice(token.start, token.end), kind: token.kind });
    cursor = token.end;
  }
  if (!WHITESPACE.test(input.source.slice(cursor, input.bodyEnd))) return null;
  if (joined.length === 0) return null;
  return joinTokens(joined);
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
