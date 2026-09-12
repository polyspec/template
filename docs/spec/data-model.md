# Data model

[한국어](/ko/spec/data-model).

This document defines the value types that templates operate on, the safe string, the conversion of values to output text, and the conversion of host language values into template values. Operators are defined in [Expressions](expressions.md). Error codes are defined in [Errors](errors.md). Rules are numbered `VAL-n`.

## Value types

**VAL-1** A value has exactly one of the following types.

| Type | Content |
| --- | --- |
| null | The single value `null` |
| bool | `true` or `false` |
| number | An IEEE 754 double-precision floating point number |
| string | A sequence of Unicode code points |
| list | An ordered sequence of values |
| map | An ordered sequence of entries; each entry has a string key and a value; keys are unique |

**VAL-2** There is one number type. An integer is a number whose value has no fractional part. An integer literal of JSON text and an integer-typed host value must have a magnitude of at most 2^53 − 1 when they enter the engine through host binding; a larger integer is E_DATA_NUMBER_RANGE. A floating point host value or a JSON number with a fraction or an exponent is accepted when it is finite. Integer arithmetic within this range is exact.

**VAL-3** The values NaN, +Infinity and -Infinity never exist. Host binding rejects them with E_DATA_NUMBER_NOT_FINITE. An arithmetic result that is not finite is E_RUNTIME_TYPE as defined in Expressions.

**VAL-4** A map preserves the insertion order of its entries in every implementation. Iteration, `keys`, `values` and `json` follow that order.

**VAL-5** A string is measured, indexed and sliced by Unicode code points. Two strings are ordered by comparing their code point sequences element by element; a shorter string that is a prefix of a longer string orders first.

## Safe string

**VAL-6** A safe string is a string that carries a safe mark. The functions `raw` and `escape` return safe strings. An echo tag writes a safe string without escaping. In every other position a safe string behaves as a string: functions, operators, `==` and `in` read its text and ignore the mark, and a function that returns a string returns a plain string.

**VAL-7** Host binding never produces a safe string. A host function that returns a string returns a plain string, as defined in [Functions](functions.md).

## Stringification

**VAL-8** `stringify(v)` converts a value to text. It is used by the echo tag, by the `+` operator when either operand is a string, by the `in` operator, by map literal keys, and by the functions `str` and `join`.

| Type | Result |
| --- | --- |
| null | The empty string |
| bool | `true` or `false` |
| number | The text defined in VAL-9 |
| string | The string itself |
| list, map | E_RUNTIME_STRINGIFY |

**VAL-9** A number `x` is converted to text as follows.

1. If `x` is 0 or -0, the result is `0`.
2. If `x` is negative, the result is `-` followed by the conversion of `-x`.
3. Let `s`, `k` and `n` be integers such that `k >= 1`, `10^(k-1) <= s < 10^k`, `s × 10^(n-k)` equals `x`, and `k` is the smallest such value. `s` is the shortest digit string that round-trips to `x`; when several `s` with the same `k` exist, the one closest to `x` is chosen, and among equals the even one.
4. If `k <= n <= 21`, the result is the `k` digits of `s` followed by `n - k` zeros.
5. Otherwise, if `0 < n <= 21`, the result is the first `n` digits of `s`, a `.`, and the remaining `k - n` digits.
6. Otherwise, if `-6 < n <= 0`, the result is `0.`, then `-n` zeros, then the `k` digits of `s`.
7. Otherwise, let `e` be `n - 1`. If `k` is 1, the result is the digit of `s`, `e`, the sign `+` or `-`, and the decimal digits of `|e|`. If `k` is greater than 1, the result is the first digit of `s`, `.`, the remaining digits, `e`, the sign, and the decimal digits of `|e|`.

| Number | Text |
| --- | --- |
| `1` | `1` |
| `1.0` | `1` |
| `-0` | `0` |
| `0.5` | `0.5` |
| `1234.5` | `1234.5` |
| `0.1 + 0.2` | `0.30000000000000004` |
| `1e21` | `1e+21` |
| `123456789012345680000` | `123456789012345680000` |
| `0.000001` | `0.000001` |
| `1e-7` | `1e-7` |
| `1.5e-7` | `1.5e-7` |
| `2^53 - 1` | `9007199254740991` |

**VAL-10** Each implementation obtains the digits `s` and the exponent `n` with the shortest round-trip conversion of its platform and then applies steps 4 to 7 of VAL-9.

| Implementation | Digit source |
| --- | --- |
| TypeScript | `String(x)` produces the complete result |
| Go | `strconv.FormatFloat(x, 'e', -1, 64)` gives the digits and the exponent |
| Rust | `format!("{:e}", x)` gives the digits and the exponent |
| PHP | `json_encode($x)` or `var_export($x, true)` with `serialize_precision` set to `-1` gives the digits and the exponent |

## Host binding

**VAL-11** Host binding converts a value of the host language into a template value before rendering. Binding is applied to assign data, to template definition data, to scope arguments computed by the host, and to the return value of a host function. The conversion tables in VAL-12 to VAL-16 are the complete set of accepted inputs; any other input is E_DATA_UNSUPPORTED_TYPE.

**VAL-12** JSON text is the reference form of assign data. Every implementation accepts JSON text and produces the same values. Each implementation parses JSON text with a parser that preserves document order and detects an integer outside the safe range; the TypeScript implementation provides this parser in the package and does not use `JSON.parse` for assign data.

| JSON | Value |
| --- | --- |
| `null` | null |
| `true`, `false` | bool |
| number | number; an integer literal outside ±(2^53 − 1) is E_DATA_NUMBER_RANGE; a literal that does not fit a finite double is E_DATA_NUMBER_NOT_FINITE |
| string | string; a text that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| array | list, in document order |
| object | map, in document order; a duplicate key replaces the earlier value and keeps the earlier position |

**VAL-13** TypeScript and JavaScript.

| Input | Value |
| --- | --- |
| `null`, `undefined` | null |
| `boolean` | bool |
| `number` | number; a value that is not finite is E_DATA_NUMBER_NOT_FINITE |
| `bigint` | number when within ±(2^53 − 1), otherwise E_DATA_NUMBER_RANGE |
| `string` | string |
| `Array` | list |
| `Map` with string keys | map, in insertion order |
| plain object | map, in property enumeration order of the platform; integer-like keys enumerate first in ascending order, so a JSON object with such keys must be bound from JSON text, not from a parsed object |
| `Date`, function, class instance, symbol, `Map` with a non-string key | E_DATA_UNSUPPORTED_TYPE |

**VAL-14** PHP.

| Input | Value |
| --- | --- |
| `null` | null |
| `bool` | bool |
| `int` | number; a value outside ±(2^53 − 1) is E_DATA_NUMBER_RANGE |
| `float` | number; a value that is not finite is E_DATA_NUMBER_NOT_FINITE |
| `string` | string; a value that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| `array` for which `array_is_list()` is true | list |
| other `array` | map; each key is converted to a string; an integer key `1` becomes the key `"1"` |
| `stdClass`, object implementing `JsonSerializable` | map, from the object properties or from `jsonSerialize()` |
| other object, resource | E_DATA_UNSUPPORTED_TYPE |

**VAL-15** Go.

| Input | Value |
| --- | --- |
| `nil` | null |
| `bool` | bool |
| `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64` | number; a value outside ±(2^53 − 1) is E_DATA_NUMBER_RANGE |
| `float32`, `float64` | number; a value that is not finite is E_DATA_NUMBER_NOT_FINITE |
| `string` | string; a value that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| slice | list |
| the insertion-ordered map type provided by the package | map, in insertion order |
| `map[string]T` | map with the keys sorted by byte order |
| struct | map with one entry per exported field in declaration order, keyed by the `json` tag name or the field name |
| other | E_DATA_UNSUPPORTED_TYPE |

**VAL-16** Rust.

| Input | Value |
| --- | --- |
| `serde_json::Value::Null` | null |
| `serde_json::Value::Bool` | bool |
| `serde_json::Value::Number` | number; an `i64` or `u64` outside ±(2^53 − 1) is E_DATA_NUMBER_RANGE; an `f64` that is not finite is E_DATA_NUMBER_NOT_FINITE |
| `serde_json::Value::String` | string |
| `serde_json::Value::Array` | list |
| `serde_json::Value::Object` | map, in insertion order; the `preserve_order` feature of `serde_json` is required |

**VAL-17** Map keys are strings in every host. A host map whose key is not a string is converted only where a table above defines the conversion; otherwise it is E_DATA_UNSUPPORTED_TYPE.

**VAL-18** Binding does not copy semantics from the host: an object reference, a resource handle or a function is never stored in a value. Rendering reads values and never writes back to host data.

## Examples

| Input (JSON) | `stringify` of the value |
| --- | --- |
| `null` | `` (empty) |
| `true` | `true` |
| `12.50` | `12.5` |
| `1e2` | `100` |
| `"a"` | `a` |
| `[1]` | E_RUNTIME_STRINGIFY |
| `{"a": 1}` | E_RUNTIME_STRINGIFY |
