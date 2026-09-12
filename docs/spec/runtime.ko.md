# 런타임

[English](runtime.md).

이 문서는 엔진 API, 템플릿 이름과 로딩, 스코프, 루프, include, 템플릿 define, block 태그, 출력, 제한, 오류 동작, 브라우저 렌더링, 캐싱을 정의한다. 값 규칙은 [data-model.ko.md](data-model.ko.md), 표현식 평가는 [expressions.ko.md](expressions.ko.md), 함수는 [functions.ko.md](functions.ko.md), AST는 [ast.ko.md](ast.ko.md), 오류 코드는 [errors.ko.md](errors.ko.md)에 정의되어 있다.

## API

- **RT-1** 모든 구현은 선언한 지원 레벨에 필요한 연산을 제공한다. 이름은 각 언어의 관례를 따르며 같은 레벨을 선언한 구현은 같은 논리 연산을 제공한다.

```
parse(source, name, { delimiters }) -> Template
Engine(options: { loader, functions, limits, delimiters })
engine.register(name, fn)
engine.render(target: name | Template, assign, { define, env }) -> string
engine.prepare(target: name | Template, assign, { define, env }) -> PreparedRender
prepared.render() -> string
Loader.load(name) -> { source | ast, version }
```

- **RT-2** `parse`는 다른 템플릿을 로드하지 않고 AST 문서에 정의된 AST를 생성한다. include와 block 태그는 렌더 중에 해석한다.
- **RT-3** `render`는 템플릿 이름 또는 파싱된 템플릿을 받는다. 이름을 받으면 엔진이 로더로 템플릿을 로드한다. 전체 출력을 하나의 문자열로 반환한다.
- **RT-4** `assign`은 호스트 바인딩 규칙으로 변환한 map이다. `define`은 템플릿 define map(RT-24)이다. `env`는 함수 문서에 정의된 `timezone`과 `now`를 가진 map이다. `define`과 `env`는 각각 생략할 수 있다. 생략한 `define`은 빈 map이다.
- **RT-5** 엔진 옵션의 `functions`와 `register`는 함수 문서에 정의된 대로 호스트 함수를 추가한다.
- **RT-6** 엔진 옵션의 `limits`는 RT-33의 제한 값을 덮어쓴다. 생략한 제한은 기본값을 유지한다.
- **RT-61** `prepare`는 `assign`을 바인딩하고 `define`과 `env`를 해석하며 target template을 선택하고 해당 템플릿을 한 번 로드하거나 파싱한다. 바인딩된 요청 상태를 소유하고 엔진의 캐시된 템플릿을 참조하는 준비된 요청을 반환한다.
- **RT-62** `PreparedRender.render`는 렌더마다 필요한 scope, output, 실행 상태만 만든다. 입력이 바뀌지 않은 반복 호출은 같은 UTF-8 바이트를 출력한다. `render`는 `prepare(...).render()`와 같으며 단일 호출 편의 연산으로 유지한다.
- **RT-63** 준비된 렌더 계약은 [`tools/runtime/interface.json`](../../tools/runtime/interface.json)에 선언한다. `scripts/check-runtime-interface.mjs`는 필요한 언어 매핑이나 연산이 하나라도 없으면 실패한다.
- **RT-42** 엔진 옵션과 `parse`의 `delimiters`는 렉시컬 문서가 정의하는 대로 태그 구분자를 선택한다. 기본값은 `{}`다. 템플릿 파일의 구분자 지시문은 그 파일에 대해 옵션보다 우선한다.

## 언어 간 렌더 계약

실행 가능한 showcase의 어댑터 경계에는 하나의 원본인 [인터페이스 manifest](../../tools/showcase/adapters/interface.json)가 있다. 이 manifest는 타입, 필드 순서, nullable 여부, 필수 필드, 소유 관계, 생성자, 연산, 오류, 전제조건, 상태 전이와 언어별 이름 매핑을 선언한다. 각 언어의 native 타입은 이 계약을 표현하며 계약을 다시 설계하지 않는다.

```mermaid
flowchart LR
  Files["scenario directory"] --> Adapter["language adapter"]
  Adapter --> Scenario["Scenario"]
  Scenario --> Request["RenderRequest"]
  Request --> Engine["Engine.render"]
  Engine --> Output["UTF-8 output"]
```

```mermaid
classDiagram
    class Adapter {
        +path root
        +Engine engine
        +Adapter(root) Adapter
        +loadScenario() Scenario
        +buildRequest(Scenario) RenderRequest
        +render(RenderRequest) string
        +renderTwice(RenderRequest) RepeatResult
    }
    class Scenario {
        +string target
        +JsonObject assign
        +DefineRegistry define
        +Environment? env
    }
    class RenderRequest {
        +string target
        +JsonObject assign
        +DefineRegistry define
        +Environment? env
    }
    class Environment {
        +string? timezone
        +number? now
    }
    class RepeatResult {
        +string first
        +string second
    }
    class DefineEntry {
        +string template
        +JsonObject data
        +string html
    }
    Adapter *-- Scenario : loads
    Scenario *-- RenderRequest : buildRequest transfers fields
    RenderRequest *-- DefineEntry : owns define entries
    RenderRequest o-- Environment : optional
    DefineEntry --> DefineEntry : template data is ordered object
```

```mermaid
stateDiagram-v2
    [*] --> ready : constructor
    ready --> scenario-loaded : loadScenario
    scenario-loaded --> request-built : buildRequest
    request-built --> rendered : render
    request-built --> rendered : renderTwice
    failed --> request-built : recover after render error
    failed --> request-built : recover after renderTwice error
```

```mermaid
sequenceDiagram
    participant Caller
    participant Adapter
    participant Engine
    Caller->>Adapter: loadScenario()
    Adapter-->>Caller: Scenario
    Caller->>Adapter: buildRequest(Scenario)
    Adapter-->>Caller: RenderRequest
    Caller->>Adapter: renderTwice(RenderRequest)
    Adapter->>Engine: render(target, assign, define, env)
    Engine-->>Adapter: first UTF-8 bytes
    Adapter->>Engine: render(target, assign, define, env)
    Engine-->>Adapter: second UTF-8 bytes
    Adapter-->>Caller: RepeatResult
```

논리적 요청은 다음 JSON 형태다.

```json
{
  "target": "layout",
  "assign": { "title": "Mock title" },
  "define": {
    "layout": "layout.tpl",
    "contents": "content.tpl"
  },
  "env": { "timezone": "Z", "now": 1789084800 }
}
```

- **RT-43** 모든 구현은 같은 `RenderRequest` 필드를 각 언어의 native API에 매핑한다. native map, object, JSON value는 어댑터 표현일 뿐이며 필드 이름, 중첩, 값 타입을 바꾸지 않는다.
- **RT-44** JSON 값은 `null`, boolean, number, string, array 또는 문자열 키를 가진 object다. `assign`은 루트 object다. `define.data`가 있으면 역시 object다.
- **RT-45** 시나리오는 루트 기준 UTF-8 `*.tpl` 이름으로 템플릿 소스를 저장하고, `assign`은 `data.json`, define은 `define.json`, 선택적인 환경은 `env.json`에 저장한다. 시나리오 target은 `target`으로 따로 전달한다. `scenario.json`의 선택적인 `legacyWrappers` boolean은 어댑터가 소유한 엔진의 parser를 설정하며 `RenderRequest`로 복사하지 않는다.
- **RT-46** 언어 간 픽스처 형식은 템플릿 define을 문자열 경로로 직접 표현한다. 추가 값이 필요한 define만 `template: string`과 선택적인 `data: object`를 가진 객체 또는 `html: string` 객체로 표현한다.
- **RT-47** 어댑터는 공통 JSON을 해석해 native API 값을 만들 수 있지만 컨트롤러 데이터 추가, 필드 이름 변경, 필터 적용, 그 밖의 요청 재구성을 해서는 안 된다.
- **RT-48** 성공한 일치성 검사는 완전한 UTF-8 출력 바이트를 비교한 뒤 같은 요청을 다시 렌더해 반복 바이트도 비교한다.
- **RT-49** manifest는 `Adapter`, `Scenario`, `RenderRequest`, `DefineEntry`, `Environment`, `RepeatResult`의 설계 원본이다. record 필드와 union variant는 선언한 순서를 유지하며 소유 관계와 `from` 연결은 `Scenario`에서 `RenderRequest`로 어떤 값이 전달되는지 설명한다.
- **RT-50** [계약 생성기](../../scripts/generate-showcase-contract.mjs)는 TypeScript, JavaScript, Go, Rust 선언부, PHP 선언부와 네 Mermaid 원본을 생성한다. 생성 파일이 manifest와 다르면 계약 게이트가 실패한다.
- **RT-51** 언어 문법은 각 언어의 관례를 따를 수 있다(`NewAdapter`, `Adapter::new`, `__construct`는 생성자 이름이다). manifest 매핑을 통해 concrete type, 생성자 인자, 메서드 순서, 인자 타입, 반환 타입과 요청 필드는 동일하게 유지한다.
- **RT-52** [계약 검사기](../../scripts/check-showcase-contract.mjs)는 소스 선언, TypeScript 컴파일, Go 인터페이스 대입과 포맷, Rust trait 컴파일, PHP 문법과 `ReflectionClass`, 생성된 런타임 assertion, 모든 showcase 시나리오에 대한 다섯 어댑터 실행을 검사한다.
- **RT-53** 상태 증명은 `constructor -> loadScenario -> buildRequest -> renderTwice`를 실행하고, 잘못된 target 오류를 관찰하고, 원래 요청을 다시 렌더한 뒤 첫 번째·두 번째·복구 UTF-8 해시를 비교한다. 오류와 복구 과정에서 요청은 바뀌지 않는다.

## 지원 레벨과 컴파일 artifact

- **RT-54** 인터페이스 manifest는 지원 레벨을 선언한다. `core-runtime`은 `register`와 `render`를 제공하고, `source-compiler`는 `parse`와 정규 AST 직렬화를 제공하며, `artifact-runtime`은 원본을 파싱하지 않고 정규 AST artifact를 로드한다. `native-source-backend`는 선택적인 호스트 언어 소스 생성 backend다.
- **RT-55** 구현은 manifest에 지원 레벨을 선언한다. 같은 레벨을 선언한 구현은 같은 논리 타입과 연산을 제공하고, 언어별 표기는 mapping에만 기록한다. 지원하지 않는 연산은 그 레벨에 넣지 않으며 빈 메소드나 runtime fallback으로 만들지 않는다.
- **RT-56** production 지원 구현은 `core-runtime`, `source-compiler`, `artifact-runtime`을 제공한다. 생성된 PHP 같은 native source artifact는 선택적인 `native-source-backend` 기능이며 언어 간 공통 artifact 형식이 아니다.
- **RT-57** 컴파일 artifact는 정규 AST와 schema 버전, 언어, 시나리오, 원본 SHA-256, artifact SHA-256, 템플릿 artifact 경로를 가진 manifest를 포함한다. artifact는 서비스 시작 전에 생성되고 프로세스에 한 번 로드된다.
- **RT-58** 컴파일 모드는 세 가지다. `dev`는 항상 artifact를 재생성하고, `changed`는 원본 해시가 바뀐 artifact만 재생성하며, `off`는 기존 artifact만 읽고 누락·오래됨·잘못된 형식이면 실패한다.
- **RT-59** 요청 경로에서는 파싱, 원본 파일 탐색, artifact 생성이 실행되지 않는다. 같은 artifact에 같은 assign, define, environment를 적용하면 같은 출력 바이트를 만들고 request를 변경하지 않는다.

생성과 검증 명령은 다음과 같다.

```sh
node scripts/generate-showcase-contract.mjs --check
node scripts/check-showcase-contract.mjs
```

지원 레벨 도표도 언어별 선언부와 같은 manifest에서 생성한다.

```mermaid
flowchart TB
  SourceCompiler["source-compiler: parse, encodeArtifact"] --> ArtifactRuntime["artifact-runtime: loadArtifact, render"]
  ArtifactRuntime --> CoreRuntime["core-runtime: render"]
  NativeBackend["native-source-backend: optional"] --> ArtifactRuntime
```

## 이름과 로딩

- **RT-7** 템플릿 이름은 로더 루트 기준 상대 경로이며 구분자는 `/`이고 앞에 `/`가 없다. `render(name, ...)`으로 렌더하는 템플릿의 이름은 `name`이다. 문자열 target이 `define`의 템플릿 항목과 일치하면 그 항목의 경로를 렌더한다. 따라서 호스트는 `layout: "layouts/page.tpl"` 같은 define으로 레이아웃을 선택할 수 있다.
- **RT-8** include나 block 태그에 쓴 경로는 그 태그를 포함한 템플릿의 디렉터리를 기준으로 해석한다. 앞에 `/`가 있는 경로는 루트를 기준으로 해석한다. `.`과 `..` 세그먼트는 정규화한다. 정규화 후 루트를 벗어나는 경로는 `E_LOAD_OUTSIDE_ROOT`로 실패한다.
- **RT-9** 로더는 이름에 대해 소스 텍스트와 버전을 반환하거나 이름이 없음을 보고한다. 없는 이름은 `E_LOAD_NOT_FOUND`로 실패한다.
- **RT-10** 파일시스템 로더는 `root/name`을 읽고 파일의 수정 시각과 크기를 버전으로 사용한다. map 로더는 이름과 소스 또는 파싱된 AST를 메모리에 두고 콘텐츠 버전을 사용한다. 컴파일 artifact loader는 파싱된 AST를 보관하고 artifact 해시를 버전으로 사용한다.

## 스코프

- **RT-11** 렌더되는 각 템플릿 파일은 로컬 스코프 하나를 가진다. 파일 안의 블록(`{? }`, `{@ }`)은 스코프를 만들지 않는다.
- **RT-12** 변수는 로컬 스코프에서 먼저 찾고, 다음으로 컨텍스트 데이터에서 찾는다. 루트 템플릿의 컨텍스트 데이터는 `assign`이다. block의 컨텍스트 데이터는 RT-26에 정의한다. 어디에도 없는 이름은 `null`이다.
- **RT-13** 대입 `{x = e}`는 `x`를 로컬 스코프에 쓴다. 로컬 변수는 같은 이름의 컨텍스트 데이터 항목을 가린다. 대입은 컨텍스트 데이터를 변경하지 않는다.
- **RT-14** 루프 메타(`x.index_` 등)는 이름 `x`에 대해 활성인 루프에서 해석한다. 활성 루프 변수가 아닌 이름의 루프 메타는 `E_RUNTIME_UNKNOWN_LOOP`으로 실패한다.

## 루프

- **RT-15** `{@ v = e}`는 `e`를 한 번 평가한다. list는 원소를 순서대로 키 `0`, `1`, `2`, ...와 함께 반복한다. map은 값을 삽입 순서대로 그 키와 함께 반복한다. `null`은 0회 반복한다. bool, number, string은 `E_RUNTIME_TYPE`으로 실패한다.
- **RT-16** 각 반복은 로컬 스코프에서 `v`를 원소에 바인딩하고 `v`의 루프 메타를 설정한다: `index_`(0 기반 위치), `key_`(list 인덱스는 number, map 키는 string), `value_`(원소), `first_`(첫 반복에서 `true`), `last_`(마지막 반복에서 `true`), `size_`(원소 수).
- **RT-17** 루프가 끝나면 `v`와 그 루프 메타는 루프 전의 값으로 복원한다. 루프 전에 바인딩되지 않았던 이름은 루프 후에도 바인딩되지 않는다.
- **RT-18** 중첩 루프는 바깥 루프의 변수 이름을 다시 사용할 수 있다. 안쪽 바인딩과 메타는 안쪽 루프가 끝날 때까지 적용된다.
- **RT-19** 루프의 `{:}` 분기는 루프가 0회 반복했을 때 실행한다.
- **RT-20** 각 반복은 렌더의 반복 카운터를 증가시킨다. 반복 제한을 넘으면 `E_RUNTIME_LIMIT`으로 실패한다.

## include

- **RT-21** `{+ path}`는 해석된 경로의 템플릿을 로드하고 그 본문을 포함하는 템플릿의 로컬 스코프와 같은 컨텍스트 데이터에서 렌더한다. 포함된 템플릿의 대입은 태그 뒤에서 포함하는 템플릿에 보인다.
- **RT-22** 현재 include와 block 체인에서 이미 렌더 중인 템플릿은 `E_LOAD_CYCLE`로 실패한다.
- **RT-23** 각 include와 각 block은 중첩 깊이를 1 증가시킨다. 깊이 제한을 넘는 깊이는 `E_RUNTIME_DEPTH`로 실패한다.

## block

- **RT-24** `define` map은 식별자를 템플릿 define에 대응시킨다. define은 문자열 경로 또는 `template: path`와 선택적인 `data: map`을 가진 객체다. `html: string`을 가진 객체는 완성된 HTML을 제공한다. `render`에 주는 define의 템플릿 경로는 로더 루트 기준이다. 언어 간 픽스처 형식은 RT-46에 정의한다.
- **RT-25** `{# id}`는 `id`로 등록된 define을 렌더한다. 등록되지 않은 식별자는 `E_RUNTIME_BLOCK_UNDEFINED`로 실패한다.
- **RT-26** 템플릿 define은 새 로컬 스코프에서, 루트 `assign`, define의 `data`, 태그의 scope 인자 순으로 만든 컨텍스트 데이터로 렌더한다. 같은 이름은 뒤의 출처가 앞의 출처를 덮어쓴다. 호출하는 템플릿의 로컬 변수와 루프 메타는 보이지 않는다.
- **RT-27** HTML 항목은 그 문자열을 이스케이프 없이 출력에 쓴다. HTML 항목에 준 scope 인자는 무시한다.
- **RT-28** `{# id path ...}`는 `id`를 해석된 경로의 템플릿 항목으로 등록한 뒤 렌더한다. `id`가 이미 같은 경로로 등록되어 있으면 등록은 아무 일도 하지 않는다. `id`가 다른 경로나 HTML 항목으로 등록되어 있으면 태그는 `E_RUNTIME_BLOCK_REDEFINED`로 실패한다.
- **RT-29** 식별자 없는 `{# path ...}`는 해석된 경로의 템플릿을 등록 없이 템플릿 항목으로 렌더한다.
- **RT-30** scope 인자 `name:expr`은 `expr`을 호출 스코프에서 평가하고 block의 컨텍스트 데이터에 `name`을 바인딩한다. scope 인자 `name`은 `name:name`과 같다.
- **RT-31** `{?# id}`는 `id`가 등록되어 있으면 본문을, 아니면 `{:}` 분기를 렌더한다. 같은 렌더에서 앞선 `{# id path}` 태그가 한 등록은 보인다.

## 출력

- **RT-32** echo 태그는 safe 문자열을 그대로 쓴다. 그 외 값은 데이터 모델 규칙으로 문자열화한 뒤 `&` `<` `>` `"` `'`를 `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`로 치환해 HTML 이스케이프한다. list나 map은 `E_RUNTIME_STRINGIFY`로 실패한다.

## 제한

- **RT-33** 기본 제한:

| 제한 | 기본값 | 오류 |
| --- | --- | --- |
| 렌더당 루프 반복 | 1,000,000 | `E_RUNTIME_LIMIT` |
| include와 block 중첩 깊이 | 32 | `E_RUNTIME_DEPTH` |
| 출력 크기 | 16 MiB | `E_RUNTIME_LIMIT` |
| 표현식 중첩 깊이 | 64 | `E_RUNTIME_LIMIT` |

- **RT-34** 표현식 중첩 깊이는 파서와 평가기가 검사한다.
- **RT-35** 출력 크기는 출력을 쓰면서 검사한다. 넘으면 렌더가 실패한다.

## 오류

- **RT-36** 렌더 중 오류는 렌더를 중단한다. `render`는 부분 출력을 반환하지 않고 오류 문서에 정의된 오류 객체를 보고한다.
- **RT-37** 실행 모드는 없다. 모든 오류 코드는 하나의 동작을 가진다.

## 브라우저

- **RT-38** TypeScript 패키지는 템플릿 소스나 파싱된 AST를 담은 map 로더로 브라우저에서 렌더한다.
- **RT-39** 브라우저에서 다시 렌더할 페이지를 렌더하는 서버는 assign 데이터를 `{= json(assign) | raw}`로 만든 내용의 `<script type="application/json">`으로 임베드한다. 브라우저는 데이터 모델 문서가 정의하는 대로 패키지의 파서로 그 JSON을 파싱하고, 같은 템플릿 이름을 같은 assign 데이터, define, env로 렌더해 같은 출력을 만든다.

## 캐싱

- **RT-40** 엔진은 템플릿을 `name@version`마다 한 번 파싱하고 로더가 같은 버전을 보고하는 동안 파싱된 템플릿을 재사용한다.
- **RT-41** 파싱된 템플릿은 AST JSON으로 저장하고 다시 로드할 수 있다. AST 렌더는 소스 렌더와 같은 출력을 만든다.
- **RT-60** showcase compiler는 `node tools/showcase/compile.mjs --mode dev|changed|off`로 artifact를 생성한다. `dev`는 항상 쓰고, `changed`는 일치하는 원본·artifact 해시를 재사용하며, `off`는 쓰거나 원본을 파싱하지 않는다.
