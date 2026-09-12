# Compiler 계약

[English](compiler.md).

Compiler는 template parsing, validation, lowering, artifact emission을 소유한다. Runtime package는 이미 compile한 program을 실행한다. Render request에서 source를 parse하거나 host compiler를 호출하지 않는다.

compiler와 runtime의 단일 계약 원본은 [`tools/compiler/interface.json`](../../tools/compiler/interface.json)이다. 생성 선언부와 Mermaid 도표는 이 manifest와 일치해야 한다. TypeScript, Go, Rust, PHP mapping은 표기와 오류 전달 방식을 바꿀 수 있지만 소유 관계, field 순서, operation 위치, 상태 전이를 바꿀 수 없다.

## Pipeline

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-architecture.mmd-->
```

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-classes.mmd-->
```

하나의 source graph와 명시적인 type manifest를 하나의 typed program으로 lower한다. `ast`는 언어 중립적인 canonical AST artifact를 생성한다. `gen`은 같은 typed program을 선택한 TypeScript, Go, Rust, PHP backend로 전달한다. JavaScript ESM은 TypeScript backend가 만드는 배포 artifact이며 별도 의미 구현이 아니다.

Canonical artifact manifest는 각 template의 digest 항목과 함께 source 각 줄의 시작 byte offset을 기록한다. Generated program은 이 line index와 보존된 node·expression span을 조합해 runtime에 template source를 읽지 않고 원본 line과 column을 보고한다.

각 backend는 별도 `LanguageBackend` 구현이다. Backend는 구조화한 code writer를 통해 선언부와 직접적인 template 제어 흐름을 생성한다. Scenario 이름, 고정 request data, 예상 output 또는 직렬화한 AST node interpreter를 포함하지 않는다.

## 공개 구조

`TypeManifest.root`는 `Assign` 또는 `any`다. `Assign`은 고정된 root field를 선언한다. `any`는 입력 계약이 의도적으로 동적일 때 알 수 없는 member를 `any?`로 취급하는 map 형태 root를 선언한다. 두 형태 모두 record field, definition target, template input, host-function signature는 명시한다. 한 request 값에서 type을 추론하지 않는다. 개별 field나 parameter의 `any`는 별도 실행 mode를 만들지 않고 runtime value model을 사용하며, root가 `Assign`일 때 field 검사를 끄지 않는다.

Typed IR은 모든 symbol, template path, definition target, function signature, input type을 해석하고 모든 node와 expression의 source span을 보존해 generated runtime 실패가 원본 template을 가리키게 한다. 변수 누락, 정적 타입에 없는 member, 선언하지 않은 definition, 잘못된 include path, 알 수 없는 함수 구현 종류, 호환되지 않는 block input은 compile 실패다. 명시적인 동적 `any`의 member, index, spread, loop는 IR에 남아 `RuntimeBindings`를 사용한다. Built-in과 host signature는 같은 call node를 사용하고 program load를 위해 구현 종류를 보존한다.

모든 generated module은 논리 구조 `Assign`, `DefinitionData<T>`, `Definition<T>`, `Definitions`, `Input<T>`, `ArtifactManifest`, `GeneratedProgram`을 노출한다. Generated program은 AST program과 같은 `Program.prepare(RenderRequest)`, `Program.render(RenderRequest)` operation을 구현한다. Template별 함수는 private이고 include와 block target에서 서로 직접 호출한다.

`RuntimeServices`는 두 program mode가 함께 사용하는 runtime interface다. 구체적인 `RuntimeEnvironment`가 자원 제한과 host 함수 registry를 소유하고 등록을 한 번 검증하며 이 interface를 구현한다. 각 `AstProgram`과 `GeneratedProgram`은 environment 하나를 소유한다. AST에만 필요한 template loading은 AST renderer에 속하며 environment나 generated 실행 상태에는 들어가지 않는다. `RuntimeBindings`가 `RuntimeServices`를 사용하므로 generated 코드는 AST loader나 interpreter에 의존하지 않고 같은 값·오류 의미를 사용한다.

Generated expression은 unary와 eager binary 연산, truthiness, 문자열 변환, escaping, 숫자 변환, 유한 산술 결과 검증, 동등성, 정렬, lookup, 반복 entry, 함수, limit, error를 target runtime의 `RuntimeBindings`로 처리한다. AST evaluator도 같은 unary와 binary 연산을 사용하며 evaluator와 generated 제어 흐름에는 `&&`, `||`, `??`에 필요한 lazy branch 선택만 남는다. 실제 선언은 compiler manifest와 대조한다. Backend는 typed operand에서 data-model 규칙과 정확히 같은 경우에만 native operation을 생성할 수 있다.

TypeScript backend는 bind한 root, source line index가 있는 frame, render context, runtime bindings를 직접 template 함수에 전달한다. 이 함수들은 context output builder에 기록하므로 generated 실행도 AST 실행과 같은 UTF-8 output 제한과 위치 오류를 사용한다. Include와 block은 공통 render chain에 enter·leave하면서 generated template 함수를 직접 호출한다.

PHP backend도 같은 실행 경계를 따른다. 생성된 template 함수는 `Context`, `Frame`, `RuntimeBindings`와 bind한 root map을 받고 context output limiter를 통해 출력하며 값 연산과 함수 호출을 package runtime에 위임한다. Typed map은 `MapValue`로 유지하므로 generated lookup, truthiness, ordering, spread가 PHP 배열의 key 변환에 영향을 받지 않고 data model을 보존한다.

내장 함수는 compiler가 알고 있다. 참조한 host 함수에는 manifest signature와 runtime 구현이 필요하다. Signature가 없으면 emission 전에 실패한다. Runtime 구현 누락, arity 오류, host 실패는 AST 실행과 같은 error field를 사용한다.

## Artifact 갱신

Compile mode와 artifact 갱신은 서로 독립적인 build 설정이다.

- `dev`는 compiler를 호출할 때마다 parse, validate, emit한다. Development watcher는 정적으로 연결한 Go 또는 Rust process를 rebuild하고 restart한다.
- `true`는 source, type, contract, compiler 구현 digest를 계산하고 digest가 달라졌을 때만 emit한다.
- `false`는 template source를 읽지 않고 아무것도 emit하지 않는다. 배포 artifact를 검증해 사용한다.

Generated file은 임시 위치에서 완성한 뒤 원자적으로 교체한다. Artifact manifest는 mode, target, entry, source digest, type digest, contract digest, compiler digest와 file을 기록한다. Compiler digest는 해당 target을 만든 parser/compiler module을 포괄하므로 compiler 구현이 바뀌면 나머지 입력이 같아도 artifact를 갱신한다. Artifact가 없거나 손상됐거나 호환되지 않으면 runtime 시작 전에 실패한다.

## 구현 상태

AST compiler와 runtime은 구현됐다. 제품 compiler는 TypeScript, Go, Rust, PHP의 구체적인 `GeneratedProgram`을 생성하고 showcase는 이 artifact를 TypeScript, JavaScript, Go, Rust, PHP에서 직접 실행한다. Typed compiler가 `default` 내장 함수만 받고 전체 적합성 suite를 통과하지 않았으므로 generated 실행은 여전히 partial이다.

Generated artifact는 canonical AST artifact와 같은 갱신 경계를 사용한다. `dev`는 항상 새 source 파일과 manifest를 생성하고, `true`는 source·type·contract·compiler digest를 검증한 뒤 재생성 여부를 결정하며, `false`는 배포된 generated source와 manifest만 읽어 검증한다. Source와 manifest는 원자적으로 교체하며 manifest를 마지막에 반영한다.

두 program mode는 같은 실행 상태 분리를 사용한다. `RenderFrame`은 `name`, `lines`, `context`만 소유하며 AST를 보유할 수 없다. `RenderScope`는 `locals`와 `loops`를 소유하고 `lookup`과 `loopMeta`를 제공하며 include에서 공유되고 block render마다 새로 만들어진다. Interface gate가 네 언어의 필드와 연산을 검사한다.

같은 gate가 TypeScript compiler API, Go AST, Rust syntax tree, PHP Reflection으로 구체적인 `RuntimeEnvironment`의 field 순서, operation 소속과 인자 수를 검사한다. AST program이 limits나 host 함수 상태를 중복 소유하지 않고 environment를 소유하는지도 함께 확인한다.
