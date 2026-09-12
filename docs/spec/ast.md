# AST

[한국어](/ko/spec/ast).

The AST is the result of parsing one template file. Every implementation produces the same AST for the same source. The JSON Schema is in [`schema/ast.schema.json`](https://github.com/polyspec/template/blob/main/schema/ast.schema.json).

## Structure

**AST-1** The root is a `Template` node with `type`, `name` (the template name given to the parser) and `body` (a list of statement nodes). `Template` has no `span`.

**AST-2** Every node other than `Template` has `type` and `span`. `span` is `[start, end)`: `start` is the UTF-8 byte offset of the first byte of the node in the source, `end` is the byte offset after the last byte. Offsets count from 0 at the first byte of the file after BOM removal.

**AST-3** Statement nodes:

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

**AST-4** Expression nodes:

| Node | Fields | Value rules |
| --- | --- | --- |
| `Literal` | `kind`, `value` | `kind` is `null`, `bool`, `number` or `string`; `value` is `null`, a boolean, a JSON number or the decoded string |
| `Var` | `name` | |
| `LoopMeta` | `loop`, `field` | `field` is one of `index_`, `key_`, `value_`, `last_`, `first_`, `size_` |
| `Member` | `object`, `key` | `key` is a string; `a.0` has key `"0"` |
| `Index` | `object`, `index` | `index` is an expression |
| `Call` | `name`, `args` | `args` is a list of expressions |
| `Unary` | `op`, `operand` | `op` is `!` or `-` |
| `Binary` | `op`, `left`, `right` | `op` is one of `+ - * / % == != === !== < > <= >= && \|\| ?? in` |
| `Ternary` | `test`, `then`, `else` | `then` is `null` for `?:` |
| `List` | `items` | each item is an expression or a `Spread` |
| `Map` | `entries` | each entry is `{key, value}` with expression key and value, or a `Spread` |
| `Spread` | `expr` | |

The span of an expression node is the source range of the expression text, from its first byte to the byte after its last byte, without surrounding whitespace.

## Desugaring

**AST-5** The parser produces these nodes for the listed forms:

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

**AST-6** A comment produces no node. Standalone line removal is applied before `Text` nodes are created, so a `Text` value does not contain removed lines. Text separated only by comments or removed lines is one `Text` node. Text separated by any other node is separate `Text` nodes.

## Serialization

**AST-7** The AST serializes to JSON. Object key order has no meaning; comparison is structural. `span` is present on every node other than `Template`. A number literal serializes as a JSON number, so `1e3` serializes as `1000` and `1.50` as `1.5`. A string literal serializes as the decoded string. `null` fields are written as JSON `null`, not omitted.

**AST-8** Every serialized AST validates against `schema/ast.schema.json`. `scripts/check-schema.mjs` validates the schema and every `expected.ast.json` in `tests/cases/`.

## Example

Source `<b>{= product.price | number}</b>` with template name `x.tpl`:

```json
{
  "type": "Template",
  "name": "x.tpl",
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
