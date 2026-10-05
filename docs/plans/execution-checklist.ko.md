# 실행 체크리스트

## Wave 0 — 저장소 기반 (순차)

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T0.1 | 저장소 초기화와 툴체인 고정 | `.gitignore`, `.node-version` (26.8.1), `rust-toolchain.toml` (1.98.1, rustfmt, clippy), `.editorconfig` | 커밋 후 `git status` 비어 있음; `node --version` 일치 | [o] |
| T0.2 | 개발 규칙 | `AGENTS.md`, `AGENTS.ko.md`: 영어·한국어 문서 쌍, 계약은 `docs/spec/`, 상태는 `docs/features.md`, 절차는 `docs/operations/`, 변경은 `CHANGELOG.md`, 가장 단순한 구현, 멱등한 명령, 코드·테스트 분리, 실패 테스트 후 수정 절차, 문체(동작 이름 직접 사용, 주체와 대상 명시, 원인은 한 문장, 비유 금지) | `make docs-check` | [o] |
| T0.3 | 최상위 문서 | `README.md`(.ko), `CHANGELOG.md`(.ko), `docs/index.md`(.ko), `docs/features.md`(.ko). 모든 기능 행은 `not-started`/`pending`/`not-deployed`와 근거 링크 | `make docs-check` | [o] |
| T0.4 | 워크스페이스와 Makefile | `package.json` (workspaces `packages/*`, 스크립트 `lint`, `test`, `docs:check`), `Makefile` 타겟 `help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php conformance parity test-browser ext test-ext schema-check docs-check docs docs-verify-idempotent bench bench-ts bench-php bench-go bench-rust clean`; 패키지가 아직 없는 타겟은 `not implemented` 한 줄을 출력하고 1로 종료 | `make help` | [o] |
| T0.5 | 문서 검사기 | `scripts/check-documents.mjs`: 영어·한국어 쌍 필수, 상대 링크 해석, 두 언어의 코드 블록 동일, 기능 상태 필드 유효 | `node scripts/check-documents.mjs` | [o] |
| T0.6 | 이 체크리스트 | `docs/plans/execution-checklist.md`(.ko) | `make docs-check` | [o] |
| T0.7 | 운영 문서 | `docs/operations/development.md`(.ko): 툴체인 설치, `make` 타겟, 커밋 절차; `docs/operations/documentation.md`(.ko): 문서 규칙과 검사기 | `make docs-check` | [o] |

## Wave 1 — 명세 (병렬)

| ID | 작업 | 산출물 | 내용 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T1.1 | 렉시컬 명세 | `docs/spec/lexical.md`(.ko) | UTF-8과 BOM 처리; 줄 구분자; 태그 시작 규칙(`{` 뒤에 수평 공백과 기호, 또는 `{:` 뒤에 식별자와 대입 연산자); 그 외는 텍스트; 태그가 시작될 자리에서만 읽히는 이스케이프 `\{`; 주석 `{* *}`; 문자열 리터럴 밖·표현식 깊이 0의 닫는 구분자로 태그 종료; echo 이외 태그의 standalone 줄 제거 규칙; 텍스트로 남는 JavaScript와 CSS 중괄호 예시 | `make docs-check`, `node tests/runner/delimiter-matrix.mjs` | [o] |
| T1.2 | 태그 문법 | `docs/spec/grammar.md`(.ko) | echo, loop, if, elseif, else, close, include, block, if-block, 대입의 EBNF; 블록 중첩과 닫기 규칙; 루프 안 `{:}`는 빈 분기; 규칙별 오류 조건; bare 경로와 따옴표 경로 토큰 정의; 블록 태그 토큰 순서(선택 id, 선택 경로, `name` 또는 `name:postfix` 형태의 scope 항목) | `make docs-check` | [o] |
| T1.3 | 표현식 명세 | `docs/spec/expressions.md`(.ko) | 토큰 표; EBNF; 우선순위 표(파이프, 삼항과 엘비스, 말미 축약을 포함한 병합, or, and, 동등, 비교와 `in`, 덧셈, 곱셈, 단항, postfix); 경로 접근과 조회 규칙; 전용 노드로 해석되는 루프 메타 `name.index_ key_ value_ last_ first_ size_`; `+` 규칙(한쪽이 문자열이면 결합, 아니면 숫자 덧셈); 그 외 산술은 숫자 전용; 동등, 엄격 동등, 순서, 진릿값; `=>`와 spread를 포함한 list·map 리터럴 | `make docs-check` | [o] |
| T1.4 | 데이터 모델 | `docs/spec/data-model.md`(.ko) | 값 타입; 안전 정수 범위를 가진 IEEE 754 double 숫자; 문자열→숫자 변환 문법; ECMAScript `Number::toString`과 동일한 숫자→문자열 규칙과 언어별 구성 방법; bool과 null 출력; 순서 있는 map; JSON, JavaScript, PHP, Go, Rust 바인딩 표; 거부 코드 | `make docs-check` | [o] |
| T1.5 | 함수 | `docs/spec/functions.md`(.ko) | 모든 내장 함수의 시그니처, 인자 수, 의미, 오류 경우; 파이프 변환; `number` 십진 반올림 규칙; `json` 이스케이프 규칙; `date` 토큰 표와 시간대 규칙; 환경에서 오는 `now`; 호스트 등록 계약; `raw`와 `json`의 safe 값 규칙 | `make docs-check` | [o] |
| T1.6 | 런타임 | `docs/spec/runtime.md`(.ko) | 4개 언어의 엔진 API; 렌더 호출 형태(템플릿 이름 또는 AST, assign 데이터, define map, 환경); 파일 단위 평탄한 로컬 스코프; 루프 변수 바인딩과 복원; 스코프를 공유하는 include; 격리 컨텍스트(assign 루트, define 데이터, scope 인자)의 템플릿 define; define 항목(문자열 경로, 선택 `data`를 가진 `template`, 또는 `html`); 레이아웃 target 선택; 재정의 규칙; 로더 인터페이스와 이름 해석; strict와 lenient 모드; 제한(반복, 깊이, 출력 크기, 표현식 깊이); 출력 이스케이프; 브라우저용 assign 데이터의 HTML 임베딩 | `make docs-check` | [o] |
| T1.7 | AST 스키마 | `docs/spec/ast.md`(.ko), `schema/ast.schema.json`, `schema/README.md`(.ko) | 필드와 `span` 바이트 오프셋을 가진 노드 목록; 파이프·복합 대입·증감의 변환; 직렬화 규칙(숫자 리터럴은 JSON 숫자, 문자열 리터럴은 해석된 값); 모든 노드를 다루는 JSON Schema draft-07 | `node scripts/check-schema.mjs` (스키마 자체 검증) | [o] |
| T1.8 | 오류 | `docs/spec/errors.md`(.ko) | 오류 객체 필드; 단계별(lex, parse, load, data, runtime) 전체 코드 목록; 적합성 검사가 비교하는 필드; 코드별 모드 동작 | `make docs-check` | [o] |
| T1.9 | 적합성 | `docs/spec/conformance.md`(.ko) | 픽스처 디렉터리 구조와 파일 역할; CLI 계약(`parse FILE`, `render FILE --data --define --env --root`, 종료 코드, stdout/stderr); 비교 규칙(AST 구조, HTML 바이트, 오류 필드); 러너 옵션; 표현식 픽스처 형식(토큰, AST, 값) | `make docs-check` | [o] |
| T1.10 | 예제 | `docs/spec/examples.md`(.ko) | 페이지 하나 전체: 레이아웃, 헤더 파셜, scope 인자를 가진 푸터 define, 루프 메타를 쓰는 목록, 카드 define, assign 데이터 파일, define 파일, 기대 출력, AST 발췌 | `make docs-check` | [o] |
| T1.11 | 명세 검토 (순차) | `docs/spec/*` 전반 수정 | 용어 일관성; 본문에 쓰인 모든 오류 코드가 `errors.md`에 존재; `expressions.md`/`examples.md`의 모든 함수가 `functions.md`에 존재; 모든 규칙에 ID; 두 언어가 같은 정보 | `make docs-check`; `CHANGELOG.md`에 검토 기록 | [o] |

## Wave 2 — 적합성 자산 (병렬)

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T2.1 | 러너 드라이버 | `tests/runner/drivers.mjs`: 언어별 명령, 빌드 명령, 작업 디렉터리, 바이너리 경로 | `node tests/runner/conformance.mjs --list` | [o] |
| T2.2 | 적합성 러너 | `tests/runner/conformance.mjs`: 케이스 열거, 타임아웃이 있는 언어별 호출, AST 구조 diff, HTML 바이트 비교, 오류 필드 비교, 옵션 `--langs`, `--case`, `--list`, `--update`, 표 출력, 실패 시 0이 아닌 종료 | `node tests/runner/conformance.mjs --list` | [o] |
| T2.3 | 일치 러너 | `tests/runner/parity.mjs`: 기대 파일 없이 언어 간 출력 비교, 클라이언트/서버 축 보고 | `node tests/runner/parity.mjs --help` | [o] |
| T2.4 | 스키마 검사기 | `scripts/check-schema.mjs`: ajv로 `schema/ast.schema.json`을 검증하고 모든 `tests/cases/**/expected.ast.json`을 스키마로 검증 | `node scripts/check-schema.mjs` | [o] |
| T2.5 | 픽스처: text | `tests/cases/text/`: 일반 텍스트, 텍스트로 남는 중괄호(`{ debug: true }`, `{}`, `${x}`, `{a:1}`, `{` 뒤 개행), 태그 위치의 이스케이프, 그 외 위치의 이스케이프, 주석 제거, 여러 줄 주석, BOM 제거, CRLF 입력. 4건 AST 수기 | `node scripts/check-schema.mjs` | [o] |
| T2.6 | 픽스처: echo | `tests/cases/echo/`: 경로, 중첩 경로, 숫자 인덱스, 없는 키, 5문자 HTML 이스케이프, `raw`, 숫자 포맷 경계, bool과 null 출력, list 출력 오류. 3건 AST 수기 | `node scripts/check-schema.mjs` | [o] |
| T2.7 | 픽스처: if | `tests/cases/if/`: 기본, elseif 체인, else, 중첩, 진릿값 표(`"0"`, 빈 list, 빈 map, `null`), 블록 밖 else 오류, 중복 else 오류 | `node scripts/check-schema.mjs` | [o] |
| T2.8 | 픽스처: loop | `tests/cases/loop/`: list, map 순서, 루프 메타 필드, 두 메타를 쓰는 중첩 루프, 빈 분기, null 반복 대상, 루프 뒤 변수 복원, 루프 안 elseif 오류, 알 수 없는 루프 메타 오류 | `node scripts/check-schema.mjs` | [o] |
| T2.9 | 픽스처: include와 block | `tests/cases/include/`, `tests/cases/block/`: 로컬을 공유하는 include, include 순환 오류, 레지스트리 블록, 경로와 등록을 가진 블록, scope 인자(`name`과 `name:value`)를 가진 블록, 블록의 로컬 격리, `html` 레지스트리 항목, 미정의 블록 오류, 재정의 오류, if-block 참과 거짓, `../`가 있는 bare 경로, 루트 밖 경로 오류 | `node scripts/check-schema.mjs` | [o] |
| T2.10 | 픽스처: 표현식 | `tests/cases/expr/`: 우선순위, 숫자 `+`, 한쪽이 문자열인 `+`, list `+` 오류, 0 나눗셈 오류, 나머지, 삼항, 엘비스, 말미 `??`, list·map·string의 `in`, 동등 표, 엄격 동등, 혼합 타입 순서 오류, list·map 리터럴, spread, 파이프 체인, 호출 인자 수 오류 | `node scripts/check-schema.mjs` | [o] |
| T2.11 | 픽스처: 함수 | `tests/cases/functions/`: 경계 입력을 포함해 내장 함수마다 한 케이스; `number(2.675, 2)`, `number(1.005, 2)`, `<`·`&`·U+2028을 포함한 `json`, `url` 예약 문자, `date` 토큰과 오프셋, 환경에서 오는 `now`, 알 수 없는 함수 오류 | `node scripts/check-schema.mjs` | [o] |
| T2.12 | 픽스처: 데이터 모델 | `tests/cases/data/`: 정수형 키를 포함한 map 키 순서, `0.1+0.2`, `1e21`, `1e-7`, `-0`, 안전 정수 경계 거부, 아스트랄 문자 길이와 순서, 코드포인트 비교, 잘못된 UTF-8 거부 | `node scripts/check-schema.mjs` | [o] |
| T2.13 | 픽스처: 공백 | `tests/cases/whitespace/`: standalone 태그 줄, 한 줄의 여러 닫기, standalone이 아닌 echo, 루프 안 들여쓰기, 주석만 있는 줄, 줄을 유지하는 인라인 태그 | `node scripts/check-schema.mjs` | [o] |
| T2.14 | 픽스처: 오류 | `tests/cases/errors/`: 미종료 태그, 미종료 문자열, 미종료 주석, 예상치 못한 토큰, 예상치 못한 닫기, 닫히지 않은 블록, 예약어 대입, 잘못된 이스케이프, 잘못된 숫자; 각각 `expected.error.json` | `node scripts/check-schema.mjs` | [o] |
| T2.15 | 표현식 픽스처 | `tests/fixtures/expr/cases.json` (30건: 토큰, AST, 평가 값)과 `tests/fixtures/expr/README.md`(.ko) | `node scripts/check-schema.mjs` | [o] |
| T2.16 | 규칙 커버리지 검사기 | `scripts/check-rules.mjs`: 모든 `case.json` 규칙이 `docs/spec`에 존재, 다루지 않은 규칙 보고; `check`에 포함되는 Makefile 타겟 `rules-check` | `node scripts/check-rules.mjs` | [o] |
| T2.17 | 픽스처: 래퍼 태그 | `tests/cases/wrapper/`: 따옴표·주석·HTML 주석 래퍼, 래퍼 없는 `&#123;&#123;`는 텍스트, `"{= x}"`는 따옴표 유지, 래퍼 닫기 누락 오류, standalone 줄의 래퍼 태그 | `node scripts/check-schema.mjs` | [o] |
| T2.18 | 픽스처: 구분자 | `tests/cases/delimiters/`: `options.json` 구분자, 파일 지시문, 옵션을 덮는 지시문, 문법이 쓰는 닫는 구분자(`[= a[0]]`), 첫 태그가 아닌 지시문 오류, 잘못된 구분자 문자 오류, 사용자 여는 구분자의 이스케이프 | `node scripts/check-schema.mjs` | [o] |

## Wave 3 — TypeScript 구현

| ID | 작업 | 산출물 | 테스트 | 검증 | 의존 | 완료 |
| --- | --- | --- | --- | --- | --- | --- |
| T3.1 | 패키지 골격 | `package.json` (tsup 빌드: esm, cjs, dts, neutral 플랫폼; exports `.`, `./render`, `./node`), `tsconfig.json` (`lib: ["ES2020"]`, `types: []`), `vitest.config.ts`, 루트 `eslint.config.mjs` | `tests/smoke.test.ts` | `npm run build -w @polyspec/template` | — | [o] |
| T3.2 `parallel` | 값 모델 | `src/value/value.ts` (타입, 진릿값, 동등, 순서), `src/value/number.ts` (숫자 변환, ECMAScript 문자열화), `src/value/bind.ts` (호스트 입력 변환) | `tests/value/*.test.ts` | `npm test -w @polyspec/template` | T3.1 | [o] |
| T3.3 `parallel` | 오류 | `src/errors.ts` (오류 클래스, 코드, 위치) | `tests/errors.test.ts` | 동일 | T3.1 | [o] |
| T3.4 `parallel` | 이스케이프와 출력 | `src/escape.ts`, `src/output.ts` (크기 제한이 있는 빌더, safe 값) | `tests/escape.test.ts` | 동일 | T3.1 | [o] |
| T3.5 | 템플릿 렉서 | `src/lexer/template.ts` (텍스트, 태그 시작 규칙, 이스케이프, 주석, 문자열을 고려한 태그 본문 추출, 위치) | `tests/lexer/template.test.ts` | 동일 | T3.3 | [o] |
| T3.6 `parallel` | 표현식 렉서와 파서 | `src/expr/lexer.ts`, `src/expr/parser.ts`, `src/expr/ast.ts` | `tests/expr/lexer.test.ts`, `tests/expr/parser.test.ts`, `tests/expr/fixtures.test.ts` (`tests/fixtures/expr/cases.json` 로드) | 동일 | T3.3 | [o] |
| T3.7 | 템플릿 파서 | `src/parser/parser.ts` (태그, 블록 스택, else와 빈 분기), `src/parser/standalone.ts` (줄 제거), `src/parser/block-tag.ts` (id, 경로, scope 항목), `src/ast.ts` (노드 타입, JSON 직렬화) | `tests/parser/*.test.ts`, `tests/ast-schema.test.ts` (파싱한 모든 픽스처가 `schema/ast.schema.json` 검증 통과) | 동일 | T3.5, T3.6 | [o] |
| T3.8 | 내장 함수 | `src/functions/index.ts`, 그룹별 파일(`string.ts`, `collection.ts`, `number.ts`, `encoding.ts`, `date.ts`) | `tests/functions/*.test.ts` | 동일 | T3.2, T3.4 | [o] |
| T3.9 `parallel` | 로더 | `src/loader.ts` (인터페이스, `MapLoader`, 이름 해석, 루트 검사), `src/node/loader.ts` (`FsLoader`) | `tests/loader.test.ts` | 동일 | T3.3 | [o] |
| T3.10 | 렌더러 | `src/render/engine.ts` (엔진, 템플릿 define 등록, 이름과 버전 기준 캐시), `src/render/context.ts` (프레임, 루프 메타, 템플릿 define 레지스트리, 제한, 모드), `src/render/statements.ts`, `src/render/expressions.ts` | `tests/render/*.test.ts` | 동일 | T3.7, T3.8, T3.9 | [o] |
| T3.11 | CLI | CLI 계약을 구현하는 `bin/template.mjs` | `tests/cli.test.ts` | `node packages/template-ts/bin/template.mjs parse tests/cases/text/plain/input.tpl` | T3.10 | [o] |
| T3.12 | 인프로세스 적합성 | `tests/cases`의 모든 케이스를 실행하는 `tests/conformance.test.ts` | 동일 | `npm test -w @polyspec/template`; `node tests/runner/conformance.mjs --langs ts` | T3.11 | [o] |
| T3.13 | 나머지 AST 생성과 검토 | AST가 없는 픽스처의 `expected.ast.json`을 `node tests/runner/conformance.mjs --langs ts --update ast`로 생성하고 케이스마다 검토 | — | `node scripts/check-schema.mjs` | T3.12 | [o] |
| T3.14 | 브라우저 빌드 검사 | `tests/browser/index.html`, `tests/browser/render.spec.ts`, `playwright.config.ts`; 페이지가 `dist/index.mjs`를 로드해 케이스 10건을 렌더 | Playwright | `make test-browser` | T3.11 | [o] |
| T3.15 | 픽스처 확장 | T3.12–T3.14에서 발견한 모든 결함에 대한 케이스 추가 | — | `node tests/runner/conformance.mjs --langs ts` | T3.12 | [o] |
| T3.16 | 패키지 문서 | `packages/template-ts/README.md`(.ko): API, CLI, 브라우저 사용법 | — | `make docs-check` | T3.11 | [o] |

## Wave 4 — Go, Rust, PHP 구현 (병렬 트랙 3개)

### 트랙 G — Go (`packages/template-go`, 모듈 `github.com/polyspec/template`)

| ID | 작업 | 산출물 | 테스트 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T4.G.1 | 모듈 골격 | `go.mod` (go 1.27.1, 의존성 없음), `README.md`(.ko) | — | `go vet ./...` | [o] |
| T4.G.2 | 값 모델 | `template/value/value.go`, `ordered.go` (삽입 순서 map), `number.go` (최단 왕복 자릿수로 문자열화), `bind.go` (`any`, 순서를 보존하는 JSON 디코더, 필드 순서의 구조체) | `template/value/*_test.go` (외부 테스트 패키지) | `go test ./template/value/...` | [o] |
| T4.G.3 | 오류 | `template/errors.go` | `template/errors_test.go` | `go test ./template/...` | [o] |
| T4.G.4 | 템플릿 렉서 | `template/lexer/lexer.go` | `template/lexer/lexer_test.go` | 동일 | [o] |
| T4.G.5 | 표현식 렉서와 파서 | `template/expr/lexer.go`, `parser.go`, `ast.go` | `template/expr/*_test.go`, `tests/fixtures/expr/cases.json`을 로드하는 픽스처 테스트 | 동일 | [o] |
| T4.G.6 | 템플릿 파서와 AST | `template/parser/parser.go`, `standalone.go`, `blocktag.go`, JSON 마샬링을 가진 `template/ast/ast.go` | `template/parser/*_test.go`, 스키마 검증 테스트 | 동일 | [o] |
| T4.G.7 | 함수 | 그룹별 파일 `template/functions/*.go` | `template/functions/*_test.go` | 동일 | [o] |
| T4.G.8 | 로더 | `template/loader.go` (`Loader`, `MapLoader`, `fs.FS` 위의 `FSLoader`) | `template/loader_test.go` | 동일 | [o] |
| T4.G.9 | 렌더러 | `template/render/engine.go`, `context.go`, `statements.go`, `expressions.go` | `template/render/*_test.go` | 동일 | [o] |
| T4.G.10 | CLI | `cmd/template/main.go` | `cmd/template/main_test.go` | `go build -o template ./cmd/template` | [o] |
| T4.G.11 | 적합성 | `tests/cases`를 실행하는 `template/conformance_test.go` | 동일 | `make test-go`; `node tests/runner/conformance.mjs --langs ts,go` | [o] |

### 트랙 R — Rust (`packages/template-rust`, 크레이트 `polyspec-template`)

| ID | 작업 | 산출물 | 테스트 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T4.R.1 | 크레이트 골격 | `Cargo.toml` (edition 2024, `serde`, `preserve_order`를 켠 `serde_json`), `Cargo.lock`, `README.md`(.ko), `#![deny(missing_docs)]` | — | `cargo build --locked` | [o] |
| T4.R.2 | 값 모델 | `src/value/mod.rs`, `number.rs`, `bind.rs` | `tests/value.rs` | `cargo test --locked` | [o] |
| T4.R.3 | 오류 | `src/error.rs` | `tests/error.rs` | 동일 | [o] |
| T4.R.4 | 템플릿 렉서 | `src/lexer.rs` | `tests/lexer.rs` | 동일 | [o] |
| T4.R.5 | 표현식 렉서와 파서 | `src/expr/lexer.rs`, `parser.rs`, `ast.rs` | 픽스처를 로드하는 `tests/expr.rs` | 동일 | [o] |
| T4.R.6 | 템플릿 파서와 AST | `src/parser/mod.rs`, `standalone.rs`, `block_tag.rs`, serde를 가진 `src/ast.rs` | `tests/parser.rs`, 스키마 검증 테스트 | 동일 | [o] |
| T4.R.7 | 함수 | `src/functions/*.rs` | `tests/functions.rs` | 동일 | [o] |
| T4.R.8 | 로더 | `src/loader.rs` | `tests/loader.rs` | 동일 | [o] |
| T4.R.9 | 렌더러 | `src/render/mod.rs`, `context.rs`, `statements.rs`, `expressions.rs` | `tests/render.rs` | 동일 | [o] |
| T4.R.10 | CLI | `src/bin/template.rs` | `tests/cli.rs` | `cargo build --locked --release --bin template` | [o] |
| T4.R.11 | 적합성 | `tests/conformance.rs` | 동일 | `make test-rust`; `node tests/runner/conformance.mjs --langs ts,go,rust` | [o] |

### 트랙 P — PHP (`packages/template-php`, composer `polyspec/template`)

| ID | 작업 | 산출물 | 테스트 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T4.P.1 | 패키지 골격 | `composer.json` (php ^8.2, PSR-4 `Polyspec\Template\`, phpunit), `phpunit.xml`, `pint.json`, `README.md`(.ko) | — | `composer install`; `vendor/bin/pint --test` | [o] |
| T4.P.2 | 값 모델 | `src/Value/Value.php`, `Number.php`, `Bind.php` (`array_is_list`, 키 문자열 복원, 안전 정수 검사, UTF-8 검사) | `tests/Value/*Test.php` | `vendor/bin/phpunit` | [o] |
| T4.P.3 | 오류 | `src/TemplateError.php`, `src/ErrorCode.php` | `tests/ErrorTest.php` | 동일 | [o] |
| T4.P.4 | 템플릿 렉서 | `src/Lexer/TemplateLexer.php` | `tests/Lexer/TemplateLexerTest.php` | 동일 | [o] |
| T4.P.5 | 표현식 렉서와 파서 | `src/Expr/Lexer.php`, `Parser.php`, `Node.php` | 픽스처를 로드하는 `tests/Expr/*Test.php` | 동일 | [o] |
| T4.P.6 | 템플릿 파서와 AST | `src/Parser/Parser.php`, `Standalone.php`, `BlockTag.php`, `toArray()`를 가진 `src/Ast/*.php` | `tests/Parser/*Test.php`, 스키마 검증 테스트 | 동일 | [o] |
| T4.P.7 | 함수 | `src/Functions/*.php` | `tests/Functions/*Test.php` | 동일 | [o] |
| T4.P.8 | 로더 | `src/Loader/LoaderInterface.php`, `ArrayLoader.php`, `FilesystemLoader.php` | `tests/Loader/*Test.php` | 동일 | [o] |
| T4.P.9 | 렌더러 | `src/Render/Engine.php`, `Context.php`, `Statements.php`, `Expressions.php` | `tests/Render/*Test.php` | 동일 | [o] |
| T4.P.10 | CLI | `bin/template.php` | `tests/CliTest.php` | `php bin/template.php parse ...` | [o] |
| T4.P.11 | 적합성 | `tests/ConformanceTest.php` | 동일 | `make test-php`; `node tests/runner/conformance.mjs --langs ts,go,rust,php` | [o] |

### 교차 언어 검사 (세 트랙 뒤 순차)

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T4.X.1 | 분기 0건의 일치 실행 | `node tests/runner/parity.mjs` | [o] |
| T4.X.2 | 전체 검사 | `make check` (docs-check, lint, 단위 스위트 4개, conformance) | [o] |
| T4.X.3 | 상태 갱신 | `docs/features.md`(.ko)의 `template-go`, `template-rust`, `template-php`, `conformance` 행과 근거 링크; `CHANGELOG.md`(.ko) 항목 | `make docs-check` | [o] |

## Wave 5 — PHP 확장 (순차)

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T5.1 | 툴체인 확인 | Rust PHP 바인딩이 설치된 PHP 버전(8.5)을 지원하는지 `docs/operations/development.md`(.ko)에 기록; 지원하지 않으면 T5.2–T5.6을 필요한 버전과 함께 `blocked`로 표시 | `php-config --version` | [o] |
| T5.2 | 확장 크레이트 | `packages/template-php-ext/Cargo.toml` (cdylib, Rust 크레이트 의존), `src/lib.rs` (`parse`, `render`, `register`를 가진 `Polyspec\Template\Native\Engine`), `src/convert.rs` (zval과 값의 상호 변환) | `cargo build --locked --release` | [o] |
| T5.3 | 스텁과 패키지 연결 | `stubs/polyspec_template.stub.php`; `packages/template-php`가 네이티브 엔진을 명시적으로 선택하는 방법을 문서화 | `make docs-check` | [o] |
| T5.4 | CLI와 테스트 | `bin/template-ext.php`; `php -d extension=...`로 실행하는 `tests/ExtConformanceTest.php` | `make test-ext` | [o] |
| T5.5 | Makefile 타겟 | `ext`, `test-ext`; 러너 드라이버 `php-ext` | `node tests/runner/conformance.mjs --langs php-ext` | [o] |
| T5.6 | 상태 갱신 | `docs/features.md`(.ko)의 `template-php-ext` 행; `CHANGELOG.md`(.ko) | `make docs-check` | [o] |

## Wave 6 — 벤치마크, 문서 사이트, 상태 (병렬)

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T6.1 | 성능 측정 | 언어별 AST와 generated 측정값; 측정 전 출력 동일성 검사 | `make showcase` | [o] |
| T6.2 | 문서 커버리지 검사기 | `make doc-coverage`가 실행하는 `scripts/check-doc-coverage.mjs` (4개 패키지의 공개 심볼 문서화) | `make doc-coverage` | [o] |
| T6.3 | 문서 사이트 | `docs/.vitepress/config.mts`, 검증 뒤 실행되는 정적 GitHub Pages job, 생성된 API 문서는 git 제외 | `make docs-static-check`; `make docs-verify-idempotent` | [o] |
| T6.4 | CI 워크플로 | 기존 Makefile 타겟을 호출하고 모든 필수 job 통과 뒤에만 Pages를 배포하는 `.github/workflows/ci.yml` | 워크플로 파일 lint | [o] |
| T6.5 | 발행 절차 | `docs/operations/publication.md`(.ko): Go, npm, composer 패키지의 로컬 불변 발행 | `make docs-check` | [o] |
| T6.7 | 실행 가능한 예제 사이트 | `examples/site/` 시나리오와 정적 페이지; `tools/showcase/build.mjs`; AST/generated program 일치성, 반복 렌더, 동일 조건 모드 벤치마크 JSON 결과물 | `make showcase`; `make showcase-check` | [o] |
| T6.6 | 최종 상태 | 테스트 리비전을 기록한 `docs/features.md`(.ko); `CHANGELOG.md`(.ko) | `make check` | [o] |

## Wave 7 — generated compiler 완성과 패키지 설치 검증

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T7.1 | compiler/runtime manifest 하나, 생성 선언부, 소유 관계와 지원 수준 도표를 정의하고 TypeScript·Go·Rust·PHP 구조 이탈을 거부 | `make compiler-interface-check`; `make runtime-interface-check` | [o] |
| T7.2 | generated callback과 showcase 전용 생성을 하나의 compiler pipeline과 네 host backend로 교체하고 호환 옵션과 fallback 경로 제거 | package test; compiler mutation test | [o] |
| T7.3 | 모든 명세 node, expression, 내장 함수와 host 함수를 generated 실행에서 지원 | generated compiler test | [o] |
| T7.4 | 모든 정규 케이스(작업 완료 시 216개, 2026-10-02에 244개)를 TypeScript·Go·Rust·PHP의 AST와 generated 실행으로 검증 | `make conformance-all-modes` | [o] |
| T7.5 | build 경계 artifact 갱신 검증: `dev`는 항상 재생성, `true`는 digest 변경 시 재생성, `false`는 source를 읽지 않음 | artifact lifecycle test | [o] |
| T7.6 | npm·Go·Cargo·Composer artifact를 격리한 임시 프로젝트에 설치하고 같은 assign/define page 렌더 | `make install-check` | [o] |
| T7.7 | production artifact로 parser 기반 showcase 구문 강조, 크기 제한 artifact/source 보기와 React island 예제 생성 | `make showcase-check` | [o] |
| T7.8 | production artifact를 사용해 출력이 같은 AST/generated 성능 측정 재실행 | `make bench`; `make showcase` | [o] |
| T7.9 | 명세, 기능 상태, 변경 기록, 생성 Mermaid, 정적 문서와 완료 근거 동기화 | `make docs-check`; `make docs-verify-idempotent` | [o] |
| T7.10 | 상용 release test pyramid 강제: lexer/parser/IR/runtime 단위 검사, generated source compile 검사, 전체 mode matrix, 위치 오류와 실패 복구 회귀, mutation 거부, 격리 package 설치·browser 출력, 출력 동일 성능 회귀 | `make release-test-matrix` | [o] |
| T7.11 | 깨끗한 checkout의 release gate 통과와 정적 사이트 배포 | `make release-check`; CI와 Pages 성공 | [o] |

## Wave 8 — assign 인스턴스와 클래스 함수 실행

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T8.1 | host 클래스를 복제하지 않는 공통 object value 경계를 추가 | 네 언어 value·binding 테스트 | [o] |
| T8.2 | assign native 인스턴스에서 선언된 public 필드와 멤버 메서드를 조회 | 멤버 조회 테스트 | [o] |
| T8.3 | 같은 registry 계약으로 선언된 논리 클래스 함수를 조회 | 클래스 호출 테스트 | [o] |
| T8.4 | AST와 generated 프로그램에서 멤버·클래스 호출을 실행 | AST/generated 일치 테스트 | [o] |
| T8.5 | 네 언어에서 출력, arity, type, unknown-member와 throw 오류 동작을 검증 | `make generated-native-check`; 전체 native 호출 matrix | [o] |
| T8.6 | object 호출 선언과 생성 Mermaid 인터페이스 도표를 추가 | interface 검사 | [o] |
| T8.7 | native 인스턴스 assign, 필드 조회, 멤버 호출과 클래스 호출 결과를 보여주는 showcase 페이지 추가 | `make showcase-check`; 정적 HTML 검사 | [o] |
| T8.8 | 명세, 기능 상태, changelog, Pages 산출물과 완료 근거 동기화 | `make check`; `make docs-verify-idempotent`; `make docs-static-check` | [o] |

## Wave 9 — AST의 템플릿 주석

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T9.1 | TypeScript, Go, Rust, PHP parser와 PHP 확장에서 모든 주석을 값과 span과 함께 `Template.comments`에 나열(AST-9). schema 정의와 공유 case `text/comment-list`, `delimiters/comment-custom` 추가 | `make conformance`; `make check` | [o] |

## Wave 10 — 설치 검사 작업 디렉터리 제거

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T10.1 | `-modcacherw`로 만든 Go module cache를 포함해 설치 검사 작업 디렉터리를 제거하고, 제거할 수 없는 작업 디렉터리의 경로와 함께 검사를 실패시킴. `scripts/check-install-workspace.mjs`가 `make install-check`에서 실행됨 | `make install-check`; `make check` | [o] |

## Wave 11 — 에디터 언어 서비스, LSP 서버, CodeMirror 어댑터

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T11.1 | `@polyspec/template`의 `analyzePrefix()`로 첫 오류 전까지 받아들인 태그와 표현식 토큰을 돌려줌(EDT-6) | `make test-ts` | [o] |
| T11.2 | `@polyspec/template-format`을 `@polyspec/template-language`로 바꾸고, 진단, 토큰, 태그 범위, 접기 범위, 강조, 짝 태그, `format`, `lineIndentation`을 가진 `openDocument()`를 추가(EDT-4~EDT-13). 접기와 짝 태그 규칙을 VS Code 확장에서 옮기고 에디터 픽스처를 추가(EDT-17) | `make test-language` | [o] |
| T11.3 | 명령 `template-lsp`를 가진 LSP 서버 `@polyspec/template-lsp`를 추가하고(EDT-14) 프로토콜로 에디터 픽스처를 검사 | `make test-lsp` | [o] |
| T11.4 | VS Code 확장이 확장 안에 포함한 LSP 서버에 연결해 동작하도록 바꾸고, TextMate 문법, 태그 배경, 짝 태그 명령을 유지(EDT-15) | `make test-vscode`; `make test-vscode-integration` | [o] |
| T11.5 | CodeMirror 6 어댑터 `@polyspec/template-codemirror`를 추가하고(EDT-16) `EditorState`와 브라우저에서 에디터 픽스처로 검사 | `make test-codemirror` | [o] |
| T11.6 | `@polyspec/template`을 선언하거나 import하는 어댑터(EDT-2), 에디터·Node.js·DOM 모듈을 import하는 언어 서비스(EDT-3)를 거부하고, 규칙 증거, 기능 상태, 문서, 의존성 정책을 기록 | `make check` | [o] |

## Wave 12 — 콜론 앞에 식별자가 오는 삼항 연산

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T12.1 | `c ? a : b`, `c ? a : b.x`, then 쪽이 식별자로 끝나는 중첩 삼항 연산을 담은 공통 사례를 추가하고, 결함이 있는 모든 구현에서 실패하는지 확인한 뒤, 식별자 뒤에 `::`가 올 때만 클래스 호출로 파싱하도록 모든 구현을 고친다 | `make check` | [o] |

## Wave 13 — 네 가지 작업 상태

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T13.1 | `scripts/check-documents.mjs`가 네 가지 작업 상태만 받고, 일시 우회 작업은 원인과 재시도 조건을 담게 한다. 글자 x로 표시한 행에서 실패하는지 확인한다. 모든 완료 작업을 AGENTS의 완료 상태로 쓴다. AGENTS에 checklist 규칙을 적는다 | `make docs-check` | [o] |
| T13.1-1 | checklist가 작업만 담고 표시는 작업 상태로만 쓰게 한다: `scripts/check-documents.mjs`는 `docs/plans/execution-checklist.md`의 제목, 번역 link, heading, 작업 표 행이 아닌 줄과, 작업 행 마지막 칸의 시작이 아닌 곳에 있는 AGENTS의 상태 표시나 task list 표시(대괄호 안의 글자 x 또는 X)에서 예외 없이 file, 줄, 열을 적으며 실패한다. `T14.2-1` 같은 하위 항목도 작업 행으로 읽는다. checklist의 본문(소개, 의존 관계 개요, 웨이브마다 의존 관계·원인·완료 기준, 병렬 요약, 완료 정의와 그 증거)은 두 언어 모두 `docs/plans/execution-plan.md`로 옮긴다. 규칙(작업 ID 형식, 작업 행의 내용)은 상태를 정하는 AGENTS로 옮기고 범례를 지운다. W13, T13.1, T17.1, T17.1-1의 text는 상태를 말로 적는다. Cause: checklist의 범례와 text 넷이 언어마다 상태 표시 14개와 task list 표시 2개를 적었고, 표시를 세는 도구가 존재하지 않는 진행 중 작업을 보고했다. 언어마다 93줄이 작업이 아니었다. 검사기는 ID에 하위 부분이 없는 행의 마지막 칸만 검사했으므로 표시가 어디에 있는지도, 하위 항목 9개의 상태도 검사하지 않았다. Red: `tests/scripts/check-documents.test.mjs`에서 범례, 본문, 작업 text, inline code, 일시 우회 작업의 원인에 표시가 있는 fixture checklist, heading 아래 문단이 있는 fixture, 상태가 `done`인 하위 항목이 모두 `7 document pairs passed`로 검사기를 통과했다(5개 case 중 3개가 `0 !== 1`로 실패). Green: 5개 case가 통과한다. 첫 fixture는 표시 위치 16개(`docs/plans/execution-checklist.md:10:27` 등)와 줄 위치 4개로 실패하고, 문단은 7번째 줄에서 실패하며, 하위 항목은 `invalid task state for T1.2-1: done`으로 실패하고, 제목, link, heading, 작업 표로 된 checklist는 통과하며, 검사기는 이 저장소를 통과시킨다 | `node scripts/run-tests.mjs node -- tests/scripts/check-documents.test.mjs` | [o] |
| T13.1-2 | checklist의 번역 link 줄에서 `scripts/check-documents.mjs`가 실패하게 해 checklist가 heading과 작업 표만 담게 하고, 두 언어에서 그 줄을 지운다. Cause: AGENTS는 모든 문서에 `.ko.md` file이 있다고 적지만, T13.1-1은 checklist 셋째 줄의 link를 번역 link로 받았다. Red: 셋째 줄에 `[한국어](/ko/plans/execution-checklist).`가 있는 checklist를 검사기가 통과시켰으므로 `tests/scripts/check-documents.test.mjs`의 새 case `a translation link line fails with its location`이 `0 !== 1`로 실패했다. 바꾼 검사기는 그 줄을 지우기 전에 `docs/plans/execution-checklist.md:3:1`과 한국어 file의 같은 곳을 보고했다. Green: 6개 case가 통과하고, 검사기는 이 저장소를 통과시킨다 | `node scripts/run-tests.mjs node -- tests/scripts/check-documents.test.mjs` | [o] |
| T13.1-3 | 한국어 실행 계획이 checklist를 한국어 site route `/ko/plans/execution-checklist`로 link하게 하고, `docs/` 아래 문서를 바꾸는 commit 전에는 `make docs-check`와 함께 `make docs-static-check`를 실행한다. Cause: T13.1-1이 `execution-checklist.ko.md`를 상대 경로로 link했으므로 `make check`가 `docs-static-check`에서 `ko/plans/execution-plan.html: link points to a source-only or legacy route: ./execution-checklist.ko`로 실패했다. 그 commit은 site를 빌드하되 link를 검사하지 않는 `make docs-check`와 `make docs`만 실행했다. AGENTS와 `docs/operations/documentation.md`가 이 규칙과, 한국어 문서가 한국어 페이지를 route `/ko/<path>`로 link한다는 것을 적는다. 바뀐 경로에서 owner check를 고르는 일은 다음 단계로 T13.1-4에 기록한다. Red: T13.1-2의 tree에서 `make docs-static-check`가 같은 오류로 실패했다. Green: `documentation static site: 57 pages, 28 Korean locale pages passed`를 출력하고, `make docs-check`가 통과한다 | `make docs-check docs-static-check` | [o] |
| T13.1-4 | commit이 바꾸는 경로에서 owner check를 고른다: `scripts/owner-checks.json`이 경로 glob마다 그것을 소유하는 make target과 node test file을 선언하고, `make owner-check`는 바뀐 경로(commit하지 않은 변경, `PATHS`, 또는 `BASE` 이후의 경로)의 owner만 실행하며 전체 suite는 실행하지 않는다. 어떤 owner보다 먼저, 어느 규칙도 소유하지 않는 tracked 경로, 경로가 없는 glob, Makefile에 없는 target, 전체 suite target에서 각각을 적으며 실패한다. `tests/cases` 아래 변경은 그 case만의 AST와 생성 conformance인 `make conformance-cases CASES=...`를 실행한다. 모든 tracked 경로에 owner를 준다: 어떤 target도 실행하지 않던 `tests/runner/function-inventory.mjs`는 `make check`의 새 target `function-inventory-check`에서 실행한다. `.node-version`, `rust-toolchain.toml`, `.gitignore`, `.editorconfig`는 그것이 선언하는 것의 test를 얻는다. `.editorconfig`는 byte가 정확해야 하는 test file과 생성된 showcase file을 선언하고, 문서 여섯 개의 Go 예제는 space로 들여쓴다. AGENTS는 T13.1-3의 기억에 기대는 규칙 대신 `make owner-check`를 가리킨다. Red: `scripts/owner-check.mjs`와 `scripts/conformance-cases.mjs`가 없을 때 `tests/scripts/owner-check.test.mjs`의 6개 case가 실패했고 `tests/scripts/conformance-cases.test.mjs`는 load에 실패했다. `tests/scripts/editorconfig.test.mjs`는 `.editorconfig`를 어기는 줄과 file 338개를 나열했다(문서 여섯 개와 생성된 site의 tab 들여쓰기, 생성된 Go file 다섯 개의 space 들여쓰기, case file 다섯 개의 encoding, 줄 끝, 마지막 newline, 끝 공백). `.node-version`을 25.0.0으로 두면 `.node-version 25.0.0 differs from the major version of engines.node >=26`으로, `.gitignore`에서 `packages/template-ts/dist.inputs`를 빼면 `outputs that .gitignore does not ignore: packages/template-ts/dist.inputs`로 실패했다. Green: test가 통과한다. docs 경로는 정확히 `docs-check`와 `docs-static-check`를 실행하고, owner가 없는 tracked 경로와 새 경로는 어떤 target보다 먼저 그 이름과 함께 실패하며, 경로가 없는 glob과 target `check`는 실패하고, variable이 있는 규칙은 경로를 넘기며, `scripts/owner-checks.json`은 모든 tracked 경로를 소유한다. 이 변경의 `make owner-check`가 고른 owner를 실행하고 통과했다 | `node scripts/run-tests.mjs node -- tests/scripts/owner-check.test.mjs tests/scripts/conformance-cases.test.mjs tests/scripts/toolchain-files.test.mjs tests/scripts/ignored-files.test.mjs tests/scripts/editorconfig.test.mjs` | [o] |
| T13.1-4-1 | `make owner-check`가 어느 규칙도 소유하지 않는 지워진 경로에서는 아무것도 고르지 않고, 바뀐 경로 자신인 test는 그 경로가 있을 때만 실행하게 한다. Cause: T18.8-1에서 `scripts/build-ts.mjs`와 `tests/scripts/build-ts.test.mjs`의 이름을 바꾸자 owner check가 `scripts/build-ts.mjs: the path matches no owner`로 실패하고 지워진 test file을 골랐다. Red: T13.1-4의 script로는 새 case `a removed path that no rule owns selects nothing`와 `a removed test file is not run`이 실패했다. Green: `tests/scripts/owner-check.test.mjs`의 8개 case가 통과한다 | `node scripts/run-tests.mjs node -- tests/scripts/owner-check.test.mjs` | [o] |

## Wave 14 — Data binding 비용

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T14.1 | host binding의 문자열, map key, define id를 `mb_check_encoding`으로 검사하고, 위치를 보고하는 곳은 `Utf8::firstInvalid`를 유지한다. 모든 1 byte와 2 byte 배열, 경계의 3 byte와 4 byte 배열에서 두 검사를 비교하는 test를 더한다 | `make check` | [o] |
| T14.2 | 여러 render에서 data를 한 번 binding한다(VAL-22, RT-4, RT-24, RT-61, ERR-14). TypeScript, browser entry, Go, Rust, PHP, PHP extension에 `bind`와 `merge`를 가진 bound map type을 둔다. `tools/compiler/interface.json`은 새 `php-extension`과 `javascript-esm` mapping을 포함한 모든 구현의 type과 이름을 적고, 각 구현이 bound map을 `render`와 `prepare`에 넘기는 연산이나 parameter type도 적는다. interface check는 그 type의 다른 public 연산에서 실패한다. TypeScript build는 bound map class를 가진 runtime module 하나를 모든 entry와 두 module format이 공유하게 한다. 지금은 tsup의 CommonJS build가 chunk를 나누지 않아 `index.cjs`와 `render.cjs`가 각자 runtime 사본을 가진다. TypeScript와 Rust의 `bind`처럼 bound map 연산의 이름을 이미 가진 export는 이름을 바꾸거나 없애고, backend와 generated program을 다시 만든다. `render`와 `prepare`는 generated program과 PHP extension에서도 bound `assign`과 bound 정의 `data`를 다시 binding하지 않고 받고, typed program은 그것을 record로 변환한다(RT-68). 다른 위치에 있거나 다른 구현이 만든 bound map은 host binding이 E_DATA_UNSUPPORTED_TYPE으로 실패시킨다. `tests/rule-evidence.json`에 VAL-22와 ERR-14 group을 두고 모든 구현의 test와 merge 순서, 거부하는 위치, byte 동일성의 공통 fixture를 둔다. `bound-data` feature를 implemented로 바꾸고, guide에 `bind`와 `merge`를 보이고, changelog를 쓴다. 진행: TypeScript, browser entry, Go, Rust, PHP, PHP extension과 generated program 네 개에 구현했고, `tools/compiler/interface.json`과 그 검사, `bound-data` evidence group을 더했다. 모든 runtime의 T14.2 test, `scripts/check-generated-bound-data.mjs`, mutation을 포함한 compiler interface 검사, `scripts/check-rules.mjs`가 통과한다. 남은 것: `make check` | `make check` | [o] |
| T14.2-1 | Rust 요청의 binding 입력을 struct로 이름 붙인다: T14.2는 `prepare_request`의 closure에서 root, 정의 registry, 환경의 tuple을 돌려줬고, `cargo clippy -D warnings`가 이를 `type_complexity`로 거부했다(main T15.3에서 exit 101). `BoundRequest`가 세 field에 이름을 붙이고, clippy와 bound map test가 통과한다 | `cargo clippy --all-targets -- -D warnings` | [o] |
| T14.2-2 | TypeScript package의 CommonJS 파일을 build의 출력 directory에 쓴다: T14.2는 `dist/<entry>.cjs`를 작업 directory 기준으로 썼으므로, `--out-dir`를 쓴 package build가 `ENOENT: dist/index.cjs`로 실패했다. `onSuccess`는 `--out-dir`, 없으면 `dist`에 쓰고, `--out-dir`이 있을 때와 없을 때 `tsup`이 그곳에 `index.cjs`, `render.cjs`, `node.cjs`를 쓴다 | `npx tsup --out-dir <dir>` | [o] |

## Wave 15 — runtime마다 다른 binding 오류

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T15.1 | `assign`이 JSON `null`이고 빈 map으로 렌더하는 conformance case를 더한다. Rust에서 실패하는지 확인한다. Rust `render`, `render_values`, `prepare`와, `render_values`와 `render`로 렌더하는 PHP extension의 `render`가 null `assign`을 빈 map으로 받게 한다(`bind_map`, `php_to_map`). RT-4에 규칙을 적는다 | `make check` | [o] |
| T15.1-1 | generated TypeScript와 PHP program이 AST program처럼 null `assign`을 빈 map으로 binding하게 한다(RT-4). 네 generated conformance runner의 `--case`가 case를 고르고, 아무 case도 고르지 못하면 실패하게 한다. runner는 위치 인자 filter만 읽었으므로 `--case data/null-assign`이 case 0개를 실행하고 통과했다 | `make check` | [o] |
| T15.2 | `assign`과 정의 `data`가 선언한 type과 맞지 않는 request를 렌더하는 test를 모든 generated runtime에 더한다. runtime마다 보고가 다른지 확인한다. 모든 runtime이 ERR-13대로, 그대로 전달되고 ERR-1 오류가 아닌 자기 언어의 인자 오류로 보고하게 한다 | `make check` | [o] |
| T15.2-1 | `scripts/check-typed-generator.mjs`의 Rust 부분이 T15.2 이후 `Program::render`가 돌려주는 `RequestError`를 읽게 한다. 생성한 test가 `Result<String, TemplateError>`를 선언했으므로 `make check`에 포함된 `typed-generator-compile-check`가 E0308로 compile에 실패했다 | `node scripts/check-typed-generator.mjs` | [o] |
| T15.3 | 구분자 쌍이 아닌 구분자 옵션으로 Rust engine을 만들고 Rust에서 parse하는 test와 PHP extension의 같은 test를 추가한다. Rust `AstProgram::new`가 panic하고, Rust `parse`가 ERR-1 오류를 돌려주고, extension이 `\Exception`을 던지는지 확인한다. ERR-13의 인자 오류로 보고하게 한다: `AstProgram::new`는 `Result<AstProgram, ArgumentError>`를, `parse`는 `RequestError::Argument`를 돌려주고, extension은 PHP package처럼 `\InvalidArgumentException`을 던진다 | `cargo test --test delimiters`, `run-tests.sh --filter Delimiters` | [o] |
| T15.3-1 | `NewAstProgram`처럼 Go `Parse`도 구분자 쌍이 아닌 구분자 옵션에 Go의 인자 오류를 돌려주게 한다. `delimitersOf`는 ERR-1 오류인 E_DATA_UNSUPPORTED_TYPE의 `*errs.Error`를 돌려줬지만, ERR-13은 `*errs.Error`가 아닌 `error`를 요구한다. 먼저 실패하는 Go test를 더하고, `Parse`를 고치고, ERR-13에 Go의 형태를 적는다 | `TestInvalidDelimiterIsArgumentError` | [o] |
| T15.4 | TypeScript generated program처럼 Go typed generated program이 없는 optional field를 null로 읽게 한다. Go backend는 optional field를 `valueOrZero`로 읽으므로, assign 데이터에 없는 `string?` field `c`에 대해 `{= c ?? '-'}`가 `-`가 아니라 빈 문자열을 렌더한다. 모든 generated runtime에 case를 더하고 Go에서 실패하는지 확인한 뒤 backend를 고친다 | `make check` | [o] |

## Wave 16 — 동시 render

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T16.1 | 모든 runtime의 render가 하나의 program을 공유할 수 있는지 정하고 runtime 명세에 규칙을 적는다. 공유할 수 있으면 Go에서 한 program을 동시에 렌더하는 race test를 더하고 모든 runtime의 template cache를 그에 맞게 안전하게 한다. 공유할 수 없으면 호스트가 thread나 goroutine마다 program 하나를 쓴다고 적는다 | `make check` | [o] |

## Wave 17 — test 실행

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T17.1 | 진행 중인 작업은 변경을 소유한 Red와 Green test만 실행하고, 커밋 전에는 `make docs-check`도 실행하며, 작업은 소유 명령이 통과한 뒤 완료가 되고, `make check`는 활성 작업이 모두 끝났을 때 한 번 실행한다고 AGENTS에 적는다. 모든 test가 진행을 출력하고 자기 timeout을 가지며 실행 전체에는 시간 제한이 없다고 적는다. Verification 열에 소유 명령을 적는다. `AGENTS.ko.md`에 "결정과 수용 규칙" 절을 더한다 | `make docs-check` | [o] |
| T17.2 | node, vitest, go, cargo, phpunit용 test runner `scripts/run-tests.mjs`와 `scripts/test-progress/`를 더한다. runner는 각 test를 경과 시간과 함께 출력하고 test를 자기 timeout에서 멈추며, 그 test는 `tests/scripts/run-tests.test.mjs`에 둔다. `test-go`, `test-rust`, `test-php`를 runner로 실행하고, `test-go`의 package 120 s 제한을 없애고, PHPUnit 시간 제한을 강제한다 | `node scripts/run-tests.mjs node -- tests/scripts/run-tests.test.mjs` | [o] |
| T17.3 | `tests/runner/conformance.mjs`가 한 언어에서 case가 끝날 때마다 `<case> [<lang>] pass\|fail (<ms>)`을 출력하게 하고, 요약은 끝에 그대로 둔다 | `node scripts/run-tests.mjs node -- tests/scripts/conformance-progress.test.mjs` | [o] |
| T17.4 | 네 generated conformance runner의 모든 case에 자기 deadline과 경과 시간이 붙은 결과 줄을 준다. Go와 Rust는 `scripts/run-tests.mjs`로 실행하고 Rust test 이름은 case id로 짓는다. PHP는 `php -l`과 case process에 timeout을 둔다. TypeScript는 `tsc`에 deadline과 단계 줄을 두고 각 render를 timeout이 있는 worker에서 실행한다. 600 s 제한을 없앤다 | `node scripts/run-tests.mjs node --timeout 300 -- tests/scripts/generated-conformance.test.mjs` | [o] |
| T17.4-1 | `tests/runner/conformance-generated-ts.mjs`의 `tsc` 단계 deadline 300 s를 없앤다. 시작 줄, 실행 중 줄, 경과 시간이 붙은 결과 줄은 유지하고, `tsc`의 exit code로 판단하며, 각 render의 30 s deadline은 유지한다 | `node scripts/run-tests.mjs node --timeout 300 -- tests/scripts/generated-conformance.test.mjs` | [o] |
| T17.5 | `packages/template-vscode/tests/integration/run.mjs`의 모든 VS Code 실행과 profile 설치에 넘으면 process를 kill하는 deadline을 두고, `suite/index.cjs`의 모든 check에 `Promise.race`로 timeout을 걸고 `ok`와 `not ok` 줄에 경과 시간을 붙인다 | `npm run test:integration -w polyspec-template` | [o] |
| T17.5-1 | VS Code 실행을 suite 결과로 끝낸다. VS Code 1.138은 suite가 결과를 출력한 뒤 종료하는 데 300 s를 넘기기도 했으므로 `make check`가 실행 deadline에서 실패했다. suite 줄 `[suite] N of M checks passed`가 나오면 VS Code는 20 s 안에 종료해야 하고, 그 뒤 process group을 kill하고 실행은 suite 결과를 따른다. 20 s는 suite 결과가 출력된 뒤에 시작하므로 VS Code를 끝내는 정리이며 실행의 통과 여부를 정하지 않는다 | `npm run test:integration -w polyspec-template` | [o] |
| T17.5-2 | `packages/template-vscode/tests/integration/run.mjs`의 profile 설치 deadline(120 s)과 VS Code 실행 deadline(300 s)을 없앤다. download, 각 설치, 각 실행의 시작, 단계가 도는 동안 10 s마다 한 줄, 결과를 경과 시간과 함께 출력하고, 각 단계를 exit code와 suite 결과로 판단한다. check timeout 20 s와 suite 결과 뒤 종료 유예 20 s는 유지한다 | `node scripts/run-tests.mjs node --cwd packages/template-vscode -- tests/integration-step.test.mjs` | [o] |
| T17.6 | 오래 걸리는 작업은 단계 log를 출력하고 timeout을 두지 않으며 출력이 없는 시간의 deadline도 두지 않고 exit status, 결과, 오류로 판단하며, test case는 자기 timeout을 유지한다고 AGENTS에 적는다. `AGENTS.ko.md`처럼 `AGENTS.md`에도 영어 문서가 정본이라고 적는다 | `make docs-check` | [o] |
| T17.7 | `tests/runner/drivers.mjs`의 driver build를 600 s 제한 없이 log가 있는 단계로 실행한다. 시작, 출력, 결과를 경과 시간과 함께 standard error에 출력하고 exit code로 판단한다. CLI 호출마다의 10 s timeout은 유지한다 | `node scripts/run-tests.mjs node -- tests/scripts/long-steps.test.mjs` | [o] |
| T17.8 | `scripts/check-package-installs.mjs`(600 s)와 `scripts/check-install-workspace.mjs`(120 s)의 각 명령을 시간 제한 없이 log가 있는 단계로 실행하고 exit code로 판단한다 | `node scripts/run-tests.mjs node -- tests/scripts/long-steps.test.mjs` | [o] |
| T17.9 | `tests/runner/delimiter-matrix.mjs`가 한 언어에서 구분자 쌍이 끝날 때마다 `<pair> [<lang>] pass\|fail (<ms> ms)`를 출력하게 하고, 요약은 끝에 그대로 둔다 | `node scripts/run-tests.mjs node -- tests/scripts/delimiter-matrix-progress.test.mjs` | [o] |
| T17.10 | `test-ts`, `test-language`, `test-lsp`, `test-codemirror`의 vitest test와 `test-vscode`의 `node --test` test를 `scripts/run-tests.mjs`로 실행한다 | `node scripts/run-tests.mjs node -- tests/scripts/test-targets.test.mjs` | [o] |
| T17.11 | `make test-browser`의 정적 서버를 startup deadline 30 s가 있는 Playwright `webServer` 대신 `tests/browser/run.mjs`에서 시간 제한 없는 단계로 띄운다(Playwright는 `timeout: 0`을 60 s로 읽는다). 서버 출력을 출력하고, 준비를 `listening on http://127.0.0.1:4173` 줄로 판단하며, 서버가 먼저 종료하면 실패한다 | `node scripts/run-tests.mjs node --timeout 300 -- tests/scripts/browser-server.test.mjs` | [o] |
| T17.1-1 | 한 번의 전체 실행을 guard `scripts/full-run.mjs`로 강제한다. `make check`는 어떤 단계보다 먼저 이 guard를 시작한다. guard는 이 checklist의 작업 행이 진행 중이면 거부하고 활성 ID를 작업과 함께 나열하며, 추적 파일의 변경이 커밋되지 않았으면 거부하고, 같은 tree(`git rev-parse HEAD^{tree}`)의 두 번째 전체 실행을 앞선 실행을 밝히며 거부한다. `CHECK_TARGETS`의 각 target을 `make <target>`으로 끝까지 실행하고, 각 target의 앞뒤에 `var/full-run.json`(tree, commit, 결과, 각 target의 상태와 시각)을 쓰므로 멈춘 실행은 `incomplete`로 남는다. `make rerun-failed`는 현재 tree에서 통과하지 못한 target만 다시 실행하고, 그것이 통과하면 결과를 완성한다. 원인: AGENTS는 `make check`를 활성 작업이 모두 끝났을 때 한 번 실행한다고 적었지만 이를 강제하는 것이 없었다. 진행 중인 작업이 있는 실행, 커밋되지 않은 변경의 실행, 같은 tree의 두 번째 실행이 모두 suite를 시작했다. Red: `make -n check`는 `docs-check`의 첫 단계를 출력했으므로 suite는 checklist의 내용과 상관없이 시작했고, `make -n rerun-failed`는 `No rule to make target`으로 실패했으며, `tests/scripts/full-run.test.mjs`는 `scripts/full-run.mjs`에 대한 `ERR_MODULE_NOT_FOUND`로 실패했다. Green: 그 10개 case가 통과한다. `make -n check`는 guard만 출력하고, 진행 중인 작업이 있는 fixture checklist, 더러운 tree, 한 tree의 두 번째 실행, record 없는 `rerun-failed`는 stub target이 실행되기 전에 거부되며, `rerun-failed`는 실패했거나 끝나지 않은 stub target만 실행한다 | `node scripts/run-tests.mjs node -- tests/scripts/full-run.test.mjs` | [o] |
| T17.1-2 | `CHECK_TARGETS`를 전체 suite의 유일한 목록으로 만들고 어디서나 guard로 실행한다. `make release-test-matrix`는 다른 target으로 된 일곱 계층을 실행하고 첫 실패에서 멈췄으므로 CI는 `dependency-policy-check`만 보고하고 여섯 계층을 건너뛰었다. `make check`는 `dependency-audit`, `benchmark-check`, `benchmark-smoke`, `docs-verify-idempotent`를 실행하지 않았고, CI는 `test-scripts`, `language-test-matrix`, `function-contract-check`, `delimiter-matrix`, `generated-native-check`를 실행하지 않았다. `CHECK_TARGETS`가 네 target을 담고, `make release-test-matrix`는 `node scripts/full-run.mjs run $(CHECK_TARGETS)`를 실행하며, `.github/workflows/ci.yml`의 release job은 `xvfb-run -a make check`를 실행하고 `var/full-run.json`을 올린다. 검증하는 job의 모든 step은 실패한 step 뒤에도 실행하고(`!cancelled()`), target이 여럿인 make는 `-k`로 실행한다. `scripts/owner-check.mjs`는 `scripts/full-run.mjs`나 `scripts/check-clean-release.mjs`를 시작하는 target을 전체 suite target으로 보고, `tests/scripts/clean-release.test.mjs`가 `scripts/check-clean-release.mjs`를 소유한다 | `node scripts/run-tests.mjs node -- tests/scripts/suite-parity.test.mjs tests/scripts/clean-release.test.mjs tests/scripts/owner-check.test.mjs` | [o] |
| T17.1-4 | `tests/scripts/full-run.test.mjs`, `tests/scripts/suite-parity.test.mjs`, `tests/scripts/test-targets.test.mjs`의 make dry run이 어느 make에서나 명령만 출력하게 한다. `make check`의 make 안에서 GNU Make 4가 guard 명령 앞뒤로 `make[2]: Entering directory`와 `Leaving directory`를 출력했으므로 CI가 `test-scripts`에서 실패했다. macOS make 3.81은 `-w` 없이 그 줄을 출력하지 않는다. dry run은 `--no-print-directory`를 넘기고 `MAKEFLAGS=w`로 실행하므로 어느 make에서나 그 조건이 성립한다 | `node scripts/run-tests.mjs node -- tests/scripts/full-run.test.mjs tests/scripts/suite-parity.test.mjs tests/scripts/test-targets.test.mjs` | [o] |

## Wave 18 — 한 실행의 test resource

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T18.1 | `tests/browser/server.mjs`가 system이 배정하는 port에서 listen하고 그 port를 `listening on http://127.0.0.1:<port>` 줄에 출력하게 한다. `tests/browser/run.mjs`는 그 주소를 `playwright.config.ts`가 요구하는 `TEMPLATE_BROWSER_URL`로 Playwright에 넘긴다 | `node scripts/run-tests.mjs node -- tests/scripts/browser-port.test.mjs` | [o] |
| T18.2 | VS Code directory `.vscode-test`에 holder lock `.vscode-test.lock`을 둔다. integration 실행은 내려받기부터 마지막 launch까지 lock을 잡고, 두 번째 실행은 holder를 밝히며 실패하며, `make clean`은 lock을 잡은 동안에만 directory를 지우고, 끝난 process의 lock은 보고되고 `make vscode-test-unlock`으로 지운다 | `node scripts/run-tests.mjs node -- tests/scripts/holder-lock.test.mjs` | [o] |
| T18.3 | `tests/scripts/browser-server.test.mjs`가 `make test-browser` 대신 `make test-scripts`의 package build로 `tests/browser/run.mjs`를 실행하게 한다. `make test-browser`의 package build(tsup `clean: true`)는 `make test-scripts`의 다른 test가 읽는 동안 `packages/template-ts/dist`를 비웠고, `make check`가 `tests/scripts/generated-conformance.test.mjs`에서 `@polyspec/template`의 `TS7016`으로 실패했다 | `node scripts/run-tests.mjs node -- tests/scripts/browser-server.test.mjs` | [o] |
| T18.4 | 모든 npm 의존성을 bin link 없는 사본으로 설치한다. npm은 다섯 workspace package를 `node_modules`에 link했고 `node_modules/.bin`에 bin link 37개를 썼다. `.npmrc`는 `install-links=true`와 `bin-links=false`를 정한다. root `package.json`은 npm이 언제나 link하는 npm workspace 대신 `packages/`의 package를 override와 함께 `file:` 의존성으로 선언하고 그 개발 도구를 가진다. 각 build target은 그 package의 사본을 다시 설치한다. recipe와 script는 모든 도구를 그 package의 파일로 실행한다(`scripts/tools.mjs`). dependency policy는 root manifest만 읽는다. `tests/scripts/no-symlinks.test.mjs`는 `node_modules`나 `vendor` 아래의 symbolic link 하나에도 실패한다 | `node scripts/run-tests.mjs node -- tests/scripts/no-symlinks.test.mjs` | [o] |
| T18.5 | `make install-cli`로 `template-fmt`를 symbolic link 없이 선언한 prefix `CLI_PREFIX` 아래에 설치한다. formatter package의 사본은 `<prefix>/lib/polyspec-template-fmt`에, 그 진입점을 절대 경로로 실행하는 실행 script는 `<prefix>/bin/template-fmt`에 둔다. `make uninstall-cli`는 둘 다 지운다. `npm link`와 `npm install --global`은 bin link를 쓰며, T18.4 이후 전역 설치는 npm이 `@polyspec/template` 0.0.1을 registry에서 찾으므로 실패한다 | `node scripts/run-tests.mjs node -- tests/scripts/install-cli.test.mjs` | [o] |
| T18.6 | eslint를 최신 안정 release 10.12.0으로 올린다. `make dependency-policy-check`가 `outdated npm dependency has no exception: eslint 10.11.0 < 10.12.0`으로 실패했으므로 `make release-check`가 실패했다. 바뀐 `package-lock.json`의 digest를 생성된 JavaScript showcase manifest와 예제 page에 기록한다 | `make dependency-policy-check lint-js` | [o] |
| T18.7 | checkout마다 Rust crate를 자기 target에 빌드한다: Makefile은 물려받은 `CARGO_TARGET_DIR`를 cargo에 넘기지 않고, Rust test는 저장소 root를 compile 시점이 아니라 실행 시점의 `CARGO_MANIFEST_DIR`에서 정한다. main checkout의 target에서 crate의 오래된 산출물을 지운다. Cause: `make check`가 `test-rust`에서 실패했다. `tests/bound.rs`의 test 7개 중 6개가 `repository root: NotFound`로 panic했다. T17의 worktree가 main checkout의 target을 `CARGO_TARGET_DIR`로 두고 test를 빌드했고, `env!("CARGO_MANIFEST_DIR")`가 나중에 지워진 그 worktree의 경로를 넣었으며, cargo는 소스가 더 오래된 main checkout에서 그곳에서 빌드된 test binary 5개를 최신으로 판정했다. `cargo clean -p polyspec-template`가 main checkout의 target에서 오래된 test binary를 포함한 crate의 산출물(11236개 file, 600.2 MiB)을 지우고 의존성은 남겼다. AGENTS가 규칙을 적는다. Red: main checkout에서 `node scripts/run-tests.mjs cargo --cwd packages/template-rust -- --locked --test bound`가 compile 없이 끝나고 test 7개 중 6개가 `repository root: NotFound`로 실패했다. `make build-rust`와 `make test-rust`의 stub cargo가 물려받은 `CARGO_TARGET_DIR`를 받았으므로 `tests/scripts/cargo-target.test.mjs`의 2개 case가 실패했다. Green: 2개 case가 `CARGO_TARGET_DIR=unset`으로 통과한다. 이 작업의 worktree에서 `make test-rust`가 `polyspec-template`을 자기 target에 compile하고 clippy와 `tests/bound.rs`의 7개를 포함한 test 49개를 통과했다 | `node scripts/run-tests.mjs node -- tests/scripts/cargo-target.test.mjs` and `make test-rust` | [o] |
| T18.7-1 | Rust toolchain을 명시적인 한 단계에서 설치하고 어떤 cargo도 설치하지 않게 한다. release job에 1.98.1이 설치되어 있지 않았고 한 `node --test` 실행의 test file 셋이 cargo를 동시에 시작했으므로 CI가 `test-scripts`에서 실패했다. 각 rustup이 toolchain을 자동 설치했고, cargo 하나가 `the 'cargo' binary, normally provided by the 'cargo' component, is not applicable to the '1.98.1-x86_64-unknown-linux-gnu' toolchain`으로 실패했다. `make install`은 `npm ci` 뒤에 `rustup toolchain install --no-self-update`를 실행하고, Makefile은 `RUSTUP_AUTO_INSTALL=0`을 export하며, CI workflow도 이를 설정하고, release job은 `make install`을, rust와 php job은 `rustup toolchain install --no-self-update`를 실행한다. `scripts/run-tests.mjs`의 요약은 실패한 test 없이 끝난 tool의 오류 줄을 적고, PHPUnit timeout test는 자기가 실행할 PHPUnit을 설치한다 | `node scripts/run-tests.mjs node -- tests/scripts/toolchain-files.test.mjs tests/scripts/run-tests.test.mjs` | [o] |
| T18.8 | TypeScript package의 빌드를 `packages/template-ts/dist`의 reader가 빠진 file을 보지 않게 내보내고, 입력이 바뀔 때만 빌드한다: `scripts/build-ts.mjs`는 `dist` 옆 directory에 빌드하고 각 file을 rename으로 `dist`에 옮기되 entry가 import하는 module을 먼저, entry를 마지막에 옮긴 뒤, 새 빌드에 없는 이전 빌드의 file을 지우며, 입력의 hash가 기록된 hash와 같으면 빌드하지 않는다. Cause: `make check`가 tsup으로 `dist`를 다시 빌드하는 동안 `dist`의 reader가 실패했다. tsup의 `clean: true`는 빌드 전에 `dist`를 비우므로 declaration 빌드가 끝날 때까지 `index.d.ts`, `render.d.ts`, `node.d.ts`가 없었다. `make check` 한 번이 같은 입력으로 그 빌드를 17번 실행했다. `docs/operations/development.md`가 내보내는 방식과 그 한계를 적는다: 바뀐 소스의 빌드가 내보내는 동안 여러 file을 읽는 reader는 두 빌드의 file을 섞어 읽을 수 있다. Red: tsup이 완전한 `dist`를 제자리에서 다시 빌드하는 동안 2 ms마다 `dist`를 읽은 reader가 1559번 중 413번 declaration `index.d.ts`, `render.d.ts`, `node.d.ts`가 없음을, 32~34번 entry module 여섯 개가 없음을 보았다. `scripts/build-ts.mjs`가 없었으므로 `tests/scripts/build-ts.test.mjs`의 2개 case가 실패했다. Green: 2개 case가 통과한다. 강제 빌드 동안 reader는 `dist`를 839번 읽고 빠진 file을 보지 않았고, 빌드는 이전 빌드와 같은 file을 같은 내용으로 썼으며, 입력이 같은 빌드는 `dist`가 최신이라고 출력하고 `index.mjs`를 건드리지 않았다. `make build-ts`는 한 번 빌드하고 설치했으며, 두 번째 `make build-ts`는 빌드도 설치도 하지 않았다 | `node scripts/run-tests.mjs node --timeout 300 -- tests/scripts/build-ts.test.mjs` | [o] |
| T18.8-1 | T18.8의 방식으로 template-language, template-lsp, template-codemirror와 template-vscode의 VS Code bundle을 빌드한다: `scripts/build-ts.mjs`는 `scripts/build-package.mjs --package <package>`가 되고, 입력에 root `package-lock.json`과 package가 의존하는 이 저장소 package의 설치된 사본도 넣으며, 기록 `dist.inputs.json`은 빌드의 file을 나열하고, 각 file은 그것이 import하는 상대 module 뒤에 옮긴다. Cause: 이 저장소 밖에서 이 package를 읽는 저장소는 없다(이 저장소를 사용하는 저장소의 `git grep`에서 0건). 그러나 `make check` 한 번이 같은 입력으로 이 package를 다시 빌드했다: tsup이 template-language를 7번, template-lsp를 3번, template-codemirror를 2번 실행했고, esbuild가 template-vscode를 2번 bundle했으며, 매번 다음 target이 읽는 `dist`를 비우거나 다시 썼다. Red: `tests/scripts/build-package.test.mjs`의 11개 case가 `Unknown option '--package'`로 실패했다. Green: 12개 case가 통과한다. 다섯 package마다 강제 빌드 동안 `dist`를 읽은 reader가 빠진 file을 보지 않았고, 빌드는 이전 빌드와 같은 file을 썼으며, 입력이 같은 빌드는 빌드하지 않았다. template-vscode의 입력은 설치된 template-lsp, template-language, template package를 담는다. 모르는 package는 그 이름과 함께 실패한다. 두 번째 `make build-vscode build-codemirror`는 빌드도 설치도 하지 않았다 | `node scripts/run-tests.mjs node --timeout 300 -- tests/scripts/build-package.test.mjs` | [o] |
| T18.9 | `packages/template-php`와 `packages/template-php-ext`의 phpunit/phpunit을 최신 안정 release 11.5.57로 올린다. `make dependency-policy-check`가 `outdated Composer dependency has no exception: packages/template-php/composer.json phpunit/phpunit 11.5.56 < 11.5.57`으로 실패했으므로 CI가 `make release-test-matrix`에서 실패했다. 검사가 닿지 못한 `packages/template-php-ext`에서도 `composer outdated --direct --locked`가 같은 version을 보고했다. `composer update phpunit/phpunit --with-dependencies`는 두 lock의 nikic/php-parser도 5.9.0으로 올린다 | `make dependency-audit test-php test-ext` | [o] |
| T18.10 | 의존성 상태를 저장소에 기록된 review와 network 없이 대조해 같은 tree가 언제나 같은 결과를 내게 한다. `make dependency-policy-check`는 실행할 때마다 registry를 조회했고, phpunit 11.5.57이 나온 뒤 tree T18.8에서 tree의 변경 없이 실패했다. `scripts/check-dependency-policy.mjs`는 manifest, lock, `config/dependency-policy.json`, 새 review 기록 `config/dependency-review.json`(review 시각, lock마다 sha256과 보안 권고, registry 의존성마다 잠긴 version과 최신 안정 version)을 읽고 모든 발견을 규칙과 고치는 방법과 함께 보고한다. `composer validate`는 `COMPOSER_DISABLE_NETWORK=1`로 실행한다. 개발자 명령 `make dependency-review`(`scripts/dependency-review.mjs`)는 새 안정 release와 보안 권고를 registry에 묻고, `RECORD=1`은 기록을 쓰며 `UPDATE=1`은 먼저 갱신한다. `make dependency-audit`는 live audit을 실행하지 않고, 예약된 workflow `.github/workflows/dependency-review.yml`이 매일 review를 실행한다. `file:` package와 platform 요구 사항은 범위의 정의에 따라 review 밖에 있고, gate는 `file:` package의 lock을 그 version과 대조한다 | `node scripts/run-tests.mjs node -- tests/scripts/dependency-policy.test.mjs`, `make dependency-audit` | [o] |
| T18.8-2 | `tests/scripts/build-package.test.mjs`가 자기가 의존하는 것을 직접 만들게 하고 package 사본을 atomic하게 설치하게 한다. `npm ci` 뒤 아무것도 빌드하지 않은 checkout에서 case 7개가 `TS2307: Cannot find module '@polyspec/template'`와 `Could not resolve "@polyspec/template-lsp"`로 실패했다. 설치된 사본에 `dist`가 없었고, test는 `make test-scripts`가 미리 빌드했다고 기대했지만 `make owner-check`와 직접 실행은 그러지 않는다. test는 case 전에 `scripts/build-package.mjs --install`로 template-ts, template-language, template-lsp를 빌드하고 설치한다. `--install`은 사본을 `rm -rf`와 `npm install`로 다시 설치했으므로 다시 설치하는 동안 사본의 reader가 file 20개가 없음을 보았다. 이제 바뀐 file마다 `node_modules/<name>.next-<pid>`에 쓰고 rename으로 사본에 옮기되 `package.json`을 마지막에 옮기며, package에 더는 없는 file을 지우고, package의 의존성이 사본과 다르면 `npm install`을 고치는 방법으로 적으며 실패한다 | `node scripts/run-tests.mjs node --timeout 300 -- tests/scripts/build-package.test.mjs` | [o] |

## Wave 19 — 한 tree가 정하는 결과

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T19.1 | package 설치 검사가 network의 source를 읽지 않고 checkout의 toolchain을 쓰게 한다. Go 설치 프로젝트는 module을 `proxy.golang.org`에서 해석하고 checksum을 `sum.golang.org`에 대조했으며 `GOTOOLCHAIN=auto`로 실행했으므로, Go 1.27.0인 기계에서는 실행마다 Go toolchain 1.27.1을 module cache에 내려받았다. Rust 설치 프로젝트에는 lock이 없었으므로 cargo가 `serde`와 `serde_json`을 실행 시점의 최신 release로 해석했고, `rust-toolchain.toml` 밖인 시스템 임시 디렉터리에서 기계의 기본 toolchain(1.98.0, checkout은 1.98.1을 고정한다)으로 빌드했다. PHP 설치 프로젝트는 Packagist를 읽을 수 있었다. Go 설치 프로젝트는 실행의 proxy만, `GOSUMDB=off`, `GOTOOLCHAIN=local`과 `packages/template-go/go.mod`의 go 지시문을 쓴다. Rust 설치 프로젝트는 `rust-toolchain.toml`을 복사하고 `packages/template-rust/Cargo.lock`에서 유도한 lock(`scripts/install-workspace.mjs`의 `installCargoLock`)으로 `cargo run --locked`를 실행한다. PHP 설치 프로젝트는 Packagist를 끈다 | `node scripts/run-tests.mjs node -- tests/scripts/package-installs.test.mjs` | [o] |
| T19.2 | 모든 recipe를 checkout이 선언한 toolchain으로 실행한다. `make install-tools`(`scripts/install-tools.mjs`)는 package.json `packageManager`의 npm(12.2.0)과 `packages/template-go/go.mod` go directive의 Go(1.27.1, module `golang.org/toolchain`)를 wrapper script와 함께 `var/tools`에 설치하고, 이미 있는 version의 설치는 건너뛴다. Makefile은 `var/tools/bin`을 PATH의 맨 앞에 두고 `GOTOOLCHAIN=local`을 export하며, GNU Make 3.81은 shell 문법이 없는 줄의 program을 make가 시작할 때의 PATH로 찾으므로 npm을 `$(NPM)`으로 시작하고, `make install`은 `install-tools`에 의존한다. setup-php가 patch를 고정할 수 없으므로 PHP는 `config/toolchain.json`에서 minor version으로, Composer는 정확히 고정하고, `var/full-run.json`은 각 실행의 version을 기록한다. workflow는 모든 action을 commit으로 고정하고 `ubuntu-24.04`에서 실행하며 `make install`로 설치한다. `tests/scripts/toolchain-files.test.mjs`는 모든 변경에 실행된다 | `node --test tests/scripts/toolchain-files.test.mjs tests/scripts/install-tools.test.mjs tests/scripts/full-run.test.mjs` | [o] |
| T19.3 | build되지 않는 Go package의 compiler error를 출력한다. `scripts/run-tests.mjs`의 `goEvents`는 `go test -json`의 `build-output`과 `build-fail` event를 버렸으므로, compile되지 않는 module은 package가 실패했다는 것만 출력했다. runner는 둘을 출력하고 요약 줄은 compiler error를 밝힌다 | `node --test tests/scripts/run-tests.test.mjs` | [o] |

## Wave 20 — 다른 실행과 아무것도 공유하지 않는 test

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T20.1 | 검사와 runner의 모든 임시 directory와 생성 test를 checkout이 아니라 system 임시 directory 아래에 만든다. runner와 script 아홉 개가 `mkdtemp`로 임시 directory를 저장소 root, Go module, Rust crate 안에 만들었고, 다섯 개가 `packages/template-go`에 Go package directory를 만들었으며, 여섯 개가 Rust 통합 test를 `packages/template-rust/tests`에 썼다. 그래서 `make test-scripts` 4번 중 4번 `tests/scripts/owner-check.test.mjs`가 다른 test의 file에서 실패했고, 동시에 실행되는 `cargo test`가 반쯤 쓴 test를 compile할 수 있었다. `scripts/temporary-workspace.mjs`는 설치된 `@polyspec/template`의 사본을 가진 Node.js workspace, lock의 version으로 `packages/template-rust`에 path로 의존하는 Rust crate, `packages/template-go`의 module을 그 directory로 바꾸는 Go module을 만든다. `tests/scripts/temporary-files.test.mjs`는 그런 directory나 file을 checkout에 만드는 script에서 실패한다. Class: 공유 상태를 쓰는 test | `node scripts/run-tests.mjs node -- tests/scripts/temporary-files.test.mjs`; `make generated-native-check typed-generator-compile-check conformance-all-modes` | [o] |
| T20.2 | `tests/browser/run.mjs`가 명시적 명령으로 server를 시작하게 한다. `--server-command`가 다른 명령을 지정하지 않으면 그 process의 Node.js다. `tests/scripts/browser-server.test.mjs`는 느린 wrapper를 그렇게 넘기고, wrapper가 실행되었는지 단언하며, `packages/template-ts/dist`의 inode가 그대로인지 대신 run.mjs가 build 단계를 실행하지 않는지 단언한다. server를 PATH에서 찾았으므로 test의 느린 stub이 실행되는지가 PATH 해석에 달려 있었고(한 실행은 0.6 s에 server를 시작했다), T18.8-2의 전제 조건 build가 실행 중에 그 `dist`를 다시 내보냈으므로 inode 단언이 실패했다. Class: 환경에 의존하는 test, 공유 상태의 경합 | `node scripts/run-tests.mjs node -- tests/scripts/browser-server.test.mjs` | [o] |
| T20.3 | `tests/scripts/long-steps.test.mjs`가 시작한 process가 모두 끝난 뒤에만 임시 directory를 지우게 한다. 긴 package 설치 단계 case는 검사의 process group을 SIGKILL로 끝내고 바로 directory를 지웠으므로, group의 process가 아직 그 안에 쓰는 동안 `make test-scripts` 4번 중 1번 그 directory에서 `ENOTEMPTY`로 실패했다. helper `tests/scripts/process-group.mjs`는 signal을 보내고, leader가 끝나기를 기다리고, group의 process가 하나도 남지 않을 때까지 확인한다. Class: 새는 process | `node scripts/run-tests.mjs node -- tests/scripts/process-group.test.mjs tests/scripts/long-steps.test.mjs` | [o] |
| T20.3-1 | `tests/scripts/process-group.test.mjs`의 directory를 작게 유지한다. writer들이 제한 없이 중첩 directory를 만들었으므로 `make test-scripts`의 부하에서 20번 시도의 삭제가 한 test의 30 s보다 오래 걸렸고, 3번 중 1번 `test timed out after 30000ms`로 실패했다. writer들은 각각 50개 이름 중에서 directory를 만들고, test는 자기 시간 제한을 갖는다. 기다리지 않는 helper는 여전히 `ENOTEMPTY`로 이 test를 실패시킨다 | `node scripts/run-tests.mjs node -- tests/scripts/process-group.test.mjs` | [o] |
