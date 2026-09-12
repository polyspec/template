# Schema

[한국어](README.ko.md).

`ast.schema.json` is the JSON Schema (draft-07) of the template AST defined in [`docs/spec/ast.md`](../docs/spec/ast.md). The root definition is `Template`. `Node` is the union of statement nodes and `Expr` is the union of expression nodes.

Definitions: `Span`, `Template`, `NodeList`, `Node`, `Text`, `Echo`, `IfBranch`, `If`, `For`, `Set`, `Include`, `ScopeItem`, `Block`, `IfBlock`, `Identifier`, `Expr`, `Literal`, `Var`, `LoopMeta`, `Member`, `Index`, `Call`, `Unary`, `Binary`, `Ternary`, `Spread`, `List`, `MapEntry`, `Map`.

Validation:

```sh
node scripts/check-schema.mjs
```

The script validates the schema against the draft-07 meta-schema, every `tests/cases/**/expected.ast.json` against `Template`, and every `ast` field of `tests/fixtures/expr/cases.json` against `Expr`. It exits with status 1 and prints one line per failure on stderr.
