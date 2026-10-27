// EXP-9: arithmetic-precedence verifies multiplicative precedence in the parsed tree and value.
// Expression fixtures: tokens, AST and evaluation (CNF-14).
import { expect, it } from 'vitest';
import { evaluateExpression, parseExpression, tokenizeExpression } from '../../src/expr/index.js';
import { TemplateError } from '../../src/errors.js';
import { expressionVectorsDocument } from '../../../../scripts/fixture-documents.mts';
import { exprFixture, toJsonValue } from '../helpers.js';

const cases = expressionVectorsDocument.read(exprFixture);

// Each vector is a top-level test named by its name, as the suite unit expressions of config/parity.json reads the
// results: an error vector fails the parse with its code, and any other vector has its tokens, its AST and the value of
// each evaluation.
it.each(cases.map(item => [item.name, item] as const))('%s', (_name, item) => {
  if (item.error) {
    let code: string | null = null;
    try {
      parseExpression(item.expr);
    } catch (error) {
      if (error instanceof TemplateError) code = error.code;
      else throw error;
    }
    expect(code).toBe(item.error);
    return;
  }
  expect(tokenizeExpression(item.expr)).toEqual(item.tokens);
  const ast = parseExpression(item.expr);
  expect(JSON.parse(JSON.stringify(ast))).toEqual(item.ast);
  for (const [index, evaluation] of (item.cases ?? []).entries()) {
    expect(toJsonValue(evaluateExpression(ast, evaluation.data)), `evaluation ${index}`).toEqual(evaluation.value);
  }
});
