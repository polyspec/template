// Highlight tokens: the legend of the token types that the parser gives every part of an accepted tag (EDT-8).
import type { SyntaxToken } from '@polyspec/template';

/** The token types of EDT-8, in the order of the LSP semantic token legend. */
export const TOKEN_TYPES = ['delimiter', 'keyword', 'variable', 'property', 'function', 'string', 'number', 'operator', 'comment', 'path'] as const satisfies readonly SyntaxToken['kind'][];

/** One token type of EDT-8. */
export type TokenType = (typeof TOKEN_TYPES)[number];

/** A classified range of the text. `start` and `end` are string indexes. */
export interface Token {
  start: number;
  end: number;
  type: TokenType;
}
