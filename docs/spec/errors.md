<!-- doc-id: docs-spec-errors -->
# Errors

[한국어](/ko/spec/errors).

## Error object

- **ERR-1** An error is an object with the fields `code`, `template`, `line`, `col`, `offset`, `end` and `message`. `code` is one of the codes listed in this document, the kind of the error, written in lowercase snake_case: the same form names the kinds of every polyspec library, so a host that handles errors of several libraries tells them apart by one kind format. The legacy implementations of TypeScript, Go, PHP, the PHP extension and Python name a code `E_` followed by its kind in capitals, such as `E_DATA_DEPTH` for `data_depth`, until they are removed. The language service `packages/language` and the editor packages over it (`packages/lsp`, `packages/vscode`, `packages/codemirror`) give the kind in every code that they publish, the code of a format error, of a diagnostic and of a line of a command: they read the errors of the legacy TypeScript parser and write the kind of its code where an error leaves the language service, so an editor and the Rust core name one error by one text. `template` is the name of the template in which the error is located. `message` is free text in English.

The SDK exposes these seven fields through native error values and their plain-data projection. TypeScript uses `ErrorObject` and `TemplateError.toObject`; Go uses the exported fields of `errs.Error` and `JSON`; Rust uses `TemplateError` fields and its serialization implementation; PHP and the PHP extension use `TemplateError.toArray` (with `errorCode`, `errorLine`, `errorCol` properties and the native exception message); Python uses `TemplateError` attributes and `to_object`. Native constructors or struct literals create the same value. Positioned factories accept byte spans and line indexes; unpositioned factories, or a TypeScript constructor with zero positions, preserve zero in all four position fields.

- **ERR-2** `line` is 1-based and counts `\n` bytes before the error position. `col` is the 1-based byte offset of the error position from the start of its line. `offset` and `end` are the byte span `[offset, end)` of the token or node the error refers to. `offset` is the error position.

- **ERR-3** Conformance compares `code`, `template`, `line` and `col`. `offset`, `end` and `message` are not compared.

- **ERR-4** There are no execution modes. Every error aborts parsing or rendering. A render that raises an error produces no output.

- **ERR-5** An error raised before rendering starts, while binding assign data, template definition data or the environment, has `template` equal to the entry template name, `line` 0, `col` 0, `offset` 0 and `end` 0. An error raised while binding a value during rendering points at the expression that produced the value: the call for the result of a host function, a logical class function or an instance method, and the lookup expression for a member of a native object (VAL-19).

- **ERR-14** An error raised by `bind` or `merge` (VAL-22), which run outside a render, has `template` equal to the empty string and `line`, `col`, `offset` and `end` equal to 0. Its code is the data_* code of the failed check or internal (ERR-13); an error of host code that the binding called reaches the caller unchanged (VAL-13, FUN-46). It is the error object of ERR-1 of the implementation, the same type that `render` raises. An exception that ERR-13 passes to the host unchanged leaves `bind` unchanged.

- **ERR-6** An error for an entry template that the loader does not provide has `code` `load_not_found`, `template` equal to the requested name, `line` 0 and `col` 0. An error for an entry template whose loading fails (`load_failed`) or that is not loaded (`load_not_loaded`, RT-77) has the same `template`, `line` and `col`.

## Codes

The code tables of ERR-7 to ERR-12 and ERR-15 are the catalog of the error codes: `make error-codes` writes the code list of each implementation from them, and `make error-codes-check` checks that each list matches the tables.

- **ERR-7** Lexical errors:

| Code | Condition | Position |
| --- | --- | --- |
| `lex_invalid_utf8` | The source is not valid UTF-8. | The first invalid byte. |

- **ERR-8** Parse errors:

| Code | Condition | Position |
| --- | --- | --- |
| `parse_unterminated_tag` | A tag has no closing `}` before the end of the file. | The `{` of the tag. |
| `parse_unterminated_comment` | A comment has no `*}` before the end of the file. | The `{*` of the comment. |
| `parse_unterminated_string` | A string literal has no closing quote before the end of the tag. | The opening quote. |
| `parse_unexpected_token` | A token is not allowed by the grammar at its position, including an empty expression. | The token, or the `}` when the expression is empty. |
| `parse_invalid_number` | A number literal does not match the number token. | The literal. |
| `parse_invalid_escape` | A backslash in a string literal is followed by a character outside the escape set. | The backslash. |
| `parse_unexpected_close` | `{/}` appears with no open block. | The tag. |
| `parse_unclosed_block` | The file ends while a block is open. | The opening tag of the innermost open block. |
| `parse_else_outside_block` | `{:}` or `{:? ...}` appears with no open block. | The tag. |
| `parse_duplicate_else` | A second `{:}` appears in the same block. | The second `{:}`. |
| `parse_elseif_after_else` | `{:? ...}` appears after `{:}` in the same block. | The tag. |
| `parse_elseif_not_in_if` | `{:? ...}` appears directly inside a loop block or an if-block. | The tag. |
| `parse_reserved_name` | An assignment target or loop variable is a reserved word. | The name. |
| `parse_invalid_path` | An include or block path is not a path token. | The path. |
| `parse_invalid_block_tag` | The tokens of a block tag do not match the block tag grammar. | The first token that does not match. |
| `parse_invalid_wrapper` | The `}}` of a wrapped tag is not followed by the wrapper closer that matches the wrapper opener. | The wrapper opener. |
| `parse_invalid_directive` | A delimiter directive is not the first tag of the file, names a character that is not a delimiter, or has another form. | The tag. |

- **ERR-9** Load errors:

| Code | Condition | Position |
| --- | --- | --- |
| `load_not_found` | The loader has no template for the resolved name. | The include or block tag; for the entry template see ERR-6. |
| `load_cycle` | An include or block renders a template that is already being rendered in the same chain. | The include or block tag. |
| `load_outside_root` | A resolved path leaves the loader root. | The include or block tag. |
| `load_failed` | The loader reports a failure for the resolved name (RT-9): a TypeScript or PHP loader throws an exception, a Go or Rust loader returns an error, or a filesystem loader cannot read an existing regular file (RT-10), or a loader result lacks a source text and an AST, or a version (RT-9). | The include or block tag; for the entry template see ERR-6. |
| `load_not_loaded` | A render needs a template of a loader that reads files (RT-77) that `prepare` or `load` did not load. | The include or block tag; for the entry template see ERR-6. |

- **ERR-10** Data errors:

| Code | Condition | Position |
| --- | --- | --- |
| `data_number_range` | A finite number has a magnitude greater than 2^53 − 1 (VAL-2). | ERR-5, ERR-14. |
| `data_number_not_finite` | A number is NaN or infinite. | ERR-5, ERR-14. |
| `data_invalid_utf8` | A string or a map key is not valid Unicode text (VAL-12 to VAL-17). | ERR-5, ERR-14. |
| `data_unsupported_type` | A value has a type that has no binding. | ERR-5, ERR-14. |
| `data_depth` | Lists and maps are nested deeper than the binding depth limit, including a cyclic host structure (VAL-20). | ERR-5, ERR-14. |
| `data_invalid_json` | JSON text of assign data, template definitions or the environment is not one JSON document (VAL-12). | ERR-5. |

- **ERR-11** Runtime errors:

| Code | Condition | Position |
| --- | --- | --- |
| `runtime_type` | An operand or argument has a type the operation does not accept. | The start of the expression node that failed (the binary or unary expression, the call, the spread), or the loop tag for an iterable of a wrong type. |
| `runtime_compare` | An ordering comparison has operands without an order. | The start of the comparison expression. |
| `runtime_div_zero` | The right operand of `/` or `%` is zero. | The start of the division expression. |
| `runtime_stringify` | A list, a map or a native object (VAL-19) is converted to a string. | The start of the echo expression, of the operator expression or of the call. |
| `runtime_unknown_function` | A call names a function that is neither built in nor registered. | The call. |
| `runtime_arity` | A call has an argument count outside the function's range. | The call. |
| `runtime_host_function` | A legacy implementation reports an error of host code that the engine called (FUN-46, VAL-19); the Rust core passes such an error to the caller unchanged and never reports this code. | The call or the lookup expression; ERR-5 for host code that runs while binding before rendering starts; ERR-14 for host code that runs in `bind`. |
| `runtime_unknown_loop` | A loop meta names a loop that is not enclosing the expression. | The loop meta. |
| `runtime_block_undefined` | `{# id}` names an id that the template definition registry does not contain. | The tag. |
| `runtime_block_redefined` | `{# id path}` names an id that is registered with a different path. | The tag. |
| `runtime_depth` | The nesting depth of includes and blocks exceeds the limit. | The include or block tag. |
| `runtime_limit` | The iteration count, the output size, the expression depth, a range size or the depth of a value that a list or map literal builds (VAL-20) exceeds its limit. | The loop tag, the echo, the expression, the call or the literal. |

- **ERR-15** Argument, format and AST errors. Each is an error of ERR-1 without a position unless the row names one; `template` is the name that the operation received. Reason: every failure of the library reaches the host as one error type with a kind (ERR-1), so a host tells an argument error, a kept format and an invalid AST apart by its kind, not by a second error type of each operation.

| Code | Condition | Position |
| --- | --- | --- |
| `argument_delimiters` | A delimiter option of `parse`, `analyze`, `format` or an engine is not a delimiter pair (LEX-21). | None. |
| `argument_function_name` | A host function name of `register` or of the engine options is not an identifier or names a built-in function (RT-5, FUN-44). | None. |
| `argument_source_range` | A byte range of the public `Source` of an implementation is reversed or reaches beyond the source. | None. |
| `argument_indent` | An indent unit of `format` is not a run of spaces or one tab (FMT-17). | None. |
| `format_invariant` | The text that `format` would return does not parse to the AST of the source (FMT-1). | The first changed byte. |
| `format_html` | The HTML elements of the source do not nest, so `format` cannot indent the lines by them (FMT-12). | The tag that does not nest. |
| `ast_invalid` | The text that `decode_template` reads is not JSON, or its value is not an AST of the canonical schema; the message names the JSON Pointer of the invalid node (AST-10). | None. |

- **ERR-12** Internal errors:

| Code | Condition | Position |
| --- | --- | --- |
| `internal` | The implementation failed in a way this specification does not define: a panic in Rust or Go code that the engine runs, or, in TypeScript and PHP, an error that the language runtime raises for a programming defect. | ERR-5; ERR-14 for `bind` and `merge`; for `parse`, the template name passed to `parse`. |

- **ERR-13** No implementation terminates the host process, and no panic or language runtime error leaves the public `parse`, `prepare`, `render`, `bind` and `merge` operations of an implementation, including the operations of a generated program and of the PHP extension. Each such failure is reported to the host as `internal`. The language runtime errors are the built-in subclasses of `Error` that the JavaScript engine raises (`TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `EvalError`, `URIError`) and the classes of the PHP `Error` hierarchy. Host code that the engine calls (a registered function, a logical class function, an instance method, a member accessor, `jsonSerialize()`) and that reports a failure through the error mechanism of its language, a thrown exception in TypeScript and PHP or a returned error in Go and Rust, reaches the caller unchanged (FUN-46), and so does the error of a host loader (RT-9). A panic raised by such host code in Go or Rust is internal. Every other exception passes to the host unchanged, for example an argument error that an API raises before parsing or rendering starts, such as an invalid delimiter option or a request that does not match the declared types of a generated program. A request whose `assign` or definition `data` does not match the declared types of a generated program, or whose definitions the program does not declare, fails with the argument error of the language and not with an ERR-1 error: in TypeScript an `Error` that is neither a `TemplateError` nor a language runtime error, in Go an `error` that is not an `*errs.Error`, in Rust the `TemplateError` of an `argument_*` kind (ERR-15), the one error type of a Rust `Program`, in PHP an `\InvalidArgumentException`, and in Python a `ValueError`, which `prepare` of a generated program raises before the boundary of `render` that reports a language runtime error as `internal`. The message of the argument error is the same text in every target. It names a value by its path in the request: `assign.<field>`, or `define.<id>.data.<field>` for definition data, followed by `.<field>` for a field of a record, `.<key>` for an entry of a map and `[<index>]` for an item of a list. A value is reported as `<path> is required` when it is absent or null and its type is not optional, and otherwise as `<path> is not <expected>`, where `<expected>` is `a string`, `a number`, `a boolean`, `a list` or `an object`. A `define` option that is not an object is reported as `define is not an object`, in every target whose request can hold one, and a definition entry as `define.<id> is not declared`, `define.<id> has an invalid template`, `define.<id> has an invalid html entry` or `define.<id>.data is not an object`. A delimiter option that is not a delimiter pair is the same argument error: in Go `Parse` and `NewAstProgram` return an `error` that is not an `*errs.Error`, in Rust `AstProgram::new` and `parse` return the `TemplateError` of kind `argument_delimiters`, and the PHP extension raises an `\InvalidArgumentException` as the PHP package does. A data error of the bound values themselves, such as invalid UTF-8, stays an `data_*` error.

- **ERR-16** The Rust core holds an injection point at each branch that no input reaches, so that a case of the contract arms the point and checks the error that the branch raises. A point is `binding_core::fault::point` of the core crate `polyspec-binding-core`, and it fires only in a build with the feature `fault-test`; a build without the feature, and a run of a build with the feature that arms no point, never take the branch through the point. The contract `packages/rust/interface.json` lists the points under `faults`:

| Point | Branch | Raised code |
| --- | --- | --- |
| `template.internal` | `parse` finds no open block for `{:?}` (`packages/rust/src/parser/mod.rs`). | `internal` (ERR-13) |
| `template.format_invariant` | `format` finds that its text does not parse to the AST of the source (`packages/rust/src/format/mod.rs`). | `format_invariant` (FMT-1) |

## Example

```json
{
  "code": "parse_unclosed_block",
  "template": "product/list.tpl",
  "line": 12,
  "col": 1,
  "offset": 318,
  "end": 341,
  "message": "block opened by {@ product = products} is not closed"
}
```
