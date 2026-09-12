# 기능 상태

[English](features.md). 계약은 [명세](/ko/)에 정의되어 있다. 검증과 배포는 따로 기록한다. `pending`은 통과 결과가 아니다.

| ID | 기능 | 구현 | 검증 | 배포 | 근거 |
| --- | --- | --- | --- | --- | --- |
| spec | 렉시컬, 문법, 표현식, 데이터 모델, 함수, 런타임, AST, 오류, 적합성 명세 | implemented | passed | not-deployed | [명세](/ko/) |
| ast-schema | AST의 JSON Schema와 스키마 검사기 | implemented | passed | not-deployed | [스키마](https://github.com/polyspec/template/tree/main/schema) |
| conformance-suite | 픽스처 케이스, 표현식 픽스처, 적합성 러너, 일치 러너 | implemented | passed | not-deployed | [적합성](/ko/spec/conformance) |
| template-ts | TypeScript 렉서, 파서, 렌더러, 함수, CLI | implemented | passed | not-deployed | [패키지](https://github.com/polyspec/template/tree/main/packages/template-ts) |
| template-browser | TypeScript 패키지의 브라우저 빌드와 브라우저 렌더 테스트 | implemented | passed | not-deployed | [브라우저 테스트](../tests/browser/render.spec.ts) |
| template-go | Go 렉서, 파서, 렌더러, 준비된 렌더 상태, 함수, CLI | implemented | passed | not-deployed | [패키지](https://github.com/polyspec/template/tree/main/packages/template-go) |
| template-rust | Rust 렉서, 파서, 렌더러, 준비된 렌더 상태, 함수, CLI | implemented | passed | not-deployed | [패키지](https://github.com/polyspec/template/tree/main/packages/template-rust) |
| template-php | PHP 렉서, 파서, 렌더러, 함수, CLI | implemented | passed | not-deployed | [패키지](https://github.com/polyspec/template/tree/main/packages/template-php) |
| template-php-ext | Rust 크레이트로 빌드하는 PHP 확장 | implemented | passed | not-deployed | [패키지](https://github.com/polyspec/template/tree/main/packages/template-php-ext) |
| performance-measurements | 출력이 같은 AST와 generated의 compile, process, render, RSS 측정값 | implemented | passed | not-deployed | [성능 측정](/ko/operations/benchmark) |
| showcase | 공통 템플릿·목업 JSON assign·직접 경로 대응 define 레지스트리·하나의 커밋 canonical AST graph·parser 기반 구문 강조·크기가 제한된 artifact 보기·처리량 결과를 제공하는 예제 사이트 | implemented | passed | not-deployed | [예제 사이트](/ko/operations/showcase) |
| generated-mode | 정규 AST에서 직접 생성한 TypeScript·Go·Rust·PHP 호스트 언어 렌더러 | implemented | passed | not-deployed | [compiler 계약](/ko/spec/compiler) |
| docs-check | 문서 링크, 번역 쌍, 코드 블록, 상태 검사 | implemented | passed | not-deployed | [문서 절차](/ko/operations/documentation) |
| release-test-matrix | 계약·단위·compiler·적합성·mutation·소비·표시·성능으로 구성된 7계층 gate | implemented | passed | not-deployed | [릴리스 테스트](/ko/operations/testing) |
| dependency-policy | 호환되는 최신 안정 release, 기계 검사하는 고정 예외, lock 보안 권고 거부와 지원 runtime CI 양 끝점 | implemented | passed | not-deployed | [의존성 정책](/ko/operations/dependencies) |

2026-09-12 검증: `make release-test-matrix`가 일곱 계층 전체를 통과했다. `make conformance-all-modes`는 TypeScript, Go, Rust, PHP의 canonical case 211개를 AST와 generated로 실행한 core cell 1,688개 전체를 통과했고 PHP 확장은 case 211개와 package test 236개를 통과했다. Generated runner는 AST fallback 없이 compile·입력·위치 runtime 진단 또는 정확한 UTF-8 출력을 비교했다. 변경 불가능한 npm, Go module, Cargo, Composer 소비자가 AST/generated 출력을 일치시켰고 browser와 5개 시나리오 정적 showcase가 통과했다. 21표본 benchmark는 정확한 출력 검증 뒤 compile, cold process, 전체 render, prepared render, RSS를 기록했다. `make docs-check`는 문서 쌍 34개, AST 파일 189개, 표현식 AST 53개, 공개 심볼·파일 문서화 332개를 통과했고 명세 규칙 254개 모두 기계적으로 검사되는 근거를 갖는다. 발행된 package는 없다.
