<!-- doc-id: docs-operations-tools -->
<!-- source-sha256: 06107b3a51461b1436ce384d86ddf7b4b080a49571234f65f32c5237176f2099 -->
# 저장소 도구

[English](/operations/tools).

이 showcase 계약 규칙은 template 언어가 아니라 저장소의 showcase adapter와 도구에 묶여 있어서 명세에서 옮겼다.
template 언어의 모든 구현이 필요로 하는 것은 아니다.

- 공통 render request는 각 언어의 native API에 변경 없이 매핑된다. native map, object, JSON value는 adapter 표현일 뿐이므로
  request의 필드 이름, 중첩, 값 타입은 그대로 유지된다.
- adapter는 공통 JSON을 해석해 native API 값을 만들 수 있지만, 컨트롤러 데이터를 추가하거나, 필드 이름을 바꾸거나,
  필터를 적용하거나, 그 밖의 방식으로 요청을 재구성해서는 안 된다.

## 저장소 도구의 규칙

아래 규칙은 build compiler, browser package, showcase 도구에 묶인다. 각 규칙은 단일 구현이나 저장소 도구를 설명하므로 명세에서 옮겼다. 모든 구현이 공유하는 규칙은 명세에 남는다.

TypeScript 패키지는 템플릿 소스나 파싱된 AST를 담은 map 로더로 브라우저에서 렌더한다.

브라우저에서 다시 렌더할 페이지를 렌더하는 서버는 assign 데이터를 `{= json(assign) | raw}`로 만든 내용의 `<script type="application/json">`으로 임베드한다. 브라우저는 데이터 모델 문서가 정의하는 대로 패키지의 파서로 그 JSON을 파싱하고, 같은 템플릿 이름을 같은 assign 데이터, define, env로 렌더해 같은 출력을 만든다.

시나리오는 루트 기준 UTF-8 `*.tpl` 이름으로 템플릿 소스를 저장하고, `assign`은 `data.json`, define은 `define.json`, 선택적인 환경은 `env.json`에 저장한다. 시나리오 target은 `target`으로 따로 전달한다.

언어 간 픽스처 형식은 템플릿 define을 문자열 경로로 직접 표현한다. 추가 값이 필요한 define만 `template: string`과 선택적인 `data: object`를 가진 객체 또는 `html: string` 객체로 표현한다.

성공한 일치성 검사는 완전한 UTF-8 출력 바이트를 비교한 뒤 같은 요청을 다시 렌더해 반복 바이트도 비교한다.

manifest는 `Adapter`, `Scenario`, `RenderRequest`, `DefineEntry`, `Environment`, `RepeatResult`의 설계 원본이다. record 필드와 union variant는 선언한 순서를 유지하며 소유 관계와 `from` 연결은 `Scenario`에서 `RenderRequest`로 어떤 값이 전달되는지 설명한다.

[계약 생성기](../../scripts/generate-showcase-contract.mts)는 TypeScript, JavaScript, Go, Rust 선언부, PHP 선언부와 Mermaid 원본을 생성한다. 생성 파일이 manifest와 다르면 계약 게이트가 실패한다.

언어 문법은 각 언어의 관례를 따를 수 있다(`NewAdapter`, `Adapter::new`, `__construct`는 생성자 이름이다). manifest 매핑을 통해 concrete type, 생성자 인자, 메서드 순서, 인자 타입, 반환 타입과 요청 필드는 동일하게 유지한다.

[계약 검사기](../../scripts/check-showcase-contract.mts)는 소스 선언, TypeScript 컴파일, Go 인터페이스 대입과 포맷, Rust trait 컴파일, PHP 문법과 `ReflectionClass`, 생성된 런타임 assertion, 모든 showcase 시나리오에 대한 다섯 어댑터 실행을 검사한다.

상태 증명은 `constructor -> loadScenario -> buildRequest -> renderTwice`를 실행하고, 잘못된 target 오류를 관찰하고, 원래 요청을 다시 렌더한 뒤 첫 번째·두 번째·복구 UTF-8 해시를 비교한다. 오류와 복구 과정에서 요청은 바뀌지 않는다.

인터페이스 manifest는 하나의 compiler와 동등한 두 mode를 선언한다. `ast`는 `AstArtifact`, `gen`은 host language source와 artifact manifest를 반환한다. 둘 다 같은 prepared render 계약을 가진 `Program`을 만든다.

Artifact manifest는 contract format, mode, target language, entry, source digest, type digest, contract digest, output path를 포함한다. Artifact는 service 시작 전에 생성하고 process에 한 번 load하거나 정적으로 연결한다. Repository는 artifact를 build로 만들고 추적하지 않는다. manifest가 digest를 기록하고 build는 digest가 같은 artifact를 다시 쓴다(RT-71).

Artifact 갱신은 build 정책이다. `dev`는 compiler를 호출할 때마다 재생성하고, `true`는 source, type, contract digest가 달라지면 재생성하며, `false`는 source를 읽지 않고 배포 artifact만 사용한다. Development watcher는 재생성 뒤 정적으로 연결한 Go와 Rust process를 rebuild하고 restart한다.

컴파일 모드는 `ast` 또는 `gen`이다. `ast`는 AST artifact를 만들고 AST renderer로 해석한다. `gen`은 호스트 언어 renderer 코드를 만들고 직접 호출한다. 생성 렌더러도 AST renderer와 동일한 정규화 요청(`target`, 호스트 바인딩을 거친 `assign`과 `define`, 해석한 `env`)을 받는다. 모드가 산출물 갱신 정책을 결정하지는 않는다.

산출물 갱신 정책은 `dev`, `true`, `false`다. build coordinator는 `dev`에서 compiler 호출마다 생성하고, `true`에서 digest가 바뀐 뒤 생성하며, `false`에서 소스를 읽지 않는다. `false`에서 배포 산출물이 없거나 오래되거나 손상되면 오류다.

타입 고정 generated artifact는 assign, 필드 전달 여부를 보존하는 definition data, definitions와 template input을 선언한다. 생성된 block은 root assign, 전달된 definition data 필드, block scope 순서로 입력을 적용한 뒤 대상 template 함수를 직접 호출한다. 미리 렌더한 문자열 slot은 generated template target이 아니다.

Build compiler는 `--refresh dev|true|false`를 받는다. `dev`는 항상 쓰고, `true`는 source, type, contract digest가 일치하는 artifact를 재사용하며, `false`는 source를 읽거나 parse하지 않고 artifact도 쓰지 않는다.
