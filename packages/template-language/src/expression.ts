// Expression spacing: joins the expression tokens of one tag with the separators of the formatting style.
import type { SyntaxToken } from '@polyspec/template';

/** An expression token: its text and the EDT-8 class that the parser gives it. */
export interface ExpressionToken {
  text: string;
  kind: SyntaxToken['kind'];
}

// A name that can be called or indexed: a variable or a function name, not a keyword.
function isName(token: ExpressionToken | undefined): boolean {
  return token !== undefined && (token.kind === 'variable' || (token.kind === 'function' && !token.text.startsWith('.')));
}

// DOT_IDENT and DOT_INDEX tokens (EXP-5). They must stay adjacent to the token on their left.
function isAccessor(token: ExpressionToken | undefined): boolean {
  return token !== undefined && (token.kind === 'property' || (token.kind === 'function' && token.text.startsWith('.')));
}

// True when the token can end an operand, so that a following `-` is binary and a following `[` is an index.
function endsOperand(token: ExpressionToken | undefined): boolean {
  if (token === undefined) return false;
  if (token.text === ')' || token.text === ']') return true;
  if (token.kind === 'keyword') return token.text !== 'in';
  return token.kind !== 'operator';
}

/**
 * Joins expression tokens with the separators of the formatting style: one space around binary
 * and ternary operators, `|`, `=>` and `in`; one space after `,`; no space after `(`, `[`, `...`
 * and unary `!` and `-`; no space before `,`, `)`, `]` and accessors; no space between a function
 * or method name and `(`, between an operand and an index `[`, and around the `::` token of `Class::name`.
 */
export function joinTokens(tokens: readonly ExpressionToken[]): string {
  const unary = tokens.map((token, index) => token.text === '!' || (token.text === '-' && !endsOperand(tokens[index - 1])));
  let output = tokens[0]?.text ?? '';
  for (let index = 1; index < tokens.length; index++) {
    const previous = tokens[index - 1] as ExpressionToken;
    const current = tokens[index] as ExpressionToken;
    output += separator(previous, current, unary[index - 1] === true) + current.text;
  }
  return output;
}

function separator(previous: ExpressionToken, current: ExpressionToken, previousUnary: boolean): string {
  if (previous.text === '::' || current.text === '::') return '';
  if (current.text === ',' || current.text === ')' || current.text === ']' || isAccessor(current)) return '';
  if (previous.text === '(' || previous.text === '[' || previous.text === '...' || previousUnary) return '';
  if (current.text === '(') return isName(previous) || isAccessor(previous) ? '' : ' ';
  if (current.text === '[') return endsOperand(previous) ? '' : ' ';
  return ' ';
}
