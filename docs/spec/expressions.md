# Expressions

[한국어](/ko/spec/expressions).

This document defines the expression language used inside tags: tokens, grammar, precedence, evaluation of every operator, path lookup, loop meta access, truthiness, equality and ordering. Value types, stringification and host binding are defined in [Data model](data-model.md). Functions are defined in [Functions](functions.md). Error codes are defined in [Errors](errors.md). Rules are numbered `EXP-n`.

## Tokens

**EXP-1** The expression lexer produces the tokens in the following table. Whitespace (space, tab, carriage return, line feed) separates tokens and is otherwise ignored, except for the adjacency rule in EXP-5.

| Token | Form | Notes |
| --- | --- | --- |
| IDENT | `[A-Za-z_][A-Za-z0-9_]*` | The words `true`, `false`, `null` and `in` are reserved and are never IDENT |
| NUMBER | `[0-9]+("."[0-9]+)?([eE][+-]?[0-9]+)?` | No leading `.`, no hexadecimal form, no `_` separator |
| STRING | `'...'` or `"..."` | Both quote characters have the same meaning; no interpolation |
| DOT_IDENT | `.` IDENT | Produced only under EXP-5 |
| DOT_INDEX | `.` `[0-9]+` | Produced only under EXP-5 |
| IN | `in` | Comparison operator |
| operator | `?? ?: === !== == != <= >= && \|\| ... => ? : \| + - * / % ! < > ( ) [ ] ,` | Longest match |

**EXP-2** A NUMBER token whose form does not match the table, including `1.`, `.5`, `1e`, `0x1F` and `1_000`, is E_PARSE_INVALID_NUMBER. The value of a NUMBER token is the nearest IEEE 754 double; `1e3` has the value 1000.

**EXP-3** A STRING token recognizes the escape sequences `\\`, `\'`, `\"`, `\n`, `\r`, `\t` and `\uXXXX` with four hexadecimal digits. Two consecutive `\uXXXX` escapes that form a UTF-16 surrogate pair produce one code point. Any other character after `\` is E_PARSE_INVALID_ESCAPE. A STRING token that reaches the end of the source before its closing quote is E_PARSE_UNTERMINATED_STRING at the opening quote; a tag body extends to the end of the source when no closing delimiter follows the string.

**EXP-4** The tokens `true`, `false` and `null` are literals. Their spelling is case-sensitive; `True` and `NULL` are IDENT tokens.

**EXP-5** DOT_IDENT and DOT_INDEX are produced only when the `.` is immediately adjacent, with no whitespace on either side, to a token that can end a postfix chain on its left (IDENT, `)`, `]`, DOT_IDENT, DOT_INDEX) and to the identifier or digits on its right. A `.` in any other position that is followed by a digit is E_PARSE_INVALID_NUMBER (EXP-2); a `.` in any other position not followed by a digit is E_PARSE_UNEXPECTED_TOKEN. `a.0.b` lexes as IDENT `a`, DOT_INDEX `.0`, DOT_IDENT `.b`.

**EXP-6** The following are not part of the language and are E_PARSE_UNEXPECTED_TOKEN when they appear: method calls on values, `->`, `::`, `\`, `new`, type casts, `$`, the bitwise operators `& ^ ~ << >>`, and a `{` `}` map literal.

## Grammar

**EXP-7** The grammar is the following EBNF. The start symbol is `expression`. Terminals in quotes are operator tokens; capitalized names are the tokens of EXP-1.

```ebnf
expression     = pipe ;
pipe           = ternary { "|" IDENT [ "(" [ args ] ")" ] } ;
ternary        = coalesce [ "?" ternary ":" ternary | "?:" ternary ] ;
coalesce       = or { "??" or } [ "??" ] ;
or             = and { "||" and } ;
and            = equality { "&&" equality } ;
equality       = comparison [ ( "==" | "!=" | "===" | "!==" ) comparison ] ;
comparison     = additive [ ( "<" | ">" | "<=" | ">=" | IN ) additive ] ;
additive       = multiplicative { ( "+" | "-" ) multiplicative } ;
multiplicative = unary { ( "*" | "/" | "%" ) unary } ;
unary          = ( "!" | "-" ) unary | postfix ;
postfix        = ( call | primary ) { DOT_IDENT [ "(" [ args ] ")" ] | "[" expression "]" } ;
call           = IDENT "(" [ args ] ")" ;
class-call     = IDENT "::" IDENT "(" [ args ] ")" ;
args           = expression { "," expression } [ "," ] ;
primary        = "null" | "true" | "false" | NUMBER | STRING | IDENT
               | "(" expression ")" | bracket ;
bracket        = "[" [ entry { "," entry } [ "," ] ] "]" ;
entry          = expression [ "=>" expression ] | "..." expression ;
```

**EXP-8** A token sequence that the grammar does not accept is E_PARSE_UNEXPECTED_TOKEN at the first token that cannot continue any production.

**EXP-9** Precedence, from lowest to highest, and associativity:

| Level | Operators | Associativity |
| --- | --- | --- |
| 1 | `\|` pipe | left |
| 2 | `? :`, `?:` | right |
| 3 | `??` | right |
| 4 | `\|\|` | left |
| 5 | `&&` | left |
| 6 | `==` `!=` `===` `!==` | none |
| 7 | `<` `>` `<=` `>=` `in` | none |
| 8 | `+` `-` | left |
| 9 | `*` `/` `%` | left |
| 10 | unary `!` `-` | right |
| 11 | postfix `.name` `.0` `[e]` and `name(...)` | left |

**EXP-10** An operator with associativity `none` cannot be chained without parentheses. `a == b == c` and `a < b < c` are E_PARSE_UNEXPECTED_TOKEN at the second operator.

**EXP-11** A standalone call `f(x)` calls a function by name. A member call `a.f(x)` calls a declared method on the assigned object `a`. A class call `Order::f(x)` calls a declared logical class function. `(f)(x)` and `f(x)(y)` remain E_PARSE_UNEXPECTED_TOKEN. The parser emits `MemberCall` and `ClassCall`; execution requires the corresponding declared object method or class function.

**EXP-12** A pipe step `left | f(a, b)` is equivalent to the call `f(left, a, b)`; `left | f` is equivalent to `f(left)`. The pipe is left-associative: `a | f | g(b)` is `g(f(a), b)`. The parser produces the call node; no pipe node exists.

**EXP-13** The pipe has the lowest precedence. `a ?? 'n/a' | upper` is `upper(a ?? 'n/a')`, and `c ? a : b | number` is `number(c ? a : b)`.

**EXP-14** A trailing `??` with no right operand is equivalent to `?? null`. `x ??` is `x ?? null`.

**EXP-15** A bracket literal with at least one `=>` entry is a map literal; a bracket literal without any `=>` entry is a list literal. `[]` is an empty list. In a map literal the key expression is evaluated and stringified as defined in Data model; a key that stringifies with E_RUNTIME_STRINGIFY raises that error. A later entry with the same key replaces the value of the earlier entry and keeps the earlier position.

**EXP-16** A spread entry `...e` in a list literal requires `e` to evaluate to a list and inserts its elements in order; in a map literal it requires a map and inserts its entries in order under EXP-15. Any other value is E_RUNTIME_TYPE.

## Variables and lookup

**EXP-17** An IDENT in `primary` is a variable reference. A variable that is not bound in the current scope evaluates to `null`. Scope rules are defined in [Runtime](runtime.md).

**EXP-18** `a.name`, `a.0` and `a[e]` all evaluate `lookup(container, key)` where `container` is the value on the left. For DOT_IDENT the key is the identifier as a string. For DOT_INDEX the key is the digits as a number. For `[e]` the key is the value of `e`.

**EXP-19** `lookup(container, key)` returns:

| Container | Key | Result |
| --- | --- | --- |
| map | string | The value stored under the key, or `null` when absent |
| map | number with an integer value | The value under the key obtained by stringifying the number, or `null` |
| list | number with an integer value `i` where `0 <= i < length` | The element at index `i` |
| list | string matching `^(0\|[1-9][0-9]*)$` whose integer value is in range | The element at that index |
| any other combination | any | `null` |

The last row includes `null`, string, bool and number containers, negative indexes, out-of-range indexes and fractional numbers. Lookup never raises an error; a missing value at any depth is `null`.

## Loop meta

**EXP-20** When a postfix chain starts with an IDENT followed by a DOT_IDENT whose identifier is one of `index_`, `key_`, `value_`, `last_`, `first_` and `size_`, the parser produces a LoopMeta node `{loop: IDENT, field}` for those two tokens instead of a Var node and a Member node. Further accessors apply to the LoopMeta node: `row.value_.name` is a Member node whose object is the LoopMeta node. The chains `row.x.index_` and `row['index_']` are ordinary lookups.

**EXP-21** A LoopMeta node evaluates against the innermost enclosing loop whose variable name equals `loop`. The fields are:

| Field | Value |
| --- | --- |
| `index_` | Position of the current element, starting at 0 |
| `key_` | The list index as a number, or the map key as a string |
| `value_` | The current element |
| `first_` | `true` for the first element, otherwise `false` |
| `last_` | `true` for the last element, otherwise `false` |
| `size_` | The number of elements in the iterated value |

**EXP-22** A LoopMeta node evaluated while no enclosing loop has the variable name `loop` is E_RUNTIME_UNKNOWN_LOOP.

## Operators

**EXP-23** `to_number(v)` converts a value for arithmetic: `null` is 0; `true` is 1 and `false` is 0; a number is itself; a string is trimmed of ASCII whitespace (space, tab, carriage return, line feed) and, when the remainder matches `^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$`, converted to the nearest double, otherwise E_RUNTIME_TYPE; a list or map is E_RUNTIME_TYPE.

**EXP-24** `+`: a list or map operand is E_RUNTIME_STRINGIFY. Otherwise, when either operand is a string, the result is the concatenation of `stringify(left)` and `stringify(right)` as defined in Data model. When neither operand is a string, the result is the numeric sum of `to_number(left)` and `to_number(right)`.

**EXP-25** `-` and `*`: the numeric difference and product of `to_number` of both operands.

**EXP-26** `/`: the numeric quotient of `to_number` of both operands. A divisor equal to 0 is E_RUNTIME_DIV_ZERO.

**EXP-27** `%`: both operands are converted with `to_number` and must have integer values, otherwise E_RUNTIME_TYPE. The result is the remainder of truncated division and has the sign of the dividend. A divisor equal to 0 is E_RUNTIME_DIV_ZERO.

**EXP-28** Unary `-` negates `to_number(operand)`. Unary `!` returns `true` when the operand is falsy and `false` otherwise.

**EXP-29** An arithmetic result that is not finite is E_RUNTIME_TYPE.

**EXP-30** `&&` evaluates the left operand; when it is falsy the result is `false` and the right operand is not evaluated; otherwise the result is the truthiness of the right operand. `||` evaluates the left operand; when it is truthy the result is `true` and the right operand is not evaluated; otherwise the result is the truthiness of the right operand. Both operators return a boolean.

**EXP-31** `a ?? b` returns `a` when `a` is not `null`, otherwise `b`; `b` is evaluated only when needed. `a ?: b` returns `a` when `a` is truthy, otherwise `b`. `c ? a : b` returns `a` when `c` is truthy, otherwise `b`; only the selected branch is evaluated.

**EXP-32** `left in right`: when `right` is a list, the result is `true` when some element satisfies `element == left`; when `right` is a map, the result is `true` when `stringify(left)` is a key of the map; when `right` is a string, the result is `true` when `stringify(left)` is a substring of it; any other `right` is E_RUNTIME_TYPE.

## Truthiness

**EXP-33** The falsy values are `null`, `false`, the number 0 (including -0), the empty string, the empty list and the empty map. Every other value is truthy. The string `"0"` and a string containing only whitespace are truthy.

## Equality and ordering

**EXP-34** `a == b` with both operands of the same type: two numbers compare numerically; two strings compare as code point sequences; two booleans and two `null` values compare by identity; two lists are equal when they have the same length and every pair of elements at the same index satisfies `==`; two maps are equal when they have the same key set and every value under the same key satisfies `==`, independent of entry order.

**EXP-35** `a == b` with a number and a string: when the string satisfies the conversion grammar of EXP-23 the values compare numerically, otherwise the result is `false`. Every other pair of different types is `false`; `null` equals only `null`.

**EXP-36** `a != b` is the negation of `a == b`.

**EXP-37** `a === b` is `true` only when both operands have the same type and EXP-34 holds; a number and a string are never strictly equal. `a !== b` is the negation of `a === b`.

**EXP-38** `<`, `>`, `<=` and `>=` compare two numbers numerically and two strings by code point sequence. Any other pair of types is E_RUNTIME_COMPARE.

## Examples

Data: `{"a": 2, "s": "3", "t": "x", "items": [10, 20], "m": {"k": 1, "2": "two"}}`

| Expression | Result |
| --- | --- |
| `a + 1` | `3` |
| `a + s` | `"23"` |
| `s + 1` | `"31"` |
| `a * s` | `6` |
| `a + t` | `"2x"` |
| `a * t` | E_RUNTIME_TYPE |
| `a + items` | E_RUNTIME_STRINGIFY |
| `7 % 3` | `1` |
| `-7 % 3` | `-1` |
| `a / 0` | E_RUNTIME_DIV_ZERO |
| `items.1` | `20` |
| `items.5` | `null` |
| `items['1']` | `20` |
| `m.2` | `"two"` |
| `missing.deep.path` | `null` |
| `a == s` | `false` |
| `a == 2` | `true` |
| `s == 3` | `true` |
| `s === 3` | `false` |
| `null == ''` | `false` |
| `'10' < '9'` | `true` |
| `10 < '9'` | E_RUNTIME_COMPARE |
| `a && s` | `true` |
| `t ?? 'd'` | `"x"` |
| `missing ??` | `null` |
| `'' ?: 'd'` | `"d"` |
| `'0' ? 1 : 2` | `1` |
| `1 in items` | `false` |
| `10 in items` | `true` |
| `'k' in m` | `true` |
| `2 in m` | `true` |
| `[1, ...items]` | `[1, 10, 20]` |
| `['x' => 1, 'x' => 2]` | `{"x": 2}` |
| `a ?? 0 \| number(2)` | `"2.00"` |
| `a == 1 == true` | E_PARSE_UNEXPECTED_TOKEN |
| `a.f()` | E_PARSE_UNEXPECTED_TOKEN |
