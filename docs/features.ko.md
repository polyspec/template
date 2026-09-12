# 기능 상태

[English](features.md). 계약은 [명세](index.ko.md)에 정의되어 있다. 검증과 배포는 따로 기록한다. `pending`은 통과 결과가 아니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| spec | 렉시컬, 문법, 표현식, 데이터 모델, 함수, 런타임, AST, 오류, 적합성 명세 | implemented | passed | not-deployed | [명세](index.ko.md) |
| ast-schema | AST의 JSON Schema와 스키마 검사기 | implemented | passed | not-deployed | [스키마](../schema/README.ko.md) |
| conformance-suite | 픽스처 케이스, 표현식 픽스처, 적합성 러너, 일치 러너 | implemented | passed | not-deployed | [적합성](spec/conformance.ko.md) |
| template-ts | TypeScript 렉서, 파서, 렌더러, 함수, CLI | implemented | passed | not-deployed | [패키지](../packages/template-ts/README.ko.md) |
| template-browser | TypeScript 패키지의 브라우저 빌드와 브라우저 렌더 테스트 | implemented | passed | not-deployed | [브라우저 테스트](../tests/browser/render.spec.ts) |
| template-go | Go 렉서, 파서, 렌더러, 준비된 렌더 상태, 함수, CLI | implemented | passed | not-deployed | [패키지](../packages/template-go/README.ko.md) |
| template-rust | Rust 렉서, 파서, 렌더러, 준비된 렌더 상태, 함수, CLI | implemented | passed | not-deployed | [패키지](../packages/template-rust/README.ko.md) |
| template-php | PHP 렉서, 파서, 렌더러, 함수, CLI | implemented | passed | not-deployed | [패키지](../packages/template-php/README.ko.md) |
| template-php-ext | Rust 크레이트로 빌드하는 PHP 확장 | implemented | passed | not-deployed | [패키지](../packages/template-php-ext/README.ko.md) |
| performance-measurements | 출력 동일성 검증 뒤 기록하는 시나리오별 AST와 generated 측정값 | in-progress | pending | not-deployed | [성능 측정](operations/benchmark.ko.md) |
| showcase | 공통 템플릿·목업 JSON assign·직접 경로 대응 define 레지스트리·하나의 커밋 canonical AST graph·parser 기반 구문 강조·크기가 제한된 artifact 보기·처리량 결과를 제공하는 예제 사이트 | in-progress | pending | not-deployed | [예제 사이트](operations/showcase.ko.md) |
| generated-mode | 정규 AST에서 직접 생성한 TypeScript·Go·Rust·PHP 호스트 언어 렌더러 | in-progress | pending | not-deployed | [compiler 계약](spec/compiler.ko.md) |
| docs-check | 문서 링크, 번역 쌍, 코드 블록, 상태 검사 | implemented | passed | not-deployed | [문서 절차](operations/documentation.ko.md) |

2026-09-12 검증: `make docs-check`가 문서 쌍 30개로 통과했다. `node scripts/check-schema.mjs`가 AST 파일 189개와 표현식 AST 53개를 검증했다. 문서 커버리지가 문서화된 공개 심볼과 파일 250개를 보고했다. `make check`가 lint, 네 패키지 단위 테스트, 5개 구현의 211개 케이스에 대한 적합성 1055건 중 1055건을 통과했다. `make test-browser`가 Chromium에서 통과했다. `make test-ext`가 PHP 확장을 빌드하고 적합성 211건 중 211건과 확장 테스트 236개를 통과했다.

예제 단순화 후 검증: `make showcase`가 5개 시나리오·5개 구현의 25개 조합을 통과하고 벤치마크 표본 125개를 기록했다. 모든 시나리오는 `layout`을 직접 렌더한다. 페이지 조합 결과는 376바이트, SHA-256 `6de7a00c32889afe300a9e9ba10ac57520c60e4aceda3bbc6f257c9213856782`이며 두 직접 경로 define, assign 값, 반복문과 조건문을 보여준다. `make showcase-check`가 새 렌더 비교와 브라우저의 목업 assign·define·템플릿 표시 검사를 통과했다. `make docs-check`가 문서 쌍 30개, AST 파일 189개, 표현식 AST 53개, 문서 커버리지 250개로 통과했다. 소비 애플리케이션 통합은 별도 작업이며 발행된 패키지는 없다.

언어 간 계약 정의 후 검증: `make showcase`가 직접 경로 형태의 `define.json` 항목으로 같은 25개 조합을 통과했고 5개 시나리오의 모든 출력 해시를 유지했다. `make docs-check`가 런타임 계약 도표, 네 언어 예제, 문서 쌍 30개를 통과했다. 이제 빌드는 표준 assign·define 형태를 사용하지 않는 시나리오를 거부한다.

어댑터 계약 강제 후 검증: `node scripts/check-showcase-contract.mjs`가 manifest 생성, 생성된 선언부, 소스 메서드 순서, TypeScript 컴파일, Go 인터페이스 컴파일과 포맷, Rust trait 컴파일, PHP reflection, 런타임 assertion 거부, 다섯 시나리오 요청, 실패 후 반복 해시를 TypeScript·JavaScript·Go·Rust·PHP에서 통과했다. `make docs-check`가 동기화된 Mermaid 계약과 문서 쌍 30개를 통과했다.

현재 generated mode 범위: 제품 compiler artifact는 `AstProgram`과 같은 `Program` 계약을 구현한다. `make conformance-all-modes`는 TypeScript, Go, Rust, PHP에서 canonical case 211개를 AST와 generated 실행으로 검증한 core cell 1,688개 전체를 통과한다. Generated runner는 host language artifact를 compile·실행하고 AST fallback 없이 내장 함수 호출, compile 진단, 입력 진단, runtime 진단, 정확한 UTF-8 출력을 비교한다. 성능, package 소비, showcase release 검증은 아직 pending이다.
