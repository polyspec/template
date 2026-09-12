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

각 backend는 별도 `LanguageBackend` 구현이다. Backend는 구조화한 code writer를 통해 선언부와 직접적인 template 제어 흐름을 생성한다. Scenario 이름, 고정 request data, 예상 output 또는 직렬화한 AST node interpreter를 포함하지 않는다.

## 공개 구조

`TypeManifest`는 assign field, record field, definition target, template input, host-function signature를 선언한다. 한 request 값에서 type을 추론하지 않는다. 명시적인 `any` 선언은 별도 실행 mode를 만들지 않고 runtime value model을 사용한다.

모든 generated module은 논리 구조 `Assign`, `DefinitionData<T>`, `Definition<T>`, `Definitions`, `Input<T>`, `ArtifactManifest`, `GeneratedProgram`을 노출한다. Generated program은 AST program과 같은 `Program.prepare(RenderRequest)`, `Program.render(RenderRequest)` operation을 구현한다. Template별 함수는 private이고 include와 block target에서 서로 직접 호출한다.

Generated expression은 truthiness, 문자열 변환, escaping, 숫자 변환, 유한 산술 결과 검증, 동등성, 정렬, lookup, 반복 entry, 함수, limit, error를 target runtime의 `RuntimeBindings`로 처리한다. 네 runtime의 AST evaluator와 statement renderer는 이미 이 경계를 사용하며 실제 선언을 compiler manifest와 대조한다. Backend는 typed operand에서 data-model 규칙과 정확히 같은 경우에만 native operation을 생성할 수 있다.

내장 함수는 compiler가 알고 있다. 참조한 host 함수에는 manifest signature와 runtime 구현이 필요하다. Signature가 없으면 emission 전에 실패한다. Runtime 구현 누락, arity 오류, host 실패는 AST 실행과 같은 error field를 사용한다.

## Artifact 갱신

Compile mode와 artifact 갱신은 서로 독립적인 build 설정이다.

- `dev`는 compiler를 호출할 때마다 parse, validate, emit한다. Development watcher는 정적으로 연결한 Go 또는 Rust process를 rebuild하고 restart한다.
- `true`는 source, type, contract digest를 계산하고 digest가 달라졌을 때만 emit한다.
- `false`는 template source를 읽지 않고 아무것도 emit하지 않는다. 배포 artifact를 검증해 사용한다.

Generated file은 임시 위치에서 완성한 뒤 원자적으로 교체한다. Artifact manifest는 mode, target, entry, source digest, type digest, contract digest와 file을 기록한다. Artifact가 없거나 손상됐거나 호환되지 않으면 runtime 시작 전에 실패한다.

## 구현 상태

AST compiler와 runtime은 구현됐다. Generated 실행은 partial이다. 현재 showcase 시나리오 5개로만 검증했고 typed compiler는 `default` 내장 함수만 받으며 별도 showcase generator를 사용한다. 이 경로는 이 계약을 만족하지 않으므로 generated compiler를 완성하면서 제거한다.
