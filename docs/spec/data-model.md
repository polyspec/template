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

**VAL-2** There is one number type. An integer is a number whose value has no fractional part. Host binding accepts a number only when it is finite and its magnitude is at most 2^53 − 1 (9007199254740991). The rule depends only on the numeric value, never on the host type or on the spelling of a JSON literal: an integer-typed host value, a floating point host value, a JSON integer literal and a JSON literal with a fraction or an exponent are checked alike. A value that is NaN or infinite is E_DATA_NUMBER_NOT_FINITE (VAL-3). A finite value whose magnitude is greater than 2^53 − 1 is E_DATA_NUMBER_RANGE. Every floating point number of such a magnitude is an integer, so `1e19`, `2^53` and `9007199254740992.0` are all E_DATA_NUMBER_RANGE. A JSON literal is first converted to the nearest double; a literal whose nearest double is infinite, such as `1e400`, is E_DATA_NUMBER_NOT_FINITE. An integer-typed host value is compared exactly. A number that template arithmetic produces is not host binding; only VAL-3 applies to it. Integer arithmetic within the binding range is exact.

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

**VAL-11** Host binding converts a value of the host language into a template value. Binding is applied to assign data, to template definition data, to scope arguments computed by the host, to the return value of a host function, a logical class function and an instance method, and to the value of a native object member that a template reads (VAL-19). The conversion tables in VAL-12 to VAL-16 are the complete set of accepted inputs; any other input is E_DATA_UNSUPPORTED_TYPE. VAL-17 to VAL-20 apply in every host.

**VAL-12** JSON text is the reference form of assign data. Every implementation accepts JSON text and produces the same values. Each implementation parses JSON text with a parser that preserves document order and applies the number rule of VAL-2 and the depth limit of VAL-20; the TypeScript implementation provides this parser in the package and does not use `JSON.parse` for assign data.

| JSON | Value |
| --- | --- |
| `null` | null |
| `true`, `false` | bool |
| number | number under VAL-2 |
| string | string; a text that is not valid UTF-8 is E_DATA_INVALID_UTF8; a `\u` escape that produces a surrogate code point (U+D800 to U+DFFF) outside a high-low surrogate pair is E_DATA_INVALID_UTF8 |
| array | list, in document order |
| object | map, in document order; a key follows the string row; a duplicate key replaces the earlier value and keeps the earlier position |

Arrays and objects that nest deeper than the limit of VAL-20 are E_DATA_DEPTH. The parser fails at the first array or object that exceeds the limit, before it reads the rest of the text.

**VAL-13** TypeScript and JavaScript.

| Input | Value |
| --- | --- |
| `null`, `undefined` | null |
| `boolean` | bool |
| `number` | number under VAL-2 |
| `bigint` | number under VAL-2 |
| `string` | string; a string that is not well-formed UTF-16, that is, a string that contains a surrogate code unit outside a high-low pair, is E_DATA_INVALID_UTF8 |
| `Array` | list |
| `Map` with string keys | map, in insertion order; a key follows the `string` row |
| plain object, whose prototype is `Object.prototype` or `null` | map, in property enumeration order of the platform; a key follows the `string` row; integer-like keys enumerate first in ascending order, so a JSON object with such keys must be bound from JSON text, not from a parsed object |
| `Date`, function, symbol, `Map` with a non-string key | E_DATA_UNSUPPORTED_TYPE |
| class instance | object (VAL-19); the original instance is retained |

**VAL-14** PHP.

| Input | Value |
| --- | --- |
| `null` | null |
| `bool` | bool |
| `int` | number under VAL-2 |
| `float` | number under VAL-2 |
| `string` | string; a value that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| `array` for which `array_is_list()` is true | list |
| other `array` | map; each key is converted to a string; an integer key `1` becomes the key `"1"`; a string key that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| object implementing `JsonSerializable` | the binding of the value that `jsonSerialize()` returns; an exception thrown by `jsonSerialize()` is E_RUNTIME_HOST_FUNCTION with the message of the exception |
| other instance of `stdClass` or of a subclass of `stdClass` | map of its public properties, in the order of `get_mangled_object_vars()`; a property name that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| `Closure` | E_DATA_UNSUPPORTED_TYPE |
| other object | object (VAL-19); the original instance is retained |
| resource, open or closed | E_DATA_UNSUPPORTED_TYPE |

The rows are tried in this order, so a `stdClass` subclass that implements `JsonSerializable` binds its `jsonSerialize()` value. The public properties of an object are the entries of `get_mangled_object_vars()` whose names are not mangled: the declared public properties that are initialized and the dynamic properties. The result does not depend on the class scope from which the host calls `render`.

**VAL-15** Go.

| Input | Value |
| --- | --- |
| `nil` | null |
| `bool` | bool |
| `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64` | number under VAL-2 |
| `float32`, `float64` | number under VAL-2 |
| `string` | string; a value that is not valid UTF-8 is E_DATA_INVALID_UTF8 |
| slice, array | list |
| the insertion-ordered map type provided by the package | map, in insertion order; a key follows the `string` row |
| `map[string]T` | map with the keys sorted by byte order; a key follows the `string` row |
| struct value, pointer to a struct | object (VAL-19); the original value is retained |
| pointer to a value of another kind | the binding of the value it points to; `nil` is null; each such dereference counts as one level of VAL-20, so a pointer that leads back to itself fails with E_DATA_DEPTH |
| function, channel and every other kind | E_DATA_UNSUPPORTED_TYPE |

**VAL-16** Rust.

| Input | Value |
| --- | --- |
| `serde_json::Value::Null` | null |
| `serde_json::Value::Bool` | bool |
| `serde_json::Value::Number` | number under VAL-2 |
| `serde_json::Value::String` | string |
| `serde_json::Value::Array` | list |
| `serde_json::Value::Object` | map, in insertion order; the `preserve_order` feature of `serde_json` is required |
| `Value` that the host builds and passes to `render_values`, or that a host function, a logical class function or a `TemplateObject` returns | the same value after the checks of VAL-2, VAL-3 and VAL-20 |
| `Value::Object` | object (VAL-19); the `TemplateObject` is retained |

**VAL-17** Map keys are strings in every host. A host map whose key is not a string is converted only where a table above defines the conversion; otherwise it is E_DATA_UNSUPPORTED_TYPE. A key is checked like a string value: a key that is not valid UTF-8, or in TypeScript a key that is not well-formed UTF-16, is E_DATA_INVALID_UTF8.

**VAL-18** Binding preserves an assigned native object reference without copying it. A native object that a template passes as an argument to a host function, a logical class function or an instance method, directly or inside a list or map argument, arrives as the original host object: the same PHP object, the same JavaScript instance, the same Go value, and in Rust the same `TemplateObject`, which the host recovers with `Value::downcast_object`. Resource handles and functions, including PHP closures, are not template values; binding rejects them with E_DATA_UNSUPPORTED_TYPE. Rendering reads values and never writes back to host data.

**VAL-19** A native object is an opaque template value. It is truthy and cannot be stringified, iterated or spread.

- Lookup (`o.name`, `o['name']`, EXP-18) with a string key reads a public field or property of the original instance and binds its value (VAL-11). A name that is not a public field or property returns `null`, and so does every key that is not a string. A field value that cannot be bound fails with its `E_DATA_*` code, and an accessor that raises an error fails with E_RUNTIME_HOST_FUNCTION; both errors point at the lookup expression (ERR-5).
- A member call `o.name(args)` invokes a public method of the original instance with the arguments (VAL-18) and binds its result. A name that is not a public method is E_RUNTIME_UNKNOWN_FUNCTION, including a private or protected method and a name that only a dynamic dispatch hook such as PHP `__call` would handle. A method that rejects its arguments or raises an error is E_RUNTIME_HOST_FUNCTION. A result that cannot be bound fails with its `E_DATA_*` code at the call.
- Visibility is a property of the declaration. It does not depend on the code that calls `render`: a template sees the same members when `render` is called inside the class of the object.

| Host | Public field or property | Public method |
| --- | --- | --- |
| TypeScript | an own property of the instance, or an accessor property (getter) on its prototype chain below `Object.prototype` | a function-valued data property on the prototype chain below `Object.prototype`, except `constructor` |
| PHP | an entry of `get_mangled_object_vars()` whose name is not mangled; `__get` is not consulted | a method that the class or an ancestor declares public, static or not; `__call` is not consulted |
| Go | an exported struct field whose name equals the key ignoring case, or whose `json` tag name equals the key | an exported method of the value's method set whose name is the key or the key converted from snake case to camel case |
| Rust | the value that `TemplateObject::member` returns | `TemplateObject::call` |

**VAL-20** The depth of a list or a map is one more than the largest depth of its elements or values; an empty list or map has depth 1. Every other value has depth 0, including a native object, whose members are bound only when a template reads them. No template value has a depth greater than 64.

- Binding a value whose depth is greater than 64 fails with E_DATA_DEPTH. Binding stops at the 65th level and does not read deeper parts of the value. A cyclic host structure, such as a JavaScript object, a Go map or slice, or a PHP object or array that contains itself, has no finite depth and fails with E_DATA_DEPTH through the same limit, without a separate cycle check. In PHP each call of `jsonSerialize()` also counts as one level, so an object whose `jsonSerialize()` returns the object itself fails with E_DATA_DEPTH.
- A list or map literal whose value would have a depth greater than 64 fails with E_RUNTIME_LIMIT at the literal. List and map literals are the only template operations that build a value deeper than their operands; a function returns a value no deeper than its arguments, and a host function result is bound.

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
