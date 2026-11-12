<!-- doc-id: docs-spec-compiler -->
<!-- source-sha256: ccd418ffbab6b397990907028cbace26899dcb6f55dd7bbcdd1842ecba5ceb0f -->
# Compiler 계약

[English](/spec/compiler).

Compiler는 template parsing, validation, lowering, artifact emission을 소유한다. Runtime package는 이미 compile한 program을 실행한다. Render request에서 source를 parse하거나 host compiler를 호출하지 않는다.

compiler와 runtime의 단일 계약 원본은 [`packages/compiler/interface.json`](https://github.com/polyspec/template/blob/main/packages/compiler/interface.json)이다. 생성 선언부와 Mermaid 도표는 이 manifest와 일치해야 하며, 어떤 mapping도 manifest가 선언한 상태 전이를 바꾸지 않는다.

- **CMP-1** TypeScript, Go, Rust, PHP, PHP 확장, Python의 선언부는 소유 관계, field 순서, operation 위치에서 manifest와 일치한다; mapping은 표기와 오류 전달 방식만 바꿀 수 있다. 모든 구현의 compiler interface test가 그 구현이 선언한 class, field, operation을 manifest와 비교한다.

Manifest의 `evidence` section은 이 계약을 읽는 기계 판독 경로다. 명세 순서, 적합성 fixture, 실행 가능한 예제, 생성 artifact, 필수 검증 명령을 연결한다. Checker가 연결 대상의 누락을 거부하므로 읽는 사람은 중복 요약에 의존하지 않고 계약에서 실행 증거까지 따라갈 수 있다.

## Pipeline

```mermaid
<!--@include: ../../packages/compiler/generated/compiler-architecture.mmd-->
```

```mermaid
<!--@include: ../../packages/compiler/generated/compiler-classes.mmd-->
```

하나의 source graph와 명시적인 type manifest를 하나의 typed program으로 lower한다. `ast`는 언어 중립적인 canonical AST artifact를 생성한다. `gen`은 같은 typed program을 선택한 언어의 backend, 곧 TypeScript, Go, Rust, PHP, Python backend로 전달하며 PHP 확장은 PHP 프로그램을 실행한다. JavaScript ESM은 TypeScript backend가 만드는 배포 artifact이며 별도 의미 구현이 아니다.

Compile request는 최초 delimiter 쌍을 전달한다. Canonical artifact manifest는 이 값을 기록하고 source digest는 모든 template byte와 함께 delimiter를 결합한다. 따라서 delimiter만 바뀌어도 AST와 여기서 파생한 모든 generated artifact가 무효화된다.

Source compiler는 `.tpl` 파일에서 시작해 모든 정적 include와 block 경로를 따라간다. 참조된 template은 어떤 확장자도 사용할 수 있으며, 발견된 파일의 byte·AST·line index는 같은 source graph에 포함된다. 동적 conformance manifest는 include 대상의 자유 입력을 도출하고 중첩 include 경로로 전파해 호출자 local을 명시적으로 결합한다.

Canonical artifact manifest는 각 template의 digest 항목과 함께 source 각 줄의 시작 byte offset을 기록한다. Generated program은 이 line index와 보존된 node·expression span을 조합해 runtime에 template source를 읽지 않고 원본 line과 column을 보고한다.

각 backend는 별도 `LanguageBackend` 구현이다. Backend는 구조화한 code writer를 통해 선언부와 직접적인 template 제어 흐름을 생성한다. Scenario 이름, 고정 request data, 예상 output 또는 직렬화한 AST node interpreter를 포함하지 않는다.

## 타입 있는 프로그램

타입 있는 프로그램은 템플릿의 AST와 타입 manifest의 선언이다(binding 설계 U-4). compiler는 아래 typed IR이 말하는 대로 템플릿을 타입 manifest에 대해 검사하고, backend는 대상 언어의 선언만 낸다. 즉 구조 `Assign`과 manifest가 선언한 record, 그리고 요청을 그것들에 대해 필드마다, 선언된 타입이 거부한 값의 필드 경로와 함께 검사하고 타입 있는 `Assign`을 VAL-21의 값으로 바꾸며 artifact의 AST를 담은 `MapLoader` 위에서 런타임의 `AstProgram`으로 렌더하는 `GeneratedProgram`이다(RT-41). 생성 모듈에는 템플릿 제어 흐름, 식, 런타임 연산이 없다. 코어가 모든 템플릿을 실행하므로 타입 있는 프로그램과 AST 프로그램은 구성상 같은 바이트를 렌더하고 같은 오류로 실패한다. 생성 코드는 자기 언어의 런타임을 사용자가 설치하는 이름으로 import한다. Rust는 crate `polyspec-template`, 다른 언어는 바인딩 패키지 `@polyspec/template`, `polyspec.template`, `Polyspec\Template`, `github.com/polyspec/template/packages/go`다. 이유: 생성 제어 흐름은 코어가 한 번 하는 일을 다섯 언어로 반복했고, 런타임의 모든 규칙을 언어마다 증명해야 했다.

### 이행

backend는 Rust, TypeScript, Python, PHP, Go 순서로 하나씩 타입 있는 프로그램으로 옮긴다. Rust가 먼저인 것은 그 프로그램이 바인딩 없이 코어 crate 위에서 돌기 때문이고, Go가 마지막인 것은 그 바인딩이 마지막에 오기 때문이다. 옮기지 않은 backend는 이 절의 나머지가 설명하는 생성 실행을 그대로 내며, 그 생성 runner와 검사도 전처럼 돈다. backend가 옮겨지면 그 생성 conformance runner(`conformance-generated-<language>`)는 각 case를 선언으로 컴파일하고 그 선언으로 렌더한다. 그 언어에 대한 생성 제어 흐름 검사(`generated-typed-locals-check`와 `generated-native-check`, `generated-arguments-check`, `generated-bound-data-check`, `typed-generator`의 그 언어 행)는 선언의 검사, 즉 거부한 값의 필드 경로, 타입 있는 값의 변환, 출력이 AST 프로그램과 같은지의 검사가 되고, 아래 문단에서 그 언어가 빠진다. 마지막 backend가 옮겨지면 이 절에서 생성 실행의 문단이 빠진다.

## 공개 구조

`TypeManifest.root`는 `Assign` 또는 `any`다. `Assign`은 고정된 root field를 선언한다. `any`는 입력 계약이 의도적으로 동적일 때 알 수 없는 member를 `any?`로 취급하는 map 형태 root를 선언한다. 두 형태 모두 record field, definition target, template input, host-function signature는 명시한다. 한 request 값에서 type을 추론하지 않는다. 개별 field나 parameter의 `any`는 별도 실행 mode를 만들지 않고 runtime value model을 사용하며, root가 `Assign`일 때 field 검사를 끄지 않는다. `any` input은 optional 형태가 없다. `null`을 포함한 모든 runtime 값을 받으므로 `any?` 값도 nullability 오류 없이 들어간다. 따라서 동적 root는 include된 template의 자유 변수를 `any`로 도출한다. 호출자는 자기 scope에서 값을 넘기며, 그 scope에 바인딩되지 않은 이름은 `null`이다(RT-12, RT-13). Include는 그 scope에서 렌더링한다(RT-21). `any`는 값과 `null`을 모두 받는다.

Typed IR은 모든 symbol, template path, definition target, function signature, input type을 해석하고 모든 node와 expression의 source span을 보존해 generated runtime 실패가 원본 template을 가리키게 한다. 변수 누락, 정적 타입에 없는 member, 선언하지 않은 definition, 잘못된 include path, 알 수 없는 함수 구현 종류, 호환되지 않는 block input은 compile 실패다. 명시적인 동적 `any`의 member, index, spread, loop는 IR에 남아 `RuntimeBindings`를 사용한다. Built-in과 host signature는 같은 call node를 사용하고 program load를 위해 구현 종류를 보존한다.

Local 변수는 직선 코드에서 마지막 assignment의 type을 가진다. Branch나 loop body가 다른 type의 값으로 assign하는 local은 loop body 앞과 branch 또는 loop 뒤에서 그 assignment 전체를 병합한 type을 가진다. Loop body는 이전 반복이 assign한 값을 읽고 branch 뒤의 코드는 실행된 branch의 값을 읽기 때문이다. 서로 다른 두 type은 `any`로 병합한다.

동적 source graph는 parse된 template과 요청 definition schema에서 생성한 type manifest를 사용한다. 이 manifest는 참조한 함수, definition target과 block input을 선언하되 root value를 `any`로 유지하며 sample JSON에서 정적 host type을 추측하지 않는다. 적합성 gate는 host 언어 artifact를 컴파일하기 전에 parse 가능한 모든 fixture의 이 도출 과정을 검사한다.

도출한 manifest는 알고 있는 각 내장 함수의 선언된 `minArgs`와 `maxArgs`를 복사한다. 동적 conformance source는 잘못된 호출이 AST 실행과 같은 위치의 `runtime_arity`를 내도록 arity 검사를 runtime에 남기며, 명시적인 정적 manifest는 lowering 중에 그 호출을 거부할 수 있다. 알 수 없는 함수는 열린 arity 호출로 남아 runtime registry에 도달하고, 구현이 없으면 일반 runtime 오류를 낸다.

타입 있는 프로그램으로 옮기지 않은 backend의 generated module은 논리 구조 `Assign`, `Definitions`, `Input<T>`, `GeneratedProgram`을 노출한다. 다른 target의 module은 `DefinitionData<T>`, `Definition<T>`, `ArtifactManifest`도 노출한다. program이 읽지 않는 root field나 definition data도 그 type의 값을 만들지 않고 선언된 type에 대해 검사되며, 읽는 값과 같은 field 경로로 실패한다. Generated program은 AST program과 같은 `Program.prepare(RenderRequest)`, `Program.render(RenderRequest)` operation을 구현한다. Template별 함수는 private이고 include와 block target에서 서로 직접 호출한다.

타입 있는 프로그램으로 옮기지 않은 generated backend는 generated template 함수에 runtime `RenderScope`를 전달한다. Include는 같은 scope를 전달하므로 내부 assign이 호출자에게 유지된다. Block은 새 scope를 만들고 root data, definition data, 명시적인 block 인자만 넣는다. Loop binding은 실행 중에만 설치하고 종료 후 이전 상태로 복원한다. 각 generated loop는 entry를 구체화하고 반복 전에 size와 마지막 index를 한 번 계산하며, 매 반복에서 현재 index, key, value, first, last metadata를 scope에 할당한다. Block의 root 전용 fallback은 IR에서 일반적인 scope 인식 동적 조회와 별도로 표현한다. Generated 지원 수준은 모든 구현과 `tests/cases`의 모든 canonical case에서 완료되었다.

`RuntimeServices`는 두 program mode가 함께 사용하는 runtime interface다. 구체적인 `RuntimeEnvironment`가 자원 제한, 등록 함수, 논리 class function을 소유하고 등록을 한 번 검증하며 이 interface를 구현한다. 각 `AstProgram`과 `GeneratedProgram`은 environment 하나를 소유한다. AST에만 필요한 template loading은 AST renderer에 속하며 environment나 generated 실행 상태에는 들어가지 않는다. `RuntimeBindings`가 `RuntimeServices`를 사용하므로 generated 코드는 AST loader나 interpreter에 의존하지 않고 같은 값·오류 의미를 사용한다.

Generated expression은 unary와 eager binary 연산, truthiness, 문자열 변환, escaping, 숫자 변환, 유한 산술 결과 검증, 동등성, 정렬, lookup, 반복 entry, 함수, limit, error를 target runtime의 `RuntimeBindings`로 처리한다. AST evaluator도 같은 unary와 binary 연산을 사용하며 evaluator와 generated 제어 흐름에는 `&&`, `||`, `??`에 필요한 lazy branch 선택만 남는다. 실제 선언은 compiler manifest와 대조한다. Backend는 typed operand에서 data-model 규칙과 정확히 같은 경우에만 native operation을 생성할 수 있다.

TypeScript backend는 bind한 root, source line index가 있는 frame, render context, runtime bindings를 직접 template 함수에 전달한다. 이 함수들은 context output builder에 기록하므로 generated 실행도 AST 실행과 같은 UTF-8 output 제한과 위치 오류를 사용한다. Include와 block은 공통 render chain에 enter·leave하면서 generated template 함수를 직접 호출한다.

PHP backend도 같은 실행 경계를 따른다. 생성된 template method는 `Context`, `Frame`, `RuntimeBindings`와 bind한 root map을 받고 context output limiter를 통해 출력하며 값 연산과 함수 호출을 package runtime에 위임한다. Typed map은 `MapValue`로 유지하므로 generated lookup, truthiness, ordering, spread가 PHP 배열의 key 변환에 영향을 받지 않고 data model을 보존한다.

PHP backend는 compiler 호출자가 정하는 namespace를 요구한다. `compileFiles`의 `phpNamespace` 옵션 또는 compiler 명령의 `--php-namespace` 옵션으로 지정한다. Namespace는 `\`로 구분한 하나 이상의 PHP 식별자다. 유효한 namespace 없이 PHP로 compile하면 source를 생성하기 전에 실패한다. PHP target은 출력 directory에 class마다 PSR-4 파일 하나를 쓰며, 각 파일은 자신의 class 이름을 갖고 그 namespace 안에 class를 선언하고, class 이름은 PascalCase다(`InputLayoutTpl`, `DefinitionDataLayoutTpl`): record, `Assign`, `Definition`, `Definitions`, `ArtifactManifest`, template마다 static method를 가진 `GeneratedTemplates`, program이 쓰는 helper를 가진 `GeneratedRuntime`, `GeneratedExecution`, `GeneratedProgram`이다. `compileFiles`는 파일을 경로별로 반환하고, `compileSource`는 파일 하나를 쓰는 target을 위한 것이다. Directory 옆의 artifact manifest는 모든 파일과 그 byte의 digest를 나열한다. Host는 namespace를 directory에 대응시키는 Composer의 PSR-4 autoload(`composer.json`의 `autoload.psr-4` 또는 `ClassLoader::addPsr4`)로 program을 load한다. Program이 내장 binding schema로부터 instance를 만드는 class도 같은 namespace에서 해석한다. 따라서 namespace가 다른 두 generated program은 한 PHP process에서 load하고 render할 수 있으며, 어느 쪽도 generated directory 밖의 class와 충돌할 수 있는 전역 이름을 선언하지 않는다.

모든 target은 program이 쓰는 helper, type, method, import만 그 언어의 formatter 형식과 style로 생성하므로 소비자의 lint가 program에서 통과한다: Go program은 Go 관례의 header `// Code generated by @polyspec/template-compiler. DO NOT EDIT.`로 시작하고 `gofmt`가 바꾸지 않으며, Python program은 `ruff format`이 바꾸지 않으며, PHP 파일은 120열 제한을 포함해 PSR-12를 따른다: 그 제한을 넘을 인자 목록, 배열, 제어 구조의 조건, 연산자 연결은 PSR-12가 나누는 대로 한 줄에 항목 하나씩, 한 단계 들여 나눈다. `make generated-lint-check`는 showcase의 generated program을 각 생태계의 tool로 lint한다.

모든 backend는 template text, 문자열 literal, template 이름, 경로, message를 포함한 program의 모든 문자열을 target 언어의 정확한 문자열 literal로 기록한다. 따라서 generated program은 유효한 모든 UTF-8 text에 대해 AST program과 같은 byte를 출력한다. 제어 문자와, 큰따옴표 PHP 문자열의 `$`처럼 target 언어가 문자열 literal 안에서 해석하는 문자도 마찬가지다. PHP backend는 `\`와 `'`만 escape한 작은따옴표 literal을 기록하고, 모든 제어 문자는 큰따옴표 escape(`"\n"`, `"\r"`, `"\xHH"`)로 기록해 `.`로 잇는다. 따라서 어떤 literal도 generated source의 두 줄에 걸치지 않고 source는 제어 문자를 갖지 않는다. Rust backend는 `\`와 `"`를 escape하고 모든 제어 문자를 `\u{…}`로 기록한다. Go backend는 `\`와 `"`를 escape하고 모든 제어 문자를 `\u00XX`로 기록한다. TypeScript backend는 JSON 문자열 literal을 기록하며, 이는 정확한 JavaScript 문자열 literal이다.

Go backend는 typed template 제어 흐름을 생성하되 관찰 가능한 값 연산을 `render.RuntimeBindings`로 전달한다. 생성 함수는 `render.Context`, source line index가 있는 frame과 render chain을 공유한다. 내부 오류 전파는 code와 source position을 포함한 원래의 구조화 template 오류를 보존하고, native typed value는 runtime 경계에서 canonical value model로 bind한다.

Rust backend는 타입 있는 프로그램을 낸다. 즉 manifest의 `Assign`과 record(각각 `to_value`를 가짐), 소스의 줄 시작과 함께 canonical AST JSON으로 담은 템플릿 AST, 그리고 `GeneratedProgram`이다. `GeneratedProgram`의 `new(EngineOptions)`는 그 AST를 담은 `MapLoader`(`MapLoader::set_ast_lines`) 위에 crate의 `AstProgram`을 만들고, `render`, `prepare`, `render_bound`, `prepare_bound`, `render_values`, `render_assign`은 요청을 manifest에 대해 검사해 ERR-13의 메시지를 `GeneratedError::Argument`로 내고 그 프로그램으로 렌더한다. `program_mut`는 호스트 함수를 등록할 프로그램을 준다. 생성 모듈은 호스트가 필요한 부분만 부르므로 그 API에 규칙을 이유로 단 `dead_code` 허용을 둔다. consumer는 이를 `include!`로 crate에 가져오며, `build.rs`가 compile한 뒤의 `OUT_DIR`이나 commit된 파일에서 가져오고 crate tree의 module 파일로 두지 않는다. rustfmt는 crate의 module 파일을 포맷하고 include된 파일은 포맷하지 않으며(그 배치는 compiler의 것이다), clippy는 include된 코드를 lint하고 그 코드에는 clippy finding이 없다.

Rust 타입 있는 프로그램은 `polyspec-template`에만 의존한다. 격리 Cargo 설치 프로젝트는 이 경계를 강제하기 위해 추출한 `.crate` package에 대해 그것을 compile한다.

record를 담은 typed 값은 모든 runtime 연산에 canonical 값으로 도달한다. 함수, class 함수, method의 인자, `&&`, `||`, `??`를 제외한 연산자의 피연산자, echo의 식이 이에 해당한다. record는 선언 순서의 선언된 필드로 된 map이 되고, record의 list나 map은 모든 깊이에서 그런 map의 list나 map이 된다. 따라서 모든 backend에서 host 함수는 VAL-21 형태를 받고 연산자는 EXP-34를 적용한다. Typed member 접근과 loop는 typed record를 유지한다. 이유: AST program은 같은 데이터에 map을 넘긴다. Go backend는 record를 native object로 넘겼고, TypeScript와 PHP backend에서는 record를 함수에 넘기는 렌더가 `internal`로 실패했다. `make generated-native-check`는 `tests/fixtures/typed-values`를 typed manifest로 모든 backend에서 컴파일하고 출력을 AST program과 비교한다.

내장 함수는 compiler가 알고 있다. 참조한 host 함수에는 manifest signature와 runtime 구현이 필요하다. Signature가 없으면 emission 전에 실패한다. Runtime 구현 누락, arity 오류, host 실패는 AST 실행과 같은 error field를 사용한다.

## Artifact 갱신

Compile mode와 artifact 갱신은 서로 독립적인 build 설정이다.

- `dev`는 compiler를 호출할 때마다 parse, validate, emit한다. Development watcher는 정적으로 연결한 Go 또는 Rust process를 rebuild하고 restart한다.
- `true`는 source, type, contract, compiler 구현 digest를 계산하고 digest가 달라졌을 때만 emit한다.
- `false`는 template source를 읽지 않고 아무것도 emit하지 않는다. 배포 artifact를 검증해 사용한다.

Generated file은 임시 위치에서 완성한 뒤 원자적으로 교체한다. Artifact manifest(schema 4)는 mode, target, entry, source digest, type digest, contract digest와 file, 곧 artifact의 입력과 출력을 기록한다. 그것을 쓴 compiler는 기록하지 않는다. 어떤 compiler가 설치되는지는 설치할 때 패키지 관리자가 정하므로, 한 버전의 release 설치와 checkout은 같은 입력에 같은 manifest를 쓴다. 이전 schema의 manifest는 stale이다. Artifact가 없거나 손상됐거나 호환되지 않으면 runtime 시작 전에 실패한다.

## 구현 상태

AST compiler와 runtime은 구현됐다. 제품 compiler는 backend 언어마다 구체적인 `GeneratedProgram`을 생성하고 showcase는 모든 구현의 artifact를 직접 실행한다. Generated backend는 native object와 class call operation을 생성한다. 모든 구현에서 모든 canonical case의 generated matrix가 통과하며, 별도의 generated native-call fixture가 모든 구현에서 같은 assign object field, instance method, class function 결과를 출력하며, AST program과 같은 호스트 인자(VAL-21)와 native object 동등성(EXP-39)을 가진다.

Generated artifact는 canonical AST artifact와 같은 갱신 경계를 사용한다. `dev`는 항상 새 source 파일과 manifest를 생성하고, `true`는 entry와 source·type·contract digest를 검증한 뒤 재생성 여부를 결정하며, `false`는 배포된 generated source와 manifest만 읽어 검증한다. 검사는 다시 컴파일해 generated file이나 manifest의 바이트가 하나라도 다르면 실패한다. Source와 manifest는 원자적으로 교체하며 manifest를 마지막에 반영한다.

`make conformance-generated-ts`는 canonical case 각각에 대해 새로운 generated TypeScript program을 만든다. Compile 진단, 입력 binding 진단, runtime 진단, 성공한 UTF-8 출력을 AST 실행과 같은 expected artifact에 대조한다.
`make conformance-generated-php`는 각 case마다 별도로 생성하고 문법 검사한 PHP 소스로 같은 내용을 증명한다.
`make generated-native-check`는 모든 backend로 dynamic-root program 하나를 compile하고 native object assign, public field read, instance method call, 등록된 class function call을 실행한다. 같은 matrix에서 public member 누락, 등록되지 않은 class function, native method와 class function의 실패, native 인자의 잘못된 타입과 개수도 검사한다. 모든 backend는 같은 호출 위치에서 같은 오류 코드를 반환해야 한다. 같은 객체는 include한 template, block 인자, template define 데이터에 원본 호스트 객체로 도달해야 한다(VAL-18). PHP backend는 namespace 두 개로 두 번 compile하며, 두 program은 `GeneratedProgram`과 `Assign`이라는 전역 class와 함께 한 PHP process에서 load하고 render한다. 유효한 namespace 없이 PHP로 compile하면 실패해야 한다.

두 program mode는 같은 실행 상태 분리를 사용한다. `RenderFrame`은 `name`, `lines`, `context`만 소유하며 AST를 보유할 수 없다. `RenderScope`는 `locals`와 `loops`를 소유하고 `lookup`과 `loopMeta`를 제공하며 include에서 공유되고 block render마다 새로 만들어진다. Interface gate가 모든 구현의 필드와 연산을 검사한다.

같은 gate가 oxc-parser의 TypeScript AST, Go AST, Rust syntax tree, PHP Reflection으로 구체적인 `RuntimeEnvironment`의 field 순서, operation 소속과 인자 수를 검사한다. AST program이 limits나 host 함수 상태를 중복 소유하지 않고 environment를 소유하는지도 함께 확인한다.
