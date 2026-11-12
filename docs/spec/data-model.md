<!-- doc-id: docs-spec-data-model -->
# Data model

[한국어](/ko/spec/data-model).

This document defines the value types that templates operate on, the safe string, the conversion of values to output text, and the conversion of host language values into template values. Operators are defined in [Expressions](expressions.md). Error codes are defined in [Errors](errors.md). Rules are numbered `VAL-n`.

## Value types

- **VAL-1** A value has exactly one of the following types.

| Type | Content |
| --- | --- |
| null | The single value `null` |
| bool | `true` or `false` |
| number | An IEEE 754 double-precision floating point number |
| string | A sequence of Unicode code points |
| list | An ordered sequence of values |
| map | An ordered sequence of entries; each entry has a string key and a value; keys are unique |

- **VAL-2** There is one number type. An integer is a number whose value has no fractional part. Host binding accepts a number only when it is finite and its magnitude is at most 2^53 − 1 (9007199254740991). The rule depends only on the numeric value, never on the host type or on the spelling of a JSON literal: an integer-typed host value, a floating point host value, a JSON integer literal and a JSON literal with a fraction or an exponent are checked alike. A value that is NaN or infinite is data_number_not_finite (VAL-3). A finite value whose magnitude is greater than 2^53 − 1 is data_number_range. Every floating point number of such a magnitude is an integer, so `1e19`, `2^53` and `9007199254740992.0` are all data_number_range. A JSON literal is first converted to the nearest double; a literal whose nearest double is infinite, such as `1e400`, is data_number_not_finite. An integer-typed host value is compared exactly. A number that template arithmetic produces is not host binding; only VAL-3 applies to it. Integer arithmetic within the binding range is exact.

- **VAL-3** The values NaN, +Infinity and -Infinity never exist. Host binding rejects them with data_number_not_finite. An arithmetic result that is not finite is runtime_type as defined in Expressions.

- **VAL-4** A map preserves the insertion order of its entries in every implementation. Iteration, `keys`, `values` and `json` follow that order.

Native SDK values use the `Value`/list/map types of TypeScript, Go and Rust, ordinary Python values, and the validated host values of PHP and the PHP extension. Ordered maps are a TypeScript `Map`, a Go or Rust `OrderedMap`, a `MapValue` in PHP and the PHP extension, or a Python `dict` returned by map binding. Native factories and container protocols retain insertion order; replacing a key retains its position. A shallow copy has independent keys and retains its value payloads. Editing a materialized key list cannot change the source map.


- **VAL-5** A string is measured, indexed and sliced by Unicode code points. Two strings are ordered by comparing their code point sequences element by element; a shorter string that is a prefix of a longer string orders first.

## Safe string

- **VAL-6** A safe string is a string that carries a safe mark. The functions `raw` and `escape` return safe strings. An echo tag writes a safe string without escaping. In every other position a safe string behaves as a string: functions, operators, `==` and `in` read its text and ignore the mark, and a function that returns a string returns a plain string.

The native safe-text carrier is `SafeString` with its text payload in TypeScript, Go, Python, PHP and the PHP extension; Rust uses `Value::Safe`, `Value::safe_text` and the native text projection. These carriers describe runtime values; constructing one does not change the host-binding rule of VAL-7.


- **VAL-7** Host binding never produces a safe string. A host function that returns a string returns a plain string, as defined in [Functions](functions.md).

## Stringification

- **VAL-8** `stringify(v)` converts a value to text. It is used by the echo tag, by the `+` operator when either operand is a string, by the `in` operator, by map literal keys, and by the functions `str` and `join`.

| Type | Result |
| --- | --- |
| null | The empty string |
| bool | `true` or `false` |
| number | The text defined in VAL-9 |
| string | The string itself |
| list, map | runtime_stringify |

- **VAL-9** A number `x` is converted to text as follows.

1. If `x` is 0 or -0, the result is `0`. Reason: `-0 == 0` is true (EXP-34), so a text that kept the sign would tell apart two equal values, and the layout is the one of ECMAScript `Number::toString`, which the JSON number token of the JSON library writes too.
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

- **VAL-10** Each implementation obtains the digits `s` and the exponent `n` with the shortest round-trip conversion of its platform and then applies steps 4 to 7 of VAL-9.

| Implementation | Digit source |
| --- | --- |
| TypeScript | `String(x)` produces the complete result |
| Go | `strconv.FormatFloat(x, 'e', -1, 64)` gives the digits and the exponent |
| Rust | `number_text(x)` of the crate `polyspec-json`, the JSON number token function of the JSON library, produces the complete result |
| PHP | `json_encode($x)` or `var_export($x, true)` with `serialize_precision` set to `-1` gives the digits and the exponent |

## Host binding

- **VAL-11** Host binding converts a value of the host language into a template value. Binding is applied to assign data, to template definition data, to scope arguments computed by the host, to the return value of a host function, a logical class function and an instance method, and to the value of a native object member that a template reads (VAL-19). The conversion tables of the implementations (VAL-12 and VAL-13) are the complete set of accepted inputs; any other input is data_unsupported_type. VAL-17 to VAL-21 apply in every host. A bound map (VAL-22) has passed binding, so `render` uses it as `assign` or as definition data without binding it again (RT-61).

- **VAL-12** JSON text is the reference form of assign data. Every implementation accepts JSON text and produces the same values. Each implementation parses JSON text with a parser that preserves document order and applies the number rule of VAL-2 and the depth limit of VAL-20; the TypeScript implementation provides this parser in the package and does not use `JSON.parse` for assign data, and the Rust implementation reads JSON text and JSON values with the crate `polyspec-json`, the JSON library, and applies the rules of this table to its values.

| JSON | Value |
| --- | --- |
| `null` | null |
| `true`, `false` | bool |
| number | number under VAL-2 |
| string | string; a text that is not valid UTF-8 is data_invalid_utf8; a `\u` escape that produces a surrogate code point (U+D800 to U+DFFF) outside a high-low surrogate pair is data_invalid_utf8 |
| array | list, in document order |
| object | map, in document order; a key follows the string row; a duplicate key replaces the earlier value and keeps the earlier position |

Arrays and objects that nest deeper than the limit of VAL-20 are data_depth. The parser fails at the first array or object that exceeds the limit, before it reads the rest of the text.

A text that is not one JSON document is data_invalid_json: a syntax error, an empty text, and a text with anything other than whitespace after the document. The parser reports the first violation in document order, so a depth or number error before a syntax error is reported with its own code. The rule applies to every JSON text that an implementation accepts as data: assign data, template definitions and the environment, including the files of the command line interface (CNF-4) and the JSON methods of the PHP extension. Reason: JSON text is the reference form of data, so a malformed document is a data error of the same input and is reported with the data error object of ERR-5 in every implementation, not with an implementation-specific exception.

- **VAL-13** Each implementation converts a host value into a template value by the binding table of its own language, given below for TypeScript and JavaScript, PHP and the PHP extension, Go, Rust and Python.

The SDK contract names exact native value, binding, error, collection and callback members in TypeScript, Go, Rust, PHP, the PHP extension and Python. Canonical runtime operations remain bound directly to the public `RuntimeBindings` protocol; native helpers implement the same value semantics through the representations of their host. Generated-value adapters convert already produced template values rather than applying host binding again. JSON input adapters and native JSON transport conversions retain their distinct input/output forms. Native binding failures publish their data code and message through the error mechanism of the host.

| Input | Value |
| --- | --- |
| `null`, `undefined` | null |
| `boolean` | bool |
| `number` | number under VAL-2 |
| `bigint` | number under VAL-2 |
| `string` | string; a string that is not well-formed UTF-16, that is, a string that contains a surrogate code unit outside a high-low pair, is data_invalid_utf8 |
| `Array` | list |
| `Map` with string keys | map, in insertion order; a key follows the `string` row |
| plain object, whose prototype is `Object.prototype` or `null` | map, in property enumeration order of the platform; a key follows the `string` row; integer-like keys enumerate first in ascending order, so a JSON object with such keys must be bound from JSON text, not from a parsed object |
| `Date`, function, symbol, `Map` with a non-string key | data_unsupported_type |
| bound map (VAL-22) | data_unsupported_type, except as `assign` and as definition `data` (VAL-22) |
| class instance | object (VAL-19); the original instance is retained |

- PHP.

| Input | Value |
| --- | --- |
| `null` | null |
| `bool` | bool |
| `int` | number under VAL-2 |
| `float` | number under VAL-2 |
| `string` | string; a value that is not valid UTF-8 is data_invalid_utf8 |
| `array` for which `array_is_list()` is true | list |
| other `array` | map; each key is converted to a string; an integer key `1` becomes the key `"1"`; a string key that is not valid UTF-8 is data_invalid_utf8 |
| bound map (VAL-22) | data_unsupported_type, except as `assign` and as definition `data` (VAL-22) |
| object implementing `JsonSerializable` | the binding of the value that `jsonSerialize()` returns; an exception thrown by `jsonSerialize()` reaches the caller unchanged (FUN-46) |
| other instance of `stdClass` or of a subclass of `stdClass` | map of its public properties, in the order of `get_mangled_object_vars()`; a property name that is not valid UTF-8 is data_invalid_utf8 |
| `Closure` | data_unsupported_type |
| other object | object (VAL-19); the original instance is retained |
| resource, open or closed | data_unsupported_type |

The rows are tried in this order, so a `stdClass` subclass that implements `JsonSerializable` binds its `jsonSerialize()` value. The public properties of an object are the entries of `get_mangled_object_vars()` whose names are not mangled: the declared public properties that are initialized and the dynamic properties. The result does not depend on the class scope from which the host calls `render`.

- Go.

| Input | Value |
| --- | --- |
| `nil` | null |
| `bool` | bool |
| `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64` | number under VAL-2 |
| `float32`, `float64` | number under VAL-2 |
| `string` | string; a value that is not valid UTF-8 is data_invalid_utf8 |
| slice, array | list |
| the insertion-ordered map type provided by the package | map, in insertion order; a key follows the `string` row |
| `map[string]T` | map with the keys sorted by byte order; a key follows the `string` row |
| bound map (VAL-22) | data_unsupported_type, except as `assign` and as definition `data` (VAL-22); a non-nil pointer to a bound map is data_unsupported_type at every position, and a nil one is null |
| struct value, pointer to a struct | object (VAL-19); the original value is retained |
| pointer to a value of another kind | the binding of the value it points to; `nil` is null; each such dereference counts as one level of VAL-20, so a pointer that leads back to itself fails with data_depth |
| function, channel and every other kind | data_unsupported_type |

- Rust.

| Input | Value |
| --- | --- |
| `polyspec_json::Value` of kind `Null` | null |
| `polyspec_json::Value` of kind `Boolean` | bool |
| `polyspec_json::Value` of kind `Number` | number under VAL-2, from the nearest double of its literal |
| `polyspec_json::Value` of kind `String` | string; a string that holds an escaped unpaired surrogate is data_invalid_utf8 |
| `polyspec_json::Value` of kind `Array` | list |
| `polyspec_json::Value` of kind `Object` | map, in document order; a repeated key keeps its first position and its last value; a key follows the `String` row |
| `Value` that the host builds and passes to `render_values`, or that a host function, a logical class function or a `TemplateObject` returns | the same value after the checks of VAL-2, VAL-3 and VAL-20 |
| `Value::Object` | object (VAL-19); the `TemplateObject` is retained |

A bound map (VAL-22) is a type of its own that none of these inputs can hold, so `render` receives it only as `assign` and as definition `data`.

- Python.

| Input | Value |
| --- | --- |
| `None` | null |
| `bool` | bool |
| `int` | number under VAL-2; an integer outside the safe range is data_number_range |
| `float` | number under VAL-2 |
| `str` | string; a value that contains an unpaired surrogate code point is data_invalid_utf8 |
| `list`, `tuple` | list |
| `dict` | map, in insertion order; a key follows the `str` row, and a key that is not a `str` is data_unsupported_type |
| bound map (VAL-22) | data_unsupported_type, except as `assign` and as definition `data` (VAL-22) |
| instance of a class that is not defined by the interpreter itself, that is, whose type is not in the module `builtins` | object (VAL-19); the original instance is retained |
| function, method, class, module and every other instance of a type in `builtins`, such as `set`, `bytes`, `complex`, `range` and a generator | data_unsupported_type |

- **VAL-17** Map keys are strings in every host. A host map whose key is not a string is converted only where a table above defines the conversion; otherwise it is data_unsupported_type. A key is checked like a string value: a key that is not valid UTF-8, or in TypeScript a key that is not well-formed UTF-16, is data_invalid_utf8.

- **VAL-18** Binding preserves an assigned native object reference without copying it. A native object that a template passes as an argument to a host function, a logical class function or an instance method, directly or inside a list or map argument, arrives as the original host object: the same PHP object, the same JavaScript instance, the same Go value, the same Python object, and in Rust the same `TemplateObject`, which the host recovers with `Value::downcast_object`. VAL-21 defines the form of every other argument value. Resource handles and functions, including PHP closures, are not template values; binding rejects them with data_unsupported_type. Rendering reads values and never writes back to host data.

- **VAL-19** A native object is an opaque template value. It is truthy and cannot be stringified, iterated, spread or written as JSON (FUN-26): echoing it fails with `runtime_stringify`, and a loop over it, a spread of it and `json` of a value that holds it fail with `runtime_type`.

- Lookup (`o.name`, `o['name']`, EXP-18) with a string key reads a public field or property of the original instance and binds its value (VAL-11). A name that is not a public field or property returns `null`, and so does every key that is not a string. A field value that cannot be bound fails with its `data_*` code, and the error of an accessor reaches the caller unchanged (FUN-46); the binding error points at the lookup expression (ERR-5).
- A member call `o.name(args)` invokes a public method of the original instance with the arguments (VAL-18) and binds its result. A name that is not a public method is runtime_unknown_function, including a private or protected method and a name that only a dynamic dispatch hook such as PHP `__call` would handle. The error of a method that rejects its arguments or raises an error reaches the caller unchanged (FUN-46). A result that cannot be bound fails with its `data_*` code at the call.
- Visibility is a property of the declaration. It does not depend on the code that calls `render`: a template sees the same members when `render` is called inside the class of the object.

| Host | Public field or property | Public method |
| --- | --- | --- |
| TypeScript | an own property of the instance, or an accessor property (getter) on its prototype chain below `Object.prototype` | a function-valued data property on the prototype chain below `Object.prototype`, except `constructor` |
| PHP | an entry of `get_mangled_object_vars()` whose name is not mangled; `__get` is not consulted | a method that the class or an ancestor declares public, static or not; `__call` is not consulted |
| Go | an exported struct field whose name equals the key ignoring case, or whose `json` tag name equals the key | an exported method of the value's method set whose name is the key or the key converted from snake case to camel case |
| Rust | the value that `TemplateObject::member` returns | `TemplateObject::call` |
| Python | an attribute whose name does not start with `_` and whose value is not callable; a callable attribute is not a field and reads as `null` | a callable attribute whose name does not start with `_` |

- **VAL-20** The depth of a list or a map is one more than the largest depth of its elements or values; an empty list or map has depth 1. Every other value has depth 0, including a native object, whose members are bound only when a template reads them. No template value has a depth greater than 64.

- Binding a value whose depth is greater than 64 fails with data_depth. Binding stops at the 65th level and does not read deeper parts of the value. A cyclic host structure, such as a JavaScript object, a Go map or slice, or a PHP object or array that contains itself, has no finite depth and fails with data_depth through the same limit, without a separate cycle check. In PHP each call of `jsonSerialize()` also counts as one level, so an object whose `jsonSerialize()` returns the object itself fails with data_depth.
- A list or map literal whose value would have a depth greater than 64 fails with runtime_limit at the literal. List and map literals are the only template operations that build a value deeper than their operands; a function returns a value no deeper than its arguments, and a host function result is bound.

- **VAL-23** A generated binding describes a value of its language one level at a time as a `HostValue` of binding_core, and the core binds it with `value_in` (`template_value` of the interface contract, binding design U-7); the rows are the binding of the tables above, for every language at once:

| `HostValue` | Value |
| --- | --- |
| `Null`, `Undefined` | null |
| `Bool` | bool |
| `Int`, `Float`, `UntypedNumber` | number under VAL-2 |
| `Number` (an integer outside `i64`) | data_number_range |
| `Text` | string; units that are not well-formed UTF-8, UTF-16 or code points are data_invalid_utf8 |
| `List`, `PhpArray` whose `is_list` holds | list |
| `Map`, `PlainObject`, `StdClass`, `PhpArray` whose `is_list` does not hold | map, in the order of the language; a key is a `Text`, and in a `PhpArray` also an `Int`, which becomes its decimal text; another key is data_unsupported_type |
| `PhpReference` | the binding of its target |
| `Object` | object (VAL-19): the core holds the handle of the language object and gives it back unchanged; it reads no member and calls no method of it, so a lookup of a member is `null` and a method call is runtime_unknown_function |
| `Bytes`, `Date`, `Callable`, `Value`, `Other` | data_unsupported_type |

Lists and maps nest at most as VAL-20 allows, so a value that holds itself is data_depth. `value_in` returns `Result<Value, Failure<TemplateError>>` (binding design E-1c; `RenderError` names the same type): a value that is no template value is `Failure::Kind` with the kind of the table, and an exception that language code raises while the binding answers a question of the walk is `Failure::Raised` with that exception, which reaches the caller unchanged (FUN-46). The walk calls no Rust callback, so it gives no `Failure::Callback`. The tables of VAL-13 hold conversions that a `HostValue` does not carry. They belong to the `host_value` table of the binding (binding design T-2), which walks them as it walks the getter of a JavaScript object: it calls the method during the walk and describes its result. Until that table holds them, a binding that uses `value_in` binds the values of these rows as this table does and not as VAL-13 states, while the legacy implementations keep VAL-13: a PHP object that implements `JsonSerializable` is an object (VAL-19) instead of the binding of `jsonSerialize()`, because `HostValue::Object` carries only the mark `json_serializable` and `HostValues` has no question for the result; an instance of a subclass of `stdClass` is an object instead of the map of its public properties; a Python `tuple` is an object instead of a list; the Go rows (the insertion-ordered map, `map[string]T` with its keys sorted, a pointer to a value of another kind and a `uint64` above the range of `i64`) wait for the Go binding, and `HostValue` has no pointer; and a lookup or a member call of a native object (VAL-19) reads no member and calls no method. The walk also classifies some values differently: a Python subclass of `int`, `float`, `str` or `bytes`, a Python instance that is callable and a JavaScript typed array are data_unsupported_type instead of an object, and an instance of another type of the Python module `builtins` that is not callable, such as `set`, `range`, a generator or a module, is an object instead of data_unsupported_type. The TypeScript table has no `toJSON` row, so the walk loses no conversion of TypeScript. A template value leaves the core with `value_out` as one level at a time: null, bool, a number as a float, a string or a safe string as a text, a list, a map with the predicate `sequence_keys` when its keys are `"0"` to `"n-1"` in order, and an object that entered as a handle as that handle; one list or map of the value is one language object, however often the value holds it. Reason: the binding of every language is one function of the core, so the languages differ only in how they describe a value, which binding_core fixes.

## Host arguments

- **VAL-21** A host function, a logical class function and an instance method receive every argument as a host value of the following form. The form is the same in the AST program and in every generated program, and it applies to the elements of a list and to the values of a map at every depth.

| Template value | TypeScript | PHP | Go | Rust | Python |
| --- | --- | --- | --- | --- | --- |
| null | `null` | `null` | `nil` | `Value::Null` | `None` |
| bool | `boolean` | `bool` | `bool` | `Value::Bool` | `bool` |
| number | `number` | `float` | `float64` | `Value::Number` | `float` |
| string, safe string | `string` | `string` | `string` | `Value::Str` | `str` |
| list | `Array` | `array` for which `array_is_list()` is true | `value.List` (`[]any`) | `Value::List` | `list` |
| map | `Map` with string keys, in entry order | `array` with the entries in entry order | `*value.OrderedMap`, in entry order | `Value::Map`, in entry order | `dict`, in entry order |
| native object | the original instance | the original object | the original value | the same `TemplateObject` | the original instance |

- A safe string arrives as a plain string. The safe mark exists only inside a render (VAL-6, VAL-7); a host function whose result must be written without escaping returns text, and the template applies `raw` (FUN-48).
- A list or a map arrives as a new host value that the host owns. A change that the host makes to a received list or map changes no template value: a later read of the same template value in the render returns the value it had before the call. A native object is not copied (VAL-18).
- In PHP, a map arrives as an array, so the key conversion of PHP arrays applies: a key that is the decimal text of an integer in the PHP integer range, without a sign `+`, without leading zeros and other than `-0`, becomes an integer key. A PHP array cannot distinguish an empty map from an empty list, or a map whose keys are `"0"` to `"n-1"` in that order from a list, so such a map arrives as a `stdClass` object whose public properties are its entries in entry order, and binding that object again produces the same map (the `stdClass` row of the PHP table). Every other map arrives as an array. Reason: a value that host code returns unchanged must bind to the value it was (P8); an array of such keys would bind back as a list.
- Reason: every host receives plain values of its own language that its binding table (the host binding table of each implementation) accepts, so host code needs no implementation class to read an argument and can return an argument without converting it. An internal representation, such as a safe string wrapper or the PHP class `MapValue`, never reaches host code, and the two PHP implementations pass the same values.

## Bound data

- **VAL-22** A host binds data once with `bind` and renders it many times as a bound map. Every implementation provides the bound map type and two operations; their names in each language are listed in [`packages/compiler/interface.json`](https://github.com/polyspec/template/blob/main/packages/compiler/interface.json) (RT-67). An implementation is one package: the TypeScript package with all its entry points and module formats, including the browser entry `@polyspec/template/render` (`typescript` and `javascript-esm` in `supportLevels`), the Go module, the Rust crate, the PHP package, the PHP extension and the Python package. Every entry point and module format of an implementation accepts the bound maps that the others create.

- `bind(value)` accepts every host value that host binding (the host binding table of each implementation) turns into a map, and the values that `render` uses as an empty map (RT-4); it does not take JSON text. A host binds JSON text by parsing it with the JSON parser of the package (VAL-12) and passing the result to `bind`. `bind` applies host binding (VAL-11 to VAL-20) and returns a bound map. A value that `render` uses as an empty map returns an empty bound map. A bound map of the same implementation is returned unchanged, because it is immutable and already checked. Any other value that binding does not turn into a map fails with data_unsupported_type. A failure is the error of ERR-14. `packages/compiler/interface.json` names the operation or parameter type through which each implementation passes a bound map to `render` and `prepare`, such as the Rust `prepare_bound` and `render_bound` and the PHP extension `render`; an operation that takes JSON text, such as the PHP extension `render_json`, does not accept a bound map.
- `merge(first, second)` returns a bound map with the entries of `first` and `second` by the precedence of RT-26: an entry of `second` replaces the entry of `first` with the same key and keeps the position of `first`; the other entries of `second` follow in their order. It reads no value again.

In TypeScript, PHP, the PHP extension and Python the parameters of `bind` and `merge` accept any value, so the check runs inside the operation: an argument of `merge` that is not a bound map of the same implementation fails with data_unsupported_type; in Go and Rust the parameter type of `merge` is the bound map type, so the compiler rejects another value.

`render` and `prepare` accept a bound map as `assign` (RT-4) and as the `data` of a template definition (RT-24) and do not bind it again (RT-61). Host binding of a bound map at any other position, inside a list, a map or an object that is given to `bind`, `render` or `prepare`, or as the result of host code (VAL-11), fails with data_unsupported_type. A bound map that another implementation created, such as a bound map of the PHP extension given to the PHP implementation, fails with data_unsupported_type at every position. A bound map is never a native object (VAL-19). Reason: a bound map is accepted only where `render` uses it as a whole map, so no binding rule has to combine the depth of a bound map with the level at which it is met (VAL-20), and `merge` of two maps that each satisfy VAL-20 satisfies it too.

Through the host interface, which is `bind`, `merge`, `prepare`, `render` and the arguments of host functions (VAL-21), the host cannot construct a non-empty bound map in another way and cannot change a bound map or a list or map inside it. So a bound map holds only values that binding checked. The bound map type has no public operation other than `bind`, `merge` and the operations that `packages/compiler/interface.json` declares for generated programs, and the compiler interface checks (RT-67) fail when an implementation exports another one. Each language uses these mechanisms:

| Implementation | Bound map type |
| --- | --- |
| TypeScript and JavaScript | A class whose state is in private `#` fields; its constructor fails unless the package calls it, so `new` from JavaScript and a subclass fail. The package identifies a bound map with `#field in value`, so an object that only inherits the prototype of the class is a class instance (VAL-19) |
| PHP | A `final` class with a private constructor and a private `__clone()`, whose `__unserialize()` fails |
| PHP extension | A final class of the extension that PHP code cannot instantiate, clone or unserialize |
| Go | A struct with unexported fields that `bind` and `merge` return by value; its zero value is the empty bound map, which holds no unchecked value; a nil pointer to it is null (RT-4) |
| Rust | A struct with private fields |

Reflection, `unsafe` code, a closure bound to the class scope, and the operations that a runtime exports for generated programs (RuntimeBindings, RenderFrame, RenderScope and the render context, RT-67) are not the host interface. A host that changes a bound map through them is outside this specification. Reason: generated programs live outside the runtime package and read bound maps through these exported operations.

A Go bound map may be read by concurrent renders. A Rust bound map is `Send` and `Sync`: template values share their lists and maps with `Arc`, and a native object is a `TemplateObject`, which is `Send` and `Sync`, so renders in several threads read one bound map at the same time (RT-70).

A native object inside a bound map stays a reference (VAL-18) whose members are bound when a template reads them (VAL-19); the host may change such an object, as without a bound map.

## Examples

| Input (JSON) | `stringify` of the value |
| --- | --- |
| `null` | `` (empty) |
| `true` | `true` |
| `12.50` | `12.5` |
| `1e2` | `100` |
| `"a"` | `a` |
| `[1]` | runtime_stringify |
| `{"a": 1}` | runtime_stringify |
