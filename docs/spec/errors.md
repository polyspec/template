# Errors

[한국어](errors.ko.md).

## Error object

**ERR-1** An error is an object with the fields `code`, `template`, `line`, `col`, `offset`, `end` and `message`. `code` is one of the codes listed in this document. `template` is the name of the template in which the error is located. `message` is free text in English.

**ERR-2** `line` is 1-based and counts `\n` bytes before the error position. `col` is the 1-based byte offset of the error position from the start of its line. `offset` and `end` are the byte span `[offset, end)` of the token or node the error refers to. `offset` is the error position.

**ERR-3** Conformance compares `code`, `template`, `line` and `col`. `offset`, `end` and `message` are not compared.

**ERR-4** There are no execution modes. Every error aborts parsing or rendering. A render that raises an error produces no output.

**ERR-5** An error raised while binding assign data before rendering starts has `template` equal to the entry template name, `line` 0, `col` 0, `offset` 0 and `end` 0. An error raised while binding the result of a host function points at the call.

**ERR-6** An error for an entry template that the loader does not provide has `code` `E_LOAD_NOT_FOUND`, `template` equal to the requested name, `line` 0 and `col` 0.

## Codes

**ERR-7** Lexical errors:

| Code | Condition | Position |
| --- | --- | --- |
| `E_LEX_INVALID_UTF8` | The source is not valid UTF-8. | The first invalid byte. |

**ERR-8** Parse errors:

| Code | Condition | Position |
| --- | --- | --- |
| `E_PARSE_UNTERMINATED_TAG` | A tag has no closing `}` before the end of the file. | The `{` of the tag. |
| `E_PARSE_UNTERMINATED_COMMENT` | A comment has no `*}` before the end of the file. | The `{*` of the comment. |
| `E_PARSE_UNTERMINATED_STRING` | A string literal has no closing quote before the end of the tag. | The opening quote. |
| `E_PARSE_UNEXPECTED_TOKEN` | A token is not allowed by the grammar at its position, including an empty expression. | The token, or the `}` when the expression is empty. |
| `E_PARSE_INVALID_NUMBER` | A number literal does not match the number token. | The literal. |
| `E_PARSE_INVALID_ESCAPE` | A backslash in a string literal is followed by a character outside the escape set. | The backslash. |
| `E_PARSE_UNEXPECTED_CLOSE` | `{/}` appears with no open block. | The tag. |
| `E_PARSE_UNCLOSED_BLOCK` | The file ends while a block is open. | The opening tag of the innermost open block. |
| `E_PARSE_ELSE_OUTSIDE_BLOCK` | `{:}` or `{:? ...}` appears with no open block. | The tag. |
| `E_PARSE_DUPLICATE_ELSE` | A second `{:}` appears in the same block. | The second `{:}`. |
| `E_PARSE_ELSEIF_AFTER_ELSE` | `{:? ...}` appears after `{:}` in the same block. | The tag. |
| `E_PARSE_ELSEIF_NOT_IN_IF` | `{:? ...}` appears directly inside a loop block or an if-block. | The tag. |
| `E_PARSE_RESERVED_NAME` | An assignment target or loop variable is a reserved word. | The name. |
| `E_PARSE_INVALID_PATH` | An include or block path is not a path token. | The path. |
| `E_PARSE_INVALID_BLOCK_TAG` | The tokens of a block tag do not match the block tag grammar. | The first token that does not match. |
| `E_PARSE_INVALID_WRAPPER` | The `}}` of a wrapped tag is not followed by the wrapper closer that matches the wrapper opener. | The wrapper opener. |
| `E_PARSE_INVALID_DIRECTIVE` | A delimiter directive is not the first tag of the file, names a character that is not a delimiter, or has another form. | The tag. |

**ERR-9** Load errors:

| Code | Condition | Position |
| --- | --- | --- |
| `E_LOAD_NOT_FOUND` | The loader has no template for the resolved name. | The include or block tag; for the entry template see ERR-6. |
| `E_LOAD_CYCLE` | An include or block renders a template that is already being rendered in the same chain. | The include or block tag. |
| `E_LOAD_OUTSIDE_ROOT` | A resolved path leaves the loader root. | The include or block tag. |

**ERR-10** Data errors:

| Code | Condition | Position |
| --- | --- | --- |
| `E_DATA_NUMBER_RANGE` | An integer is outside the safe integer range. | ERR-5. |
| `E_DATA_NUMBER_NOT_FINITE` | A number is NaN or infinite. | ERR-5. |
| `E_DATA_INVALID_UTF8` | A string is not valid UTF-8. | ERR-5. |
| `E_DATA_UNSUPPORTED_TYPE` | A value has a type that has no binding. | ERR-5. |

**ERR-11** Runtime errors:

| Code | Condition | Position |
| --- | --- | --- |
| `E_RUNTIME_TYPE` | An operand or argument has a type the operation does not accept. | The start of the expression node that failed (the binary or unary expression, the call, the spread), or the loop tag for an iterable of a wrong type. |
| `E_RUNTIME_COMPARE` | An ordering comparison has operands without an order. | The start of the comparison expression. |
| `E_RUNTIME_DIV_ZERO` | The right operand of `/` or `%` is zero. | The start of the division expression. |
| `E_RUNTIME_STRINGIFY` | A list or map is converted to a string. | The start of the echo expression, of the operator expression or of the call. |
| `E_RUNTIME_UNKNOWN_FUNCTION` | A call names a function that is neither built in nor registered. | The call. |
| `E_RUNTIME_ARITY` | A call has an argument count outside the function's range. | The call. |
| `E_RUNTIME_HOST_FUNCTION` | A registered function raised an error. | The call. |
| `E_RUNTIME_UNKNOWN_LOOP` | A loop meta names a loop that is not enclosing the expression. | The loop meta. |
| `E_RUNTIME_BLOCK_UNDEFINED` | `{# id}` names an id that the template definition registry does not contain. | The tag. |
| `E_RUNTIME_BLOCK_REDEFINED` | `{# id path}` names an id that is registered with a different path. | The tag. |
| `E_RUNTIME_DEPTH` | The nesting depth of includes and blocks exceeds the limit. | The include or block tag. |
| `E_RUNTIME_LIMIT` | The iteration count, the output size, the expression depth or a range size exceeds its limit. | The loop tag, the echo, the expression or the call. |

## Example

```json
{
  "code": "E_PARSE_UNCLOSED_BLOCK",
  "template": "product/list.tpl",
  "line": 12,
  "col": 1,
  "offset": 318,
  "end": 341,
  "message": "block opened by {@ product = products} is not closed"
}
```
