// Standalone expression API used by the expression fixtures (CNF-12 to CNF-14).
import type { Expr } from '../ast.js';
import { Source } from '../source.js';
import { AstProgramCore } from '../render/engine.js';
import { Frame, RenderContext, Scope } from '../render/context.js';
import { Evaluator } from '../render/expressions.js';
import { bindMap } from '../value/bind.js';
import type { Value } from '../value/value.js';
import { ExpressionLexer, type Token } from './lexer.js';
import { ExpressionParser } from './parser.js';

export interface ExpressionToken {
  type: string;
  value: string;
}

const BARE = { close: null, closeCount: 0, openIndex: null } as const;

// Tokens of a bare expression, whitespace omitted, ending with EOF (CNF-13).
export function tokenizeExpression(text: string): ExpressionToken[] {
  const source = Source.fromText('expression', text);
  const lexer = new ExpressionLexer(source, 0, BARE, 'expression');
  const tokens: ExpressionToken[] = [];
  for (;;) {
    const token: Token = lexer.next();
    tokens.push({ type: token.type, value: token.value });
    if (token.type === 'EOF') return tokens;
  }
}

// AST of a bare expression with spans counted from the start of the text.
export function parseExpression(text: string): Expr {
  const source = Source.fromText('expression', text);
  const parser = new ExpressionParser(source, 0, BARE, 'expression');
  const expr = parser.parseExpression();
  const trailing = parser.peek();
  if (trailing.type !== 'EOF') throw parser.unexpected(trailing);
  return expr;
}

// Evaluates a bare expression AST against root data.
export function evaluateExpression(expr: Expr, data: unknown): Value {
  const engine = new AstProgramCore();
  const root = bindMap(data ?? {});
  const context = new RenderContext(engine, root, { timezone: 'Z', now: 0 }, 'expression');
  const frame = new Frame('expression', null, root);
  return new Evaluator(context).evaluate(expr, frame, new Scope());
}
