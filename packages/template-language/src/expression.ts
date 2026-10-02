// Expression spacing: joins the expression tokens of one tag with the separators of the formatting style.

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(['true', 'false', 'null', 'in']);

function isIdent(token: string | undefined): boolean {
  return token !== undefined && IDENT.test(token) && !RESERVED.has(token);
}

// DOT_IDENT and DOT_INDEX tokens (EXP-5). They must stay adjacent to the token on their left.
function isAccessor(token: string | undefined): boolean {
  return token !== undefined && token.startsWith('.') && token !== '...';
}

// True when the token can end an operand, so that a following `-` is binary and a following `[` is an index.
function endsOperand(token: string | undefined): boolean {
  if (token === undefined) return false;
  if (token === ')' || token === ']') return true;
  if (isAccessor(token)) return true;
  if (token === 'in') return false;
  return IDENT.test(token) || /^[0-9]/.test(token) || token.startsWith('"') || token.startsWith("'");
}

/**
 * Joins expression tokens with the separators of the formatting style: one space around binary
 * and ternary operators, `|`, `=>` and `in`; one space after `,`; no space after `(`, `[`, `...`
 * and unary `!` and `-`; no space before `,`, `)`, `]` and accessors; no space between a function
 * or method name and `(`, between an operand and an index `[`, and inside `Class::name`.
 */
export function joinTokens(tokens: readonly string[]): string {
  const unary = tokens.map((token, index) => token === '!' || (token === '-' && !endsOperand(tokens[index - 1])));
  const classColon = tokens.map(() => false);
  for (let index = 0; index + 1 < tokens.length; index++) {
    if (tokens[index] === ':' && tokens[index + 1] === ':' && isIdent(tokens[index - 1]) && isIdent(tokens[index + 2])) {
      classColon[index] = true;
      classColon[index + 1] = true;
    }
  }
  let output = tokens[0] ?? '';
  for (let index = 1; index < tokens.length; index++) {
    const previous = tokens[index - 1] as string;
    const current = tokens[index] as string;
    output += separator(previous, current, unary[index - 1] === true, classColon[index - 1] === true || classColon[index] === true) + current;
  }
  return output;
}

function separator(previous: string, current: string, previousUnary: boolean, classCall: boolean): string {
  if (classCall) return '';
  if (current === ',' || current === ')' || current === ']' || isAccessor(current)) return '';
  if (previous === '(' || previous === '[' || previous === '...' || previousUnary) return '';
  if (current === '(') return isIdent(previous) || isAccessor(previous) ? '' : ' ';
  if (current === '[') return endsOperand(previous) ? '' : ' ';
  return ' ';
}
