<!-- doc-id: schema-readme -->
# Schema

[한국어](README.ko.md).

`ast.schema.json` is the JSON Schema (draft-07) of the template AST defined in [`docs/spec/ast.md`](../docs/spec/ast.md). The root definition is `Template`. `Node` is the union of statement nodes and `Expr` is the union of expression nodes.

Definitions: `Span`, `Template`, `NodeList`, `Node`, `Text`, `Echo`, `IfBranch`, `If`, `For`, `Set`, `Include`, `ScopeItem`, `Block`, `IfBlock`, `Identifier`, `Expr`, `Literal`, `Var`, `LoopMeta`, `Member`, `Index`, `Call`, `Unary`, `Binary`, `Ternary`, `Spread`, `List`, `MapEntry`, `Map`.

`tokens.schema.json` is the shape of the `expected.tokens.json` files of CNF-2 in [`docs/spec/conformance.md`](../docs/spec/conformance.md): an array of `[start, end, type]` with byte offsets and the token types of EDT-8. `format.schema.json` is the shape of the `expected.format.json` files: the results `indent` and `keep`, each `{"text"}` or `{"error": {"reason", "code", "line", "col"}}`.

Validation:

```sh
node scripts/check-schema.mjs
```

The script validates the three schemas against the draft-07 meta-schema, every `tests/cases/**/expected.ast.json` against `Template`, every `ast` field of `tests/fixtures/expr/cases.json` against `Expr`, and every `expected.tokens.json` and `expected.format.json` against their schemas. It also checks what JSON Schema cannot express: the tokens are sorted and do not overlap. `node scripts/check-schema-mutations.mjs` proves that the schemas and that check reject altered files. It exits with status 1 and prints one line per failure on stderr.
