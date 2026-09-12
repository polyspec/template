# 타입 고정 컴파일러 계약

컴파일러는 호스트 언어별 출력으로 나뉘기 전에 하나의 공통 구조를 가진다. source graph에는 정규 template AST가 들어간다. 타입 manifest는 assign 필드, record, 호출 가능한 함수, definition target과 template input을 고정한다. `lowerSourceGraph`는 이름, 경로, scope와 타입을 해석해 `TypedProgram`을 만들고, 각 언어 backend는 이 program을 호스트 언어 문법으로만 표현한다.

계약 원본은 [`tools/compiler/interface.json`](../../tools/compiler/interface.json)이다. `make compiler-interface-check`는 generated API가 없거나 비공개인 경우, 도표가 오래된 경우, 미리 렌더한 문자열 slot 경로가 generated module에 다시 들어온 경우 실패한다.

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-architecture.mmd-->
```

generated module은 동일한 논리 구성요소를 공개한다. 언어별 표기만 manifest mapping에서 달라진다. `renderTemplate`은 Go에서 `RenderTemplate`, Rust와 PHP에서 `render_template`이 된다.

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-classes.mmd-->
```

`Definition<T>.data`는 선언된 target에 맞는 고정된 부분 구조 `DefinitionData<T>`를 가진다. 각 필드가 실제로 전달됐는지를 보존하므로 생략한 data 필드가 root assign 값을 지울 수 없다. 생성된 block은 `assign`, 전달된 definition data 필드, `block scope` 순서로 `Input<T>`을 만든 뒤 생성된 자식 template 함수를 직접 호출한다. `Definition<T>.html`은 이미 신뢰된 HTML을 반환하는 명시적인 분기이며, 컴파일된 template인 것처럼 취급하지 않는다.

생성기가 소스 문자열을 출력하는 이유는 호스트 컴파일러가 소스 문자열을 입력으로 받기 때문이다. 이는 일반적인 compiler backend 경계다. 모든 선언과 문장이 typed program에서 나와야 정식 구조다. 시나리오 이름, 고정 필드, 미리 렌더한 출력은 backend 입력이 아니다.
