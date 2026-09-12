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
| performance-measurements | 출력이 같은 AST와 generated의 compile, process, render, RSS 측정값 | implemented | passed | not-deployed | [성능 측정](operations/benchmark.ko.md) |
| showcase | 공통 템플릿·목업 JSON assign·직접 경로 대응 define 레지스트리·하나의 커밋 canonical AST graph·parser 기반 구문 강조·크기가 제한된 artifact 보기·처리량 결과를 제공하는 예제 사이트 | implemented | passed | not-deployed | [예제 사이트](operations/showcase.ko.md) |
| generated-mode | 정규 AST에서 직접 생성한 TypeScript·Go·Rust·PHP 호스트 언어 렌더러 | implemented | passed | not-deployed | [compiler 계약](spec/compiler.ko.md) |
| docs-check | 문서 링크, 번역 쌍, 코드 블록, 상태 검사 | implemented | passed | not-deployed | [문서 절차](operations/documentation.ko.md) |

2026-09-12 검증: `make conformance-all-modes`가 TypeScript, Go, Rust, PHP의 canonical case 211개를 AST와 generated로 실행한 core cell 1,688개 전체를 통과했다. Generated runner는 host language artifact를 compile·실행하고 AST fallback 없이 compile·입력·위치 runtime 진단 또는 정확한 UTF-8 출력을 비교한다. `make consumer-check`는 npm, Go module, Cargo, Composer의 변경 불가능한 package artifact를 격리된 임시 프로젝트에 설치하고 AST/generated 출력을 비교했다. `make showcase-check`는 5개 구현의 시나리오 5개, parser 기반 하이라이트, 크기가 제한된 source 보기, React island markup, 실패 복구를 통과했다. `make bench`는 출력이 같은 compile, cold process, 전체 render, prepared render, RSS 독립 표본 21개를 기록했다. `make docs-check`는 문서 쌍 32개, AST 파일 189개, 표현식 AST 53개, 공개 심볼·파일 문서화 332개를 통과했다. 발행된 package는 없다.
