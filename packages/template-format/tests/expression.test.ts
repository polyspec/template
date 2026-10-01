// Token spacing rules of the formatting style.
import { describe, expect, it } from 'vitest';
import { joinTokens } from '../src/expression.js';

describe('joinTokens', () => {
  const cases: [string[], string][] = [
    [['a', '+', 'b'], 'a + b'],
    [['-', 'a', '-', '-', '1'], '-a - -1'],
    [['!', 'done', '&&', '(', 'x', '||', 'y', ')'], '!done && (x || y)'],
    [['f', '(', 'x', ',', 'g', '(', 'y', ')', ')'], 'f(x, g(y))'],
    [['obj', '.method', '(', '1', ')'], 'obj.method(1)'],
    [['Order', ':', ':', 'total', '(', 'x', ')'], 'Order::total(x)'],
    [['c', '?', 'a', ':', 'b'], 'c ? a : b'],
    [['a', '?:', 'b'], 'a ?: b'],
    [['x', '??'], 'x ??'],
    [['f', '(', 'x', '??', ')'], 'f(x ??)'],
    [['x', '|', 'slice', '(', '0', ',', '10', ')'], 'x | slice(0, 10)'],
    [['[', '1', ',', '...', 'rest', ',', ']'], '[1, ...rest,]'],
    [['[', "'a'", '=>', '1', ']'], "['a' => 1]"],
    [['list', '[', 'i', ']', '.name'], 'list[i].name'],
    [['a', '.0', '.b'], 'a.0.b'],
    [['x', 'in', '[', '1', ']'], 'x in [1]'],
    [['x', 'in', '(', 'y', ')'], 'x in (y)'],
    [['row', '.index_', '+', '1'], 'row.index_ + 1'],
    [['(', '-', '1', ')', '*', '2'], '(-1) * 2'],
  ];
  for (const [tokens, expected] of cases) {
    it(`joins ${JSON.stringify(tokens)}`, () => {
      expect(joinTokens(tokens)).toBe(expected);
    });
  }
});
