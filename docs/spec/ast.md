<!-- doc-id: docs-spec-ast -->
# AST

[한국어](/ko/spec/ast).

The AST is the result of parsing one template file. Every implementation produces the same AST for the same source. The JSON Schema is in [`contracts/schema/ast.schema.json`](https://github.com/polyspec/template/blob/main/contracts/schema/ast.schema.json).

## Structure

- **AST-1** The root is a `Template` node with `type`, `name` (the template name given to the parser), `body` (a list of statement nodes) and `comments` (a list of `Comment` nodes, AST-9). `Template` has no `span`.

- **AST-2** Every node other than `Template` has `type` and `span`. `span` is `[start, end)`: `start` is the UTF-8 byte offset of the first byte of the node in the source, `end` is the byte offset after the last byte. Offsets count from 0 at the first byte of the file after BOM removal.

- **AST-3** Statement nodes:

| Node | Fields | Span |
| --- | --- | --- |
| `Text` | `value` | from the first to the last source byte that contributes to the value |
| `Echo` | `expr` | the tag from `{` to `}` |
| `If` | `branches` (list of `{test, body, span}`), `else` (list of nodes or `null`) | from the opening tag to the end of the closing tag |
| `For` | `name`, `iter`, `body`, `empty` (list of nodes or `null`) | from the opening tag to the end of the closing tag |
| `Set` | `name`, `expr` | the tag |
| `Include` | `path` | the tag |
| `Block` | `id` (string or `null`), `path` (string or `null`), `scope` (list of `{name, expr}`) | the tag |
| `IfBlock` | `id`, `body`, `else` (list of nodes or `null`) | from the opening tag to the end of the closing tag |

The span of a tag written as a wrapped tag runs from the wrapper opener to the end of the wrapper closer. Each entry of `If.branches` carries the `span` of its opening tag (`{? ...}` or `{:? ...}`). `else` is `null` when the block has no `{:}` tag and a list when it has one, including an empty list.

- **AST-4** Expression nodes:

Operator and loop metadata literal sets are public SDK data contracts. TypeScript names them with string unions; Rust uses the public `UnaryOp`, `BinaryOp` and `LoopMetaField` enums and serializes them to the schema strings. Go uses the string fields of its AST node types, while PHP, the PHP extension and Python use AST map fields. Every public AST decoder validates these fields against the same schema and preserves every canonical literal. Rust `BinaryOp::as_str` returns that same canonical operator text.

| Node | Fields | Value rules |
| --- | --- | --- |
| `Literal` | `kind`, `value` | `kind` is `null`, `bool`, `number` or `string`; `value` is `null`, a boolean, a JSON number or the decoded string |
| `Var` | `name` | |
| `LoopMeta` | `loop`, `field` | `field` is one of `index_`, `key_`, `value_`, `last_`, `first_`, `size_` |
| `Member` | `object`, `key` | `key` is a string; `a.0` has key `"0"` |
| `MemberCall` | `object`, `method`, `args` | Calls a declared method on an assigned object |
| `ClassCall` | `className`, `method`, `args` | Calls a declared logical class function |
| `Index` | `object`, `index` | `index` is an expression |
| `Call` | `name`, `args` | `args` is a list of expressions |
| `Unary` | `op`, `operand` | `op` is `!` or `-` |
| `Binary` | `op`, `left`, `right` | `op` is one of `+ - * / % == != === !== < > <= >= && \|\| ?? in` |
| `Ternary` | `test`, `then`, `else` | `then` is `null` for `?:` |
| `List` | `items` | each item is an expression or a `Spread` |
| `Map` | `entries` | each entry is `{key, value}` with expression key and value, or a `Spread` |
| `Spread` | `expr` | |

The span of an expression node is the source range of the expression text, from its first byte to the byte after its last byte, without surrounding whitespace.

- **AST-9** `Template.comments` lists every comment of the file (LEX-10) in source order, including comments inside block bodies and wrapped comments. A `Comment` node has `type`, `value` and `span`. `value` is the source text between the sigil `*` and the `*` of the terminator, unchanged: `{* note *}` has the value `" note "`, `{**}` the value `""`, and a multi-line comment keeps its line terminators. `span` is the span of the tag (AST-3): from the open delimiter, or the wrapper opener of a wrapped comment, to the end of the close delimiter, or the end of the wrapper closer. A template without comments has an empty list. Reason: a comment produces no output and no statement node, and a tool that reads every comment of a template reads them from the parser instead of scanning the source again.

## Desugaring

- **AST-5** The parser produces these nodes for the listed forms:

| Source | Node |
| --- | --- |
| `a \| f(b, c)` | `Call` `f` with args `[a, b, c]`; span from the start of `a` to the end of `)` |
| `a \| f` | `Call` `f` with args `[a]` |
| `x += e` (also `-= *= /= %=`) | `Set` `x` with `Binary` `+` (`Var` `x`, `e`) |
| `x++`, `x--` | `Set` `x` with `Binary` `+` or `-` (`Var` `x`, `Literal` number `1`) |
| `e ??` at the end of an expression | `Binary` `??` (`e`, `Literal` `null`) |
| `a ?: b` | `Ternary` with `test` `a`, `then` `null`, `else` `b` |
| `-1` | `Unary` `-` (`Literal` number `1`) |
| `(e)` | The node of `e`; the parentheses produce no node and are not part of the span |

The `Literal` `null` produced for a trailing `??` has an empty span at the end of the `??` token; the `Binary` node spans from the left operand to the end of `??`.
| `name.index_` where `name` is an identifier and the field is a loop meta field | `LoopMeta` |

- **AST-6** A comment produces no statement node; it is listed in `Template.comments` (AST-9). Standalone line removal is applied before `Text` nodes are created, so a `Text` value does not contain removed lines. Text separated only by comments or removed lines is one `Text` node. Text separated by any other node is separate `Text` nodes.

## Serialization

- **AST-7** The AST serializes to JSON. Object key order has no meaning; comparison is structural. `span` is present on every node other than `Template`. A number literal serializes as a JSON number, so `1e3` serializes as `1000` and `1.50` as `1.5`. A string literal serializes as the decoded string. `null` fields are written as JSON `null`, not omitted.

- **AST-8** Every serialized AST validates against `contracts/schema/ast.schema.json`. `scripts/check-schema.mts` validates the schema and every `expected.ast.json` in `tests/cases/`.

- **AST-10** Every runtime that renders an AST publishes the decode of the AST JSON (AST-7) into the AST that its `parse` returns: `decodeTemplate` in TypeScript, from the package entry and the render-only entry, `ast.DecodeTemplate` in Go, `decode_template` in Rust and Python and `AstProgram::decodeTemplate` in PHP. TypeScript, Go and Rust return their AST types, and PHP, the PHP extension and Python their arrays and dicts as the parser builds them: a number literal is a float and, in Python, a span is a tuple. A decode validates the JSON against `contracts/schema/ast.schema.json` with the JSON Schema validator of its ecosystem: ajv, santhosh-tekuri/jsonschema, the crate jsonschema, opis/json-schema and the package jsonschema of PyPI. JSON that the schema rejects fails with an error whose path is the JSON Pointer (RFC 6901) of the invalid node: of the instance locations of the errors of the validator, the deepest, and of several at that depth the least in code point order. The schema selects the schema of a node by its `type` with `if`/`then`, so an error names a value of the node itself, and every runtime names the same pointer for each invalid AST of `tests/fixtures/ast-decode/invalid.json`. Text that is not JSON fails with the JSON error of the language. Rust also fails, with the pointer of the node that holds it, on a value that the schema accepts and its types cannot hold, such as a span offset beyond `usize`. The schema is one file: the build of TypeScript bundles `contracts/schema/ast.schema.json`, and Go (`ast/ast.schema.json`, by `embed`), Rust (`src/ast.schema.json`, by `include_str!`), Python (package data) and PHP (`resources/ast.schema.json`) and the PHP extension (`src/pt_ast_schema.h`, a C string) hold a copy that a test of the package compares with that file byte for byte. The PHP extension decodes as the PHP package: its `AstProgram::decodeTemplate` validates with a validator of the keywords that the schema uses, written in the C of the extension, and names the same pointer with the reason that opis/json-schema gives, so a failure is the same error with and without the extension. Reason: a host that stores a parsed template as its AST JSON (RT-41), such as a server that sends it to a browser, reads it back as a checked AST instead of casting it.

## Example

Source `<b>{= product.price | number}</b>` with template name `x.tpl`:

```json
{
  "type": "Template",
  "name": "x.tpl",
  "comments": [],
  "body": [
    { "type": "Text", "value": "<b>", "span": [0, 3] },
    {
      "type": "Echo",
      "span": [3, 29],
      "expr": {
        "type": "Call",
        "name": "number",
        "span": [6, 28],
        "args": [
          {
            "type": "Member",
            "key": "price",
            "span": [6, 19],
            "object": { "type": "Var", "name": "product", "span": [6, 13] }
          }
        ]
      }
    },
    { "type": "Text", "value": "</b>", "span": [29, 33] }
  ]
}
```

The public shapes and fields are those of the canonical schema. TypeScript interfaces, Go structs and Rust structs or enum variants publish their native representations. PHP arrays and Python dictionaries publish the same fields through the public decoder of AST-10. An API declaration identifies a native property when it has a symbol of its own; an implicit enum tag belongs to its variant, and an array or dictionary field belongs to the decoder contract. Decoder round trips cover every schema shape and field, including class calls without a registered class.

Native AST carriers name the statement and expression alternatives: TypeScript uses the `Node`/`Expr` unions, Go uses the closed `ast.Node`/`ast.Expr` interfaces, and Rust uses the `Node`/`Expr` enums. PHP, the PHP extension and Python expose the same discriminated plain data through their public decoder. Literal values are null, boolean, number or string; Rust names those alternatives with `LiteralValue`, and its map-item carrier distinguishes `MapEntry::Entry` and `MapEntry::Spread`. The canonical schema still determines where a spread is allowed, even when a native expression carrier includes it for list/map storage. Shared native decoder data verifies every scalar alternative, false values and map-entry/spread preservation.
