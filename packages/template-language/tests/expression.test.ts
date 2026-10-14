// Token spacing rules of the formatting style, over expression tokens with the classes the parser gives them (EDT-8).
import type { SyntaxToken } from '@polyspec/template';
import { describe, expect, it } from 'vitest';
import { joinTokens } from '../src/expression.js';

describe('joinTokens', () => {
  const cases: [[string, SyntaxToken['kind']][], string][] = [
    [[["a", 'variable'], ["+", 'operator'], ["b", 'variable']], 'a + b'],
    [[["-", 'operator'], ["a", 'variable'], ["-", 'operator'], ["-", 'operator'], ["1", 'number']], '-a - -1'],
    [[["!", 'operator'], ["done", 'variable'], ["&&", 'operator'], ["(", 'operator'], ["x", 'variable'], ["||", 'operator'], ["y", 'variable'], [")", 'operator']], '!done && (x || y)'],
    [[["f", 'function'], ["(", 'operator'], ["x", 'variable'], [",", 'operator'], ["g", 'function'], ["(", 'operator'], ["y", 'variable'], [")", 'operator'], [")", 'operator']], 'f(x, g(y))'],
    [[["obj", 'variable'], [".method", 'function'], ["(", 'operator'], ["1", 'number'], [")", 'operator']], 'obj.method(1)'],
    [[["Order", 'variable'], ["::", 'operator'], ["total", 'function'], ["(", 'operator'], ["x", 'variable'], [")", 'operator']], 'Order::total(x)'],
    [[["c", 'variable'], ["?", 'operator'], ["Order", 'variable'], ["::", 'operator'], ["total", 'function'], ["(", 'operator'], ["x", 'variable'], [")", 'operator'], [":", 'operator'], ["b", 'variable']], 'c ? Order::total(x) : b'],
    [[["c", 'variable'], ["?", 'operator'], ["a", 'variable'], [":", 'operator'], ["b", 'variable']], 'c ? a : b'],
    [[["c", 'variable'], ["?", 'operator'], ["d", 'variable'], ["?", 'operator'], ["e", 'variable'], [":", 'operator'], ["a", 'variable'], [":", 'operator'], ["b", 'variable']], 'c ? d ? e : a : b'],
    [[["a", 'variable'], ["?:", 'operator'], ["b", 'variable']], 'a ?: b'],
    [[["x", 'variable'], ["??", 'operator']], 'x ??'],
    [[["f", 'function'], ["(", 'operator'], ["x", 'variable'], ["??", 'operator'], [")", 'operator']], 'f(x ??)'],
    [[["x", 'variable'], ["|", 'operator'], ["slice", 'function'], ["(", 'operator'], ["0", 'number'], [",", 'operator'], ["10", 'number'], [")", 'operator']], 'x | slice(0, 10)'],
    [[["[", 'operator'], ["1", 'number'], [",", 'operator'], ["...", 'operator'], ["rest", 'variable'], [",", 'operator'], ["]", 'operator']], '[1, ...rest,]'],
    [[["[", 'operator'], ["'a'", 'string'], ["=>", 'operator'], ["1", 'number'], ["]", 'operator']], "['a' => 1]"],
    [[["list", 'variable'], ["[", 'operator'], ["i", 'variable'], ["]", 'operator'], [".name", 'property']], 'list[i].name'],
    [[["a", 'variable'], [".0", 'property'], [".b", 'property']], 'a.0.b'],
    [[["x", 'variable'], ["in", 'keyword'], ["[", 'operator'], ["1", 'number'], ["]", 'operator']], 'x in [1]'],
    [[["x", 'variable'], ["in", 'keyword'], ["(", 'operator'], ["y", 'variable'], [")", 'operator']], 'x in (y)'],
    [[["row", 'variable'], [".index_", 'property'], ["+", 'operator'], ["1", 'number']], 'row.index_ + 1'],
    [[["(", 'operator'], ["-", 'operator'], ["1", 'number'], [")", 'operator'], ["*", 'operator'], ["2", 'number']], '(-1) * 2'],
  ];
  for (const [tokens, expected] of cases) {
    it(`joins ${JSON.stringify(tokens)}`, () => {
      expect(joinTokens(tokens.map(([text, kind]) => ({ text, kind })))).toBe(expected);
    });
  }
});
