# Expression fixtures

[한국어](README.ko.md).

`cases.json` is a list of expression cases. Every implementation loads the file in its own test suite and checks each case with its expression lexer, its expression parser and its evaluator.

## Case shape

A case that parses has `name`, `expr`, `tokens`, `ast` and `cases`. A case that does not parse has `name`, `expr` and `error`.

```json
{
  "name": "add-numbers",
  "expr": "a + 1",
  "tokens": [
    { "type": "IDENT", "value": "a" },
    { "type": "PLUS", "value": "+" },
    { "type": "NUMBER", "value": "1" },
    { "type": "EOF", "value": "" }
  ],
  "ast": {
    "type": "Binary", "op": "+", "span": [0, 5],
    "left": { "type": "Var", "name": "a", "span": [0, 1] },
    "right": { "type": "Literal", "kind": "number", "value": 1, "span": [4, 5] }
  },
  "cases": [
    { "data": { "a": 2 }, "value": 3 },
    { "data": { "a": "2" }, "value": "21" }
  ]
}
```

- `expr` is the expression source without a tag.
- `tokens` lists the tokens in order with the type names of the conformance document. `value` is the source text of the token; a string token keeps its quotes. Whitespace produces no token. The last token is `EOF` with an empty value.
- `ast` is the expression node of the AST document. Spans are byte offsets counted from the start of `expr`. A literal that the parser adds for a trailing `??` has an empty span at the end of the operator.
- `cases` lists render data objects and the value of the expression evaluated with that data as the root data, with no enclosing loop and with the default environment.
- `error` is the error code that parsing must raise.

## Checks

1. The token stream of `expr` equals `tokens`.
2. The parsed AST of `expr` equals `ast`. Object key order is not compared.
3. For each entry of `cases`, the value of `expr` evaluated with `data` equals `value`. Values are compared as JSON. A safe string compares as a plain string.

A case with `error` checks that parsing `expr` raises that code.

## Coverage

The file covers literals of every kind, string escapes, variables, member paths, numeric member access, bracket index, calls, calls with a trailing comma, accessors after a call, pipes with and without arguments, pipe chains, pipe precedence, every binary operator, unary operators, precedence and grouping, the trailing `??` form, the elvis form, nested ternaries, `in` with a list, a map and a string, list and map literals, spread in both literal kinds, and parse errors for non-associative chains, invalid numbers, invalid escapes, unterminated strings, method calls, calls on call results, empty input, whitespace around `.`, `->` and `{}` map literals.
