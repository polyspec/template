# Functions

[한국어](functions.ko.md).

This document defines the built-in functions, the pipe form, the safe string rules and the host function registration contract. Value conversion rules (stringify, truthiness, to_number, equality) are defined in [data-model.md](data-model.md). Expression syntax is defined in [expressions.md](expressions.md). Error codes are defined in [errors.md](errors.md).

## Calls and pipes

- **FUN-1** A function call is `name(arg, ...)`. The pipe form `a | name(b, ...)` is equivalent to `name(a, b, ...)`. A pipe without parentheses `a | name` is equivalent to `name(a)`.
- **FUN-2** Function names are a namespace separate from variable names. A variable named `length` and the function `length` do not conflict.
- **FUN-3** The number of arguments is checked at evaluation time. A call with fewer arguments than the required count or more than the accepted count fails with `E_RUNTIME_ARITY`.
- **FUN-4** A call to a name that is neither a built-in function nor a registered host function fails with `E_RUNTIME_UNKNOWN_FUNCTION`.
- **FUN-5** String positions and lengths count Unicode code points.
- **FUN-6** An argument whose type is not accepted by the function fails with `E_RUNTIME_TYPE` unless the function definition states another result.

## Safe strings

- **FUN-7** A safe string is a string value that the echo tag writes without HTML escaping. Only `raw` and `escape` return safe strings.
- **FUN-8** Every other function that receives a safe string uses its text and returns a plain string.
- **FUN-9** A safe string compares, concatenates and stringifies as its text.

## Built-in functions

### Output

| Function | Arguments | Result |
| --- | --- | --- |
| `escape(v)` | any | Stringify `v`, replace `&` `<` `>` `"` `'` with `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`, return a safe string |
| `raw(v)` | any | Stringify `v` and return it as a safe string |
| `json(v)` | any | JSON text of `v`; see `json` below |
| `url(s)` | string | Percent-encoded text; see `url` below |
| `nl2br(s)` | string | Insert `<br>` before every `\n`; `\r\n` becomes `<br>\n`; return a plain string |

- **FUN-10** `escape` applies exactly the five replacements listed and no others.
- **FUN-11** `nl2br` returns a plain string. To output it unescaped, use `escape` first and `raw` last: `{= text | escape | nl2br | raw}`.

### String

| Function | Arguments | Result |
| --- | --- | --- |
| `upper(s)` | string | ASCII letters `a`–`z` replaced by `A`–`Z`; other characters unchanged |
| `lower(s)` | string | ASCII letters `A`–`Z` replaced by `a`–`z`; other characters unchanged |
| `trim(s, chars=" \t\r\n")` | string, string | `s` without leading and trailing characters contained in `chars` |
| `replace(s, from, to)` | string, string, string | Every literal occurrence of `from` replaced by `to`; when `from` is empty, `s` unchanged |
| `split(s, sep)` | string, string | List of substrings separated by `sep`; empty `sep` fails with `E_RUNTIME_TYPE` |
| `truncate(s, n, suffix="...")` | string, number, string | When the length of `s` exceeds `n`, the first `n` code points followed by `suffix`; otherwise `s` |
| `contains(h, n)` | string or list, any | `true` when `n` is a substring of `h`, or when a list element equals `n` by `==` |
| `starts_with(s, p)` | string, string | `true` when `s` begins with `p` |
| `ends_with(s, p)` | string, string | `true` when `s` ends with `p` |

- **FUN-12** `upper` and `lower` change ASCII letters only.
- **FUN-13** `split` with a `sep` that does not occur returns a one-element list containing `s`. `split("", ",")` returns `[""]`.

### Collection

| Function | Arguments | Result |
| --- | --- | --- |
| `length(v)` | any | Code point count of a string, element count of a list, entry count of a map, `0` for null; other types fail with `E_RUNTIME_TYPE` |
| `keys(m)` | map or list | List of the keys of a map in insertion order; for a list, the indices as numbers |
| `values(m)` | map or list | List of the values of a map in insertion order; a list unchanged |
| `first(v)` | list or string | First element or first code point; `null` when empty |
| `last(v)` | list or string | Last element or last code point; `null` when empty |
| `reverse(v)` | list or string | Elements or code points in reverse order |
| `slice(v, start, length?)` | list or string, number, number | Sub-list or substring; see `slice` below |
| `sort(list, key?)` | list, string | Stable ascending sort; see `sort` below |
| `join(list, sep=",")` | list, string | Elements stringified and concatenated with `sep` |
| `range(from, to, step=1)` | number, number, number | List from `from` to `to` inclusive in increments of `step` |
| `default(v, d)` | any, any | `d` when `v` is falsy; otherwise `v` |

- **FUN-14** `range` with `step` equal to `0` fails with `E_RUNTIME_TYPE`. `range` with a negative `step` counts down. `range` whose element count exceeds 1,000,000 fails with `E_RUNTIME_LIMIT`. When `step` does not reach `to`, the list is empty.
- **FUN-15** `default` tests truthiness; `??` in an expression tests only for `null`.

### Number

| Function | Arguments | Result |
| --- | --- | --- |
| `number(x, decimals=0, dec=".", thousands=",")` | any, number, string, string | Formatted decimal text; see `number` below |
| `round(x, d=0)` | any, number | Number rounded to `d` decimals by the `number` rounding rule |
| `floor(x)` | any | Largest integer not greater than `x` |
| `ceil(x)` | any | Smallest integer not less than `x` |
| `abs(x)` | any | Absolute value |
| `min(a, b, ...)` | numbers | Smallest argument |
| `max(a, b, ...)` | numbers | Largest argument |
| `num(v)` | any | `to_number(v)` |

- **FUN-16** `number`, `round`, `floor`, `ceil`, `abs` and `num` convert their first argument with `to_number`; a value that cannot be converted fails with `E_RUNTIME_TYPE`.
- **FUN-17** `min` and `max` require at least one argument and accept only numbers.

### Value

| Function | Arguments | Result |
| --- | --- | --- |
| `str(v)` | any | Stringified `v` as a plain string |
| `type(v)` | any | One of `"null"`, `"bool"`, `"number"`, `"string"`, `"list"`, `"map"` |

- **FUN-18** `str` of a list or a map fails with `E_RUNTIME_STRINGIFY`.
- **FUN-19** `type` of a safe string is `"string"`.

### Time

| Function | Arguments | Result |
| --- | --- | --- |
| `date(v, fmt)` | number or string or null, string | Formatted date text; see `date` below |
| `now()` | none | `env.now` as a number of unix seconds |

## number

- **FUN-20** `x` is converted with `to_number`. `decimals` is a non-negative integer.
- **FUN-21** The shortest round-trip decimal digits of `x` are expanded to positional notation without exponent.
- **FUN-22** The positional digit string is rounded to `decimals` fraction digits with the half-away-from-zero rule applied to the decimal digits. `number(2.675, 2)` returns `2.68`. `number(1.005, 2)` returns `1.01`. `number(-2.5)` returns `-3`.
- **FUN-23** The integer part is grouped in threes from the right with `thousands`. The fraction part is joined with `dec`. When `decimals` is `0`, `dec` is not written.
- **FUN-24** A result whose every digit is zero has no minus sign. `number(-0.001, 2)` returns `0.00`.
- **FUN-25** `round(x, d)` applies FUN-20 to FUN-22 and returns the rounded value as a number.

## json

- **FUN-26** `json(v)` returns compact JSON text without whitespace. Map keys are written in insertion order. Numbers are written by the number-to-string rule of the data model.
- **FUN-27** Strings are escaped per JSON, and additionally `<` is written as `\u003c`, `>` as `\u003e`, `&` as `\u0026`, U+2028 as `\u2028` and U+2029 as `\u2029`. `/` and non-ASCII characters are written as themselves.
- **FUN-28** The result is a plain string. An echo tag therefore escapes it, which is correct in element text and in an attribute value of either quote style. A script element receives the JSON text with `{= json(v) | raw}`; the escaping of FUN-27 keeps that text inside a script element. A safe string given to `json` is written as a JSON string of its text.
- **FUN-49** A structural quote of JSON cannot be escaped, so JSON text is never safe in a double-quoted attribute without escaping. This is the reason FUN-28 returns a plain string.

## url

- **FUN-29** `url(s)` stringifies `s`, encodes it as UTF-8 and replaces every byte except `A`–`Z`, `a`–`z`, `0`–`9`, `-`, `_`, `.`, `~` by `%` followed by two uppercase hexadecimal digits.
- **FUN-30** The result is a plain string. When written by the echo tag it is HTML-escaped.

## slice

- **FUN-31** `slice(v, start, length?)` accepts a list or a string. `start` and `length` are converted to integers by truncation.
- **FUN-32** A negative `start` counts from the end: `start + length(v)`. A `start` below `0` after that adjustment is clamped to `0`. A `start` beyond the end returns an empty result.
- **FUN-33** When `length` is omitted, the result extends to the end. A negative `length` returns an empty result. A `length` beyond the end is clamped.

## sort

- **FUN-34** `sort(list, key?)` returns a new list sorted in ascending order with a stable algorithm. The input list is not modified.
- **FUN-35** Without `key`, the elements are compared. With `key`, the value at path `key` of each element is compared; `key` is a path string such as `"price"` or `"user.name"` resolved by the lookup rule of the expression language.
- **FUN-36** All compared values are numbers, or all are strings. Strings are compared by code point. A mix of types, or a value that is not a number or a string, fails with `E_RUNTIME_TYPE`.

## date

- **FUN-37** `v` is a number of unix seconds (a fraction is truncated toward zero), or a string in one of the forms `YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DDTHH:MM:SS`, each optionally followed by `Z` or `±HH:MM`. A string without offset is interpreted in `env.timezone`. A date-only string has the time `00:00:00`.
- **FUN-38** `v` equal to `null` returns `""`. Any other type or an unparseable string fails with `E_RUNTIME_TYPE`.
- **FUN-39** The output is computed in `env.timezone`. `env.timezone` is `Z` or a fixed offset `±HH:MM`. Named time zones are not supported and no time zone database is used.
- **FUN-40** Format tokens:

| Token | Output |
| --- | --- |
| `Y` | Four-digit year |
| `y` | Two-digit year |
| `m` | Month `01`–`12` |
| `n` | Month `1`–`12` |
| `d` | Day `01`–`31` |
| `j` | Day `1`–`31` |
| `H` | Hour `00`–`23` |
| `G` | Hour `0`–`23` |
| `i` | Minute `00`–`59` |
| `s` | Second `00`–`59` |
| `D` | `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` |
| `l` | `Monday` to `Sunday` |
| `N` | Day of week `1` (Monday) to `7` (Sunday) |
| `w` | Day of week `0` (Sunday) to `6` (Saturday) |
| `M` | `Jan` to `Dec` |
| `F` | `January` to `December` |
| `U` | Unix seconds |
| `P` | Offset `±HH:MM` |

- **FUN-41** `\` followed by a character writes that character. Any other character is written unchanged.
- **FUN-42** `now()` returns `env.now`. `env.now` is a number of unix seconds; when the host does not set it, the host uses its current time. Conformance fixtures always set `env.now` and `env.timezone`.

## Host functions

- **FUN-43** A host registers a function with `register(name, fn)`. `name` is an identifier. `fn` receives the argument list as values and returns a value.
- **FUN-44** Registering a name that is a built-in function fails at registration time. Registering a name twice replaces the earlier function.
- **FUN-45** The returned value is converted by the host binding rules of the data model. A value that cannot be converted fails with the corresponding `E_DATA_*` code.
- **FUN-46** An error thrown by `fn` fails the render with `E_RUNTIME_HOST_FUNCTION` and the position of the call in the template.
- **FUN-47** Every host that renders a template registers the same function names. A template that calls a name registered in one host only fails in the other host with `E_RUNTIME_UNKNOWN_FUNCTION`.
- **FUN-48** A host function that returns a string returns a plain string. A host cannot return a safe string; a template applies `raw` to the result when it must be written unescaped.
