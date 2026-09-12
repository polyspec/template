# 스키마

[English](README.md).

`ast.schema.json`은 [`docs/spec/ast.md`](../docs/spec/ast.ko.md)에 정의된 템플릿 AST의 JSON Schema(draft-07)다. 루트 정의는 `Template`이다. `Node`는 문장 노드의 합집합이고 `Expr`은 표현식 노드의 합집합이다.

정의: `Span`, `Template`, `NodeList`, `Node`, `Text`, `Echo`, `IfBranch`, `If`, `For`, `Set`, `Include`, `ScopeItem`, `Block`, `IfBlock`, `Identifier`, `Expr`, `Literal`, `Var`, `LoopMeta`, `Member`, `Index`, `Call`, `Unary`, `Binary`, `Ternary`, `Spread`, `List`, `MapEntry`, `Map`.

검증:

```sh
node scripts/check-schema.mjs
```

스크립트는 스키마를 draft-07 메타스키마로, `tests/cases/**/expected.ast.json` 전부를 `Template`으로, `tests/fixtures/expr/cases.json`의 모든 `ast` 필드를 `Expr`로 검증한다. 실패마다 stderr에 한 줄을 출력하고 상태 1로 종료한다.
