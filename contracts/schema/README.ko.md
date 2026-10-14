<!-- doc-id: schema-readme -->
<!-- source-sha256: 3056e8e630e1433e32913f21217fba5388964ec6ae50f583036f8bd99847bc96 -->
# 스키마

[English](README.md).

`ast.schema.json`은 [`docs/spec/ast.md`](../../docs/spec/ast.ko.md)에 정의된 템플릿 AST의 JSON Schema(draft-07)다. 루트 정의는 `Template`이다. `Node`는 문장 노드의 합집합이고 `Expr`은 표현식 노드의 합집합이다. 각각은 노드의 정의를 `if`/`then`으로 그 `type`에 따라 고르고, list item과 map entry는 `type`으로 `Spread`를 고르며, `Literal`은 `kind`로 `value`의 타입을 고르고, null이 될 수 있는 필드는 `if`로 null을 받고 `else`로 자기 정의를 따른다. 그래서 스키마에는 `oneOf`가 없고 검증기는 노드의 잘못된 값에서 오류를 보고하며, 모든 런타임의 decode는 그 JSON Pointer를 말한다(AST-10).

정의: `Span`, `Template`, `NodeList`, `Node`, `Text`, `Echo`, `IfBranch`, `If`, `For`, `Set`, `Include`, `ScopeItem`, `Block`, `IfBlock`, `Identifier`, `Expr`, `Literal`, `Var`, `LoopMeta`, `Member`, `Index`, `Call`, `Unary`, `Binary`, `Ternary`, `Spread`, `List`, `MapEntry`, `Map`.

`tokens.schema.json`은 [`docs/spec/conformance.md`](../../docs/spec/conformance.ko.md) CNF-2의 `expected.tokens.json` 파일의 형태다: 바이트 오프셋과 EDT-8의 토큰 종류로 된 `[start, end, type]`의 배열이다. `format.schema.json`은 `expected.format.json` 파일의 형태다: 결과 `indent`와 `keep`이고 각각 `{"text"}` 또는 `{"error": {"reason", "code", "line", "col"}}`이다.

검증:

```sh
node scripts/check-schema.mts
```

스크립트는 세 스키마를 draft-07 메타스키마로, `tests/cases/**/expected.ast.json` 전부를 `Template`으로, `tests/fixtures/expr/cases.json`의 모든 `ast` 필드를 `Expr`로, 모든 `expected.tokens.json`과 `expected.format.json`을 각 스키마로 검증한다. JSON Schema로 표현할 수 없는 것, 곧 토큰이 정렬되어 있고 겹치지 않는지도 검사한다. `node scripts/check-schema-mutations.mts`는 스키마와 그 검사가 변형된 파일을 거부함을 증명한다. 실패마다 stderr에 한 줄을 출력하고 상태 1로 종료한다.
