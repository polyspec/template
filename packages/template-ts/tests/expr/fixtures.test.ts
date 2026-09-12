// Expression fixtures: tokens, AST and evaluation (CNF-14).
import { describe, expect, it } from 'vitest';
import { evaluateExpression, parseExpression, tokenizeExpression } from '../../src/expr/index.js';
import { TemplateError } from '../../src/errors.js';
import { exprFixture, readJson, toJsonValue } from '../helpers.js';

interface ExprCase {
  name: string;
  expr: string;
  tokens?: { type: string; value: string }[];
  ast?: unknown;
  cases?: { data: unknown; value: unknown }[];
  error?: string;
}

const cases = readJson(exprFixture) as ExprCase[];

describe('expression fixtures', () => {
  for (const item of cases) {
    if (item.error) {
      it(`${item.name} raises ${item.error}`, () => {
        let code: string | null = null;
        try {
          parseExpression(item.expr);
        } catch (error) {
          if (error instanceof TemplateError) code = error.code;
          else throw error;
        }
        expect(code).toBe(item.error);
      });
      continue;
    }
    it(`${item.name} tokens`, () => {
      expect(tokenizeExpression(item.expr)).toEqual(item.tokens);
    });
    it(`${item.name} ast`, () => {
      expect(JSON.parse(JSON.stringify(parseExpression(item.expr)))).toEqual(item.ast);
    });
    for (const [index, evaluation] of (item.cases ?? []).entries()) {
      it(`${item.name} value ${index}`, () => {
        const ast = parseExpression(item.expr);
        expect(toJsonValue(evaluateExpression(ast, evaluation.data))).toEqual(evaluation.value);
      });
    }
  }
});
