# 실행 체크리스트

[English](/plans/execution-checklist).

이 문서는 템플릿 엔진을 완성하기 위해 필요한 모든 작업을 나열한다: 명세, 적합성 스위트, TypeScript·Go·Rust·PHP 구현, PHP 확장, 브라우저 빌드, 벤치마크, 문서. 작업은 웨이브로 묶는다. 한 웨이브 안에서 `parallel` 표시가 있는 작업은 서로 독립이다. 웨이브는 명시된 의존 작업이 모두 완료된 뒤에만 시작한다.

## 사용 방법

- 작업 ID 형식: `T<웨이브>.<번호>` 또는 `T<웨이브>.<트랙>.<번호>`.
- 모든 작업 행의 마지막 열은 체크박스다: `[ ]` 미완료, `[x]` 완료, 진행할 수 없으면 `[ ] blocked: <이유>`. 검증 명령이 커밋된 트리에서 통과한 뒤에만 체크한다.
- 모든 작업은 산출 파일, 테스트, 검증 명령 하나를 명시한다. 커밋된 트리에서 검증 명령이 통과할 때만 `done`이다.
- 임시 스크립트나 임시 폴더를 만들지 않는다. 모든 검사는 Makefile 타겟, `scripts/` 아래 스크립트, 커밋된 테스트 중 하나다.
- 각 패키지 안에서 코드와 테스트는 별도 디렉터리다. 코어 테스트는 코어 패키지에, 확장 테스트는 확장 패키지에 둔다.
- 결함은 재현하는 실패 테스트를 추가하고, 코드를 수정하고, 테스트를 유지하는 절차로 처리한다.
- 한 파일이 하나의 책임을 넘어 커지면 역할별로 분리한다.

## 의존 관계 개요

```
W0 foundation ──► W1 specification (parallel docs) ──► W1.11 spec review
                                                        │
                                                        ▼
                                          W2 conformance assets (parallel)
                                                        │
                                                        ▼
                                          W3 TypeScript (sequential core, parallel leaves)
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       ▼                                ▼                                ▼
                 W4.G Go track                    W4.R Rust track                  W4.P PHP track
                       └────────────────────────────────┼────────────────────────────────┘
                                                        ▼
                                         W4.X cross-language gate (make check)
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                           ▼
                                   W5 PHP extension            W6 bench, docs site, status
                                          └─────────────┬─────────────┘
                                                        ▼
                                              W7 consumer integration
```

## Wave 0 — 저장소 기반 (순차)

의존: 없음. 담당자 한 명. 각 작업은 직전 작업에 의존한다.

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T0.1 | 저장소 초기화와 툴체인 고정 | `.gitignore`, `.node-version` (26.8.1), `rust-toolchain.toml` (1.98.1, rustfmt, clippy), `.editorconfig` | 커밋 후 `git status` 비어 있음; `node --version` 일치 | [x] |
| T0.2 | 개발 규칙 | `AGENTS.md`, `AGENTS.ko.md`: 영어·한국어 문서 쌍, 계약은 `docs/spec/`, 상태는 `docs/features.md`, 절차는 `docs/operations/`, 변경은 `CHANGELOG.md`, 가장 단순한 구현, 멱등한 명령, 코드·테스트 분리, 실패 테스트 후 수정 절차, 문체(동작 이름 직접 사용, 주체와 대상 명시, 원인은 한 문장, 비유 금지) | `make docs-check` | [x] |
| T0.3 | 최상위 문서 | `README.md`(.ko), `CHANGELOG.md`(.ko), `docs/index.md`(.ko), `docs/features.md`(.ko). 모든 기능 행은 `not-started`/`pending`/`not-deployed`와 근거 링크 | `make docs-check` | [x] |
| T0.4 | 워크스페이스와 Makefile | `package.json` (workspaces `packages/*`, 스크립트 `lint`, `test`, `docs:check`), `Makefile` 타겟 `help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php conformance parity test-browser ext test-ext schema-check docs-check docs docs-verify-idempotent bench bench-ts bench-php bench-go bench-rust clean`; 패키지가 아직 없는 타겟은 `not implemented` 한 줄을 출력하고 1로 종료 | `make help` | [x] |
| T0.5 | 문서 검사기 | `scripts/check-documents.mjs`: 영어·한국어 쌍 필수, 상대 링크 해석, 두 언어의 코드 블록 동일, 기능 상태 필드 유효 | `node scripts/check-documents.mjs` | [x] |
| T0.6 | 이 체크리스트 | `docs/plans/execution-checklist.md`(.ko) | `make docs-check` | [x] |
| T0.7 | 운영 문서 | `docs/operations/development.md`(.ko): 툴체인 설치, `make` 타겟, 커밋 절차; `docs/operations/documentation.md`(.ko): 문서 규칙과 검사기 | `make docs-check` | [x] |

종료 기준: `make docs-check` 통과; `make help`가 모든 타겟을 나열; 첫 커밋 존재.

## Wave 1 — 명세 (병렬)

의존: T0.2, T0.5. T1.1–T1.10은 `parallel`. T1.11은 그 뒤에 실행한다. 각 문서는 영어 파일과 같은 내용의 `.ko.md` 파일이다. 모든 규범 규칙은 식별자(`LEX-1`, `GRM-4`, `EXP-12`, `VAL-3`, `FUN-7`, `RT-5`, `AST-2`, `ERR-9`, `CNF-1`)를 가져 픽스처와 테스트가 인용할 수 있다.

| ID | 작업 | 산출물 | 내용 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T1.1 | 렉시컬 명세 | `docs/spec/lexical.md`(.ko) | UTF-8과 BOM 처리; 줄 구분자; 태그 시작 규칙(`{` 뒤에 수평 공백과 기호, 또는 `{:` 뒤에 식별자와 대입 연산자); 그 외는 텍스트; 태그가 시작될 자리에서만 소비되는 이스케이프 `\{`; 주석 `{* *}`; 문자열 리터럴 밖·표현식 깊이 0의 닫는 구분자로 태그 종료; echo 이외 태그의 standalone 줄 제거 규칙; 텍스트로 남는 JavaScript와 CSS 중괄호 예시 | `make docs-check`, `node tests/runner/delimiter-matrix.mjs` | [x] |
| T1.2 | 태그 문법 | `docs/spec/grammar.md`(.ko) | echo, loop, if, elseif, else, close, include, block, if-block, 대입의 EBNF; 블록 중첩과 닫기 규칙; 루프 안 `{:}`는 빈 분기; 규칙별 오류 조건; bare 경로와 따옴표 경로 토큰 정의; 블록 태그 토큰 순서(선택 id, 선택 경로, `name` 또는 `name:postfix` 형태의 scope 항목) | `make docs-check` | [x] |
| T1.3 | 표현식 명세 | `docs/spec/expressions.md`(.ko) | 토큰 표; EBNF; 우선순위 표(파이프, 삼항과 엘비스, 말미 축약을 포함한 병합, or, and, 동등, 비교와 `in`, 덧셈, 곱셈, 단항, postfix); 경로 접근과 조회 규칙; 전용 노드로 해석되는 루프 메타 `name.index_ key_ value_ last_ first_ size_`; `+` 규칙(한쪽이 문자열이면 결합, 아니면 숫자 덧셈); 그 외 산술은 숫자 전용; 동등, 엄격 동등, 순서, 진릿값; `=>`와 spread를 포함한 list·map 리터럴 | `make docs-check` | [x] |
| T1.4 | 데이터 모델 | `docs/spec/data-model.md`(.ko) | 값 타입; 안전 정수 범위를 가진 IEEE 754 double 숫자; 문자열→숫자 변환 문법; ECMAScript `Number::toString`과 동일한 숫자→문자열 규칙과 언어별 구성 방법; bool과 null 출력; 순서 있는 map; JSON, JavaScript, PHP, Go, Rust 바인딩 표; 거부 코드 | `make docs-check` | [x] |
| T1.5 | 함수 | `docs/spec/functions.md`(.ko) | 모든 내장 함수의 시그니처, 인자 수, 의미, 오류 경우; 파이프 변환; `number` 십진 반올림 규칙; `json` 이스케이프 규칙; `date` 토큰 표와 시간대 규칙; 환경에서 오는 `now`; 호스트 등록 계약; `raw`와 `json`의 safe 값 규칙 | `make docs-check` | [x] |
| T1.6 | 런타임 | `docs/spec/runtime.md`(.ko) | 4개 언어의 엔진 API; 렌더 호출 형태(템플릿 이름 또는 AST, assign 데이터, define map, 환경); 파일 단위 평탄한 로컬 스코프; 루프 변수 바인딩과 복원; 스코프를 공유하는 include; 격리 컨텍스트(assign 루트, define 데이터, scope 인자)의 템플릿 define; define 항목(문자열 경로, 선택 `data`를 가진 `template`, 또는 `html`); 레이아웃 target 선택; 재정의 규칙; 로더 인터페이스와 이름 해석; strict와 lenient 모드; 제한(반복, 깊이, 출력 크기, 표현식 깊이); 출력 이스케이프; 브라우저용 assign 데이터의 HTML 임베딩 | `make docs-check` | [x] |
| T1.7 | AST 스키마 | `docs/spec/ast.md`(.ko), `schema/ast.schema.json`, `schema/README.md`(.ko) | 필드와 `span` 바이트 오프셋을 가진 노드 목록; 파이프·복합 대입·증감의 변환; 직렬화 규칙(숫자 리터럴은 JSON 숫자, 문자열 리터럴은 해석된 값); 모든 노드를 다루는 JSON Schema draft-07 | `node scripts/check-schema.mjs` (스키마 자체 검증) | [x] |
| T1.8 | 오류 | `docs/spec/errors.md`(.ko) | 오류 객체 필드; 단계별(lex, parse, load, data, runtime) 전체 코드 목록; 적합성 검사가 비교하는 필드; 코드별 모드 동작 | `make docs-check` | [x] |
| T1.9 | 적합성 | `docs/spec/conformance.md`(.ko) | 픽스처 디렉터리 구조와 파일 역할; CLI 계약(`parse FILE`, `render FILE --data --define --env --root`, 종료 코드, stdout/stderr); 비교 규칙(AST 구조, HTML 바이트, 오류 필드); 러너 옵션; 표현식 픽스처 형식(토큰, AST, 값) | `make docs-check` | [x] |
| T1.10 | 예제 | `docs/spec/examples.md`(.ko) | 페이지 하나 전체: 레이아웃, 헤더 파셜, scope 인자를 가진 푸터 define, 루프 메타를 쓰는 목록, 카드 define, assign 데이터 파일, define 파일, 기대 출력, AST 발췌 | `make docs-check` | [x] |
| T1.11 | 명세 검토 (순차) | `docs/spec/*` 전반 수정 | 용어 일관성; 본문에 쓰인 모든 오류 코드가 `errors.md`에 존재; `expressions.md`/`examples.md`의 모든 함수가 `functions.md`에 존재; 모든 규칙에 ID; 두 언어가 같은 정보 | `make docs-check`; `CHANGELOG.md`에 검토 기록 | [x] |

종료 기준: 문서 쌍 10개 존재; `make docs-check` 통과; `schema/ast.schema.json`이 메타스키마 검증 통과.

## Wave 2 — 적합성 자산 (병렬)

의존: T1.11. 모든 작업은 `parallel`. `AST 수기` 표시가 있는 케이스는 AST를 손으로 작성한다. 나머지 `expected.ast.json`은 T3.13에서 생성하고 커밋 전에 검토한다.

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T2.1 | 러너 드라이버 | `tests/runner/drivers.mjs`: 언어별 명령, 빌드 명령, 작업 디렉터리, 바이너리 경로 | `node tests/runner/conformance.mjs --list` | [x] |
| T2.2 | 적합성 러너 | `tests/runner/conformance.mjs`: 케이스 열거, 타임아웃이 있는 언어별 호출, AST 구조 diff, HTML 바이트 비교, 오류 필드 비교, 옵션 `--langs`, `--case`, `--list`, `--update`, 표 출력, 실패 시 0이 아닌 종료 | `node tests/runner/conformance.mjs --list` | [x] |
| T2.3 | 일치 러너 | `tests/runner/parity.mjs`: 기대 파일 없이 언어 간 출력 비교, 클라이언트/서버 축 보고 | `node tests/runner/parity.mjs --help` | [x] |
| T2.4 | 스키마 검사기 | `scripts/check-schema.mjs`: ajv로 `schema/ast.schema.json`을 검증하고 모든 `tests/cases/**/expected.ast.json`을 스키마로 검증 | `node scripts/check-schema.mjs` | [x] |
| T2.5 | 픽스처: text | `tests/cases/text/`: 일반 텍스트, 텍스트로 남는 중괄호(`{ debug: true }`, `{}`, `${x}`, `{a:1}`, `{` 뒤 개행), 태그 위치의 이스케이프, 그 외 위치의 이스케이프, 주석 제거, 여러 줄 주석, BOM 제거, CRLF 입력. 4건 AST 수기 | `node scripts/check-schema.mjs` | [x] |
| T2.6 | 픽스처: echo | `tests/cases/echo/`: 경로, 중첩 경로, 숫자 인덱스, 없는 키, 5문자 HTML 이스케이프, `raw`, 숫자 포맷 경계, bool과 null 출력, list 출력 오류. 3건 AST 수기 | `node scripts/check-schema.mjs` | [x] |
| T2.7 | 픽스처: if | `tests/cases/if/`: 기본, elseif 체인, else, 중첩, 진릿값 표(`"0"`, 빈 list, 빈 map, `null`), 블록 밖 else 오류, 중복 else 오류 | `node scripts/check-schema.mjs` | [x] |
| T2.8 | 픽스처: loop | `tests/cases/loop/`: list, map 순서, 루프 메타 필드, 두 메타를 쓰는 중첩 루프, 빈 분기, null 반복 대상, 루프 뒤 변수 복원, 루프 안 elseif 오류, 알 수 없는 루프 메타 오류 | `node scripts/check-schema.mjs` | [x] |
| T2.9 | 픽스처: include와 block | `tests/cases/include/`, `tests/cases/block/`: 로컬을 공유하는 include, include 순환 오류, 레지스트리 블록, 경로와 등록을 가진 블록, scope 인자(`name`과 `name:value`)를 가진 블록, 블록의 로컬 격리, `html` 레지스트리 항목, 미정의 블록 오류, 재정의 오류, if-block 참과 거짓, `../`가 있는 bare 경로, 루트 밖 경로 오류 | `node scripts/check-schema.mjs` | [x] |
| T2.10 | 픽스처: 표현식 | `tests/cases/expr/`: 우선순위, 숫자 `+`, 한쪽이 문자열인 `+`, list `+` 오류, 0 나눗셈 오류, 나머지, 삼항, 엘비스, 말미 `??`, list·map·string의 `in`, 동등 표, 엄격 동등, 혼합 타입 순서 오류, list·map 리터럴, spread, 파이프 체인, 호출 인자 수 오류 | `node scripts/check-schema.mjs` | [x] |
| T2.11 | 픽스처: 함수 | `tests/cases/functions/`: 경계 입력을 포함해 내장 함수마다 한 케이스; `number(2.675, 2)`, `number(1.005, 2)`, `<`·`&`·U+2028을 포함한 `json`, `url` 예약 문자, `date` 토큰과 오프셋, 환경에서 오는 `now`, 알 수 없는 함수 오류 | `node scripts/check-schema.mjs` | [x] |
| T2.12 | 픽스처: 데이터 모델 | `tests/cases/data/`: 정수형 키를 포함한 map 키 순서, `0.1+0.2`, `1e21`, `1e-7`, `-0`, 안전 정수 경계 거부, 아스트랄 문자 길이와 순서, 코드포인트 비교, 잘못된 UTF-8 거부 | `node scripts/check-schema.mjs` | [x] |
| T2.13 | 픽스처: 공백 | `tests/cases/whitespace/`: standalone 태그 줄, 한 줄의 여러 닫기, standalone이 아닌 echo, 루프 안 들여쓰기, 주석만 있는 줄, 줄을 유지하는 인라인 태그 | `node scripts/check-schema.mjs` | [x] |
| T2.14 | 픽스처: 오류 | `tests/cases/errors/`: 미종료 태그, 미종료 문자열, 미종료 주석, 예상치 못한 토큰, 예상치 못한 닫기, 닫히지 않은 블록, 예약어 대입, 잘못된 이스케이프, 잘못된 숫자; 각각 `expected.error.json` | `node scripts/check-schema.mjs` | [x] |
| T2.15 | 표현식 픽스처 | `tests/fixtures/expr/cases.json` (30건: 토큰, AST, 평가 값)과 `tests/fixtures/expr/README.md`(.ko) | `node scripts/check-schema.mjs` | [x] |
| T2.16 | 규칙 커버리지 검사기 | `scripts/check-rules.mjs`: 모든 `case.json` 규칙이 `docs/spec`에 존재, 다루지 않은 규칙 보고; `check`에 포함되는 Makefile 타겟 `rules-check` | `node scripts/check-rules.mjs` | [x] |
| T2.17 | 픽스처: 래퍼 태그 | `tests/cases/wrapper/`: 따옴표·주석·HTML 주석 래퍼, 래퍼 없는 `&#123;&#123;`는 텍스트, `"{= x}"`는 따옴표 유지, 래퍼 닫기 누락 오류, standalone 줄의 래퍼 태그 | `node scripts/check-schema.mjs` | [x] |
| T2.18 | 픽스처: 구분자 | `tests/cases/delimiters/`: `options.json` 구분자, 파일 지시문, 옵션을 덮는 지시문, 문법이 쓰는 닫는 구분자(`[= a[0]]`), 첫 태그가 아닌 지시문 오류, 잘못된 구분자 문자 오류, 사용자 여는 구분자의 이스케이프 | `node scripts/check-schema.mjs` | [x] |

종료 기준: 80건 이상 열거; 손으로 쓴 모든 AST가 검증 통과; 모든 명세 규칙 ID가 최소 한 케이스에 등장.

## Wave 3 — TypeScript 구현

의존: T2.1, T2.2, T2.4와 픽스처 작업. 패키지 `packages/template-ts`, npm 이름 `@polyspec/template`. 소스는 `src/`, 테스트는 `tests/`. 표시된 작업은 `parallel`이고 나머지는 의존 순서를 따른다.

| ID | 작업 | 산출물 | 테스트 | 검증 | 의존 | 완료 |
| --- | --- | --- | --- | --- | --- | --- |
| T3.1 | 패키지 골격 | `package.json` (tsup 빌드: esm, cjs, dts, neutral 플랫폼; exports `.`, `./render`, `./node`), `tsconfig.json` (`lib: ["ES2020"]`, `types: []`), `vitest.config.ts`, 루트 `eslint.config.mjs` | `tests/smoke.test.ts` | `npm run build -w @polyspec/template` | — | [x] |
| T3.2 `parallel` | 값 모델 | `src/value/value.ts` (타입, 진릿값, 동등, 순서), `src/value/number.ts` (숫자 변환, ECMAScript 문자열화), `src/value/bind.ts` (호스트 입력 변환) | `tests/value/*.test.ts` | `npm test -w @polyspec/template` | T3.1 | [x] |
| T3.3 `parallel` | 오류 | `src/errors.ts` (오류 클래스, 코드, 위치) | `tests/errors.test.ts` | 동일 | T3.1 | [x] |
| T3.4 `parallel` | 이스케이프와 출력 | `src/escape.ts`, `src/output.ts` (크기 제한이 있는 빌더, safe 값) | `tests/escape.test.ts` | 동일 | T3.1 | [x] |
| T3.5 | 템플릿 렉서 | `src/lexer/template.ts` (텍스트, 태그 시작 규칙, 이스케이프, 주석, 문자열을 고려한 태그 본문 추출, 위치) | `tests/lexer/template.test.ts` | 동일 | T3.3 | [x] |
| T3.6 `parallel` | 표현식 렉서와 파서 | `src/expr/lexer.ts`, `src/expr/parser.ts`, `src/expr/ast.ts` | `tests/expr/lexer.test.ts`, `tests/expr/parser.test.ts`, `tests/expr/fixtures.test.ts` (`tests/fixtures/expr/cases.json` 로드) | 동일 | T3.3 | [x] |
| T3.7 | 템플릿 파서 | `src/parser/parser.ts` (태그, 블록 스택, else와 빈 분기), `src/parser/standalone.ts` (줄 제거), `src/parser/block-tag.ts` (id, 경로, scope 항목), `src/ast.ts` (노드 타입, JSON 직렬화) | `tests/parser/*.test.ts`, `tests/ast-schema.test.ts` (파싱한 모든 픽스처가 `schema/ast.schema.json` 검증 통과) | 동일 | T3.5, T3.6 | [x] |
| T3.8 | 내장 함수 | `src/functions/index.ts`, 그룹별 파일(`string.ts`, `collection.ts`, `number.ts`, `encoding.ts`, `date.ts`) | `tests/functions/*.test.ts` | 동일 | T3.2, T3.4 | [x] |
| T3.9 `parallel` | 로더 | `src/loader.ts` (인터페이스, `MapLoader`, 이름 해석, 루트 검사), `src/node/loader.ts` (`FsLoader`) | `tests/loader.test.ts` | 동일 | T3.3 | [x] |
| T3.10 | 렌더러 | `src/render/engine.ts` (엔진, 템플릿 define 등록, 이름과 버전 기준 캐시), `src/render/context.ts` (프레임, 루프 메타, 템플릿 define 레지스트리, 제한, 모드), `src/render/statements.ts`, `src/render/expressions.ts` | `tests/render/*.test.ts` | 동일 | T3.7, T3.8, T3.9 | [x] |
| T3.11 | CLI | CLI 계약을 구현하는 `bin/template.mjs` | `tests/cli.test.ts` | `node packages/template-ts/bin/template.mjs parse tests/cases/text/plain/input.tpl` | T3.10 | [x] |
| T3.12 | 인프로세스 적합성 | `tests/cases`의 모든 케이스를 실행하는 `tests/conformance.test.ts` | 동일 | `npm test -w @polyspec/template`; `node tests/runner/conformance.mjs --langs ts` | T3.11 | [x] |
| T3.13 | 나머지 AST 생성과 검토 | AST가 없는 픽스처의 `expected.ast.json`을 `node tests/runner/conformance.mjs --langs ts --update ast`로 생성하고 케이스마다 검토 | — | `node scripts/check-schema.mjs` | T3.12 | [x] |
| T3.14 | 브라우저 빌드 검사 | `tests/browser/index.html`, `tests/browser/render.spec.ts`, `playwright.config.ts`; 페이지가 `dist/index.mjs`를 로드해 케이스 10건을 렌더 | Playwright | `make test-browser` | T3.11 | [x] |
| T3.15 | 픽스처 확장 | T3.12–T3.14에서 발견한 모든 결함에 대한 케이스 추가 | — | `node tests/runner/conformance.mjs --langs ts` | T3.12 | [x] |
| T3.16 | 패키지 문서 | `packages/template-ts/README.md`(.ko): API, CLI, 브라우저 사용법 | — | `make docs-check` | T3.11 | [x] |

종료 기준: `make test-ts`, `npm run lint`, `node tests/runner/conformance.mjs --langs ts`, `make test-browser` 통과; `docs/features.md`의 `template-ts`, `template-browser` 행이 `implemented`/`passed`.

## Wave 4 — Go, Rust, PHP 구현 (병렬 트랙 3개)

의존: T3.13(검토된 AST)과 T3.15. 세 트랙은 서로 독립이다. 트랙 안의 순서는 고정이다. 각 트랙은 TypeScript의 모듈 분할을 그대로 따르고 테스트를 코드와 분리한다.

### 트랙 G — Go (`packages/template-go`, 모듈 `github.com/polyspec/template`)

| ID | 작업 | 산출물 | 테스트 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T4.G.1 | 모듈 골격 | `go.mod` (go 1.27.1, 의존성 없음), `README.md`(.ko) | — | `go vet ./...` | [x] |
| T4.G.2 | 값 모델 | `template/value/value.go`, `ordered.go` (삽입 순서 map), `number.go` (최단 왕복 자릿수로 문자열화), `bind.go` (`any`, 순서를 보존하는 JSON 디코더, 필드 순서의 구조체) | `template/value/*_test.go` (외부 테스트 패키지) | `go test ./template/value/...` | [x] |
| T4.G.3 | 오류 | `template/errors.go` | `template/errors_test.go` | `go test ./template/...` | [x] |
| T4.G.4 | 템플릿 렉서 | `template/lexer/lexer.go` | `template/lexer/lexer_test.go` | 동일 | [x] |
| T4.G.5 | 표현식 렉서와 파서 | `template/expr/lexer.go`, `parser.go`, `ast.go` | `template/expr/*_test.go`, `tests/fixtures/expr/cases.json`을 로드하는 픽스처 테스트 | 동일 | [x] |
| T4.G.6 | 템플릿 파서와 AST | `template/parser/parser.go`, `standalone.go`, `blocktag.go`, JSON 마샬링을 가진 `template/ast/ast.go` | `template/parser/*_test.go`, 스키마 검증 테스트 | 동일 | [x] |
| T4.G.7 | 함수 | 그룹별 파일 `template/functions/*.go` | `template/functions/*_test.go` | 동일 | [x] |
| T4.G.8 | 로더 | `template/loader.go` (`Loader`, `MapLoader`, `fs.FS` 위의 `FSLoader`) | `template/loader_test.go` | 동일 | [x] |
| T4.G.9 | 렌더러 | `template/render/engine.go`, `context.go`, `statements.go`, `expressions.go` | `template/render/*_test.go` | 동일 | [x] |
| T4.G.10 | CLI | `cmd/template/main.go` | `cmd/template/main_test.go` | `go build -o template ./cmd/template` | [x] |
| T4.G.11 | 적합성 | `tests/cases`를 실행하는 `template/conformance_test.go` | 동일 | `make test-go`; `node tests/runner/conformance.mjs --langs ts,go` | [x] |

### 트랙 R — Rust (`packages/template-rust`, 크레이트 `polyspec-template`)

| ID | 작업 | 산출물 | 테스트 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T4.R.1 | 크레이트 골격 | `Cargo.toml` (edition 2024, `serde`, `preserve_order`를 켠 `serde_json`), `Cargo.lock`, `README.md`(.ko), `#![deny(missing_docs)]` | — | `cargo build --locked` | [x] |
| T4.R.2 | 값 모델 | `src/value/mod.rs`, `number.rs`, `bind.rs` | `tests/value.rs` | `cargo test --locked` | [x] |
| T4.R.3 | 오류 | `src/error.rs` | `tests/error.rs` | 동일 | [x] |
| T4.R.4 | 템플릿 렉서 | `src/lexer.rs` | `tests/lexer.rs` | 동일 | [x] |
| T4.R.5 | 표현식 렉서와 파서 | `src/expr/lexer.rs`, `parser.rs`, `ast.rs` | 픽스처를 로드하는 `tests/expr.rs` | 동일 | [x] |
| T4.R.6 | 템플릿 파서와 AST | `src/parser/mod.rs`, `standalone.rs`, `block_tag.rs`, serde를 가진 `src/ast.rs` | `tests/parser.rs`, 스키마 검증 테스트 | 동일 | [x] |
| T4.R.7 | 함수 | `src/functions/*.rs` | `tests/functions.rs` | 동일 | [x] |
| T4.R.8 | 로더 | `src/loader.rs` | `tests/loader.rs` | 동일 | [x] |
| T4.R.9 | 렌더러 | `src/render/mod.rs`, `context.rs`, `statements.rs`, `expressions.rs` | `tests/render.rs` | 동일 | [x] |
| T4.R.10 | CLI | `src/bin/template.rs` | `tests/cli.rs` | `cargo build --locked --release --bin template` | [x] |
| T4.R.11 | 적합성 | `tests/conformance.rs` | 동일 | `make test-rust`; `node tests/runner/conformance.mjs --langs ts,go,rust` | [x] |

### 트랙 P — PHP (`packages/template-php`, composer `polyspec/template`)

| ID | 작업 | 산출물 | 테스트 | 검증 | 완료 |
| --- | --- | --- | --- | --- | --- |
| T4.P.1 | 패키지 골격 | `composer.json` (php ^8.2, PSR-4 `Polyspec\Template\`, phpunit), `phpunit.xml`, `pint.json`, `README.md`(.ko) | — | `composer install`; `vendor/bin/pint --test` | [x] |
| T4.P.2 | 값 모델 | `src/Value/Value.php`, `Number.php`, `Bind.php` (`array_is_list`, 키 문자열 복원, 안전 정수 검사, UTF-8 검사) | `tests/Value/*Test.php` | `vendor/bin/phpunit` | [x] |
| T4.P.3 | 오류 | `src/TemplateError.php`, `src/ErrorCode.php` | `tests/ErrorTest.php` | 동일 | [x] |
| T4.P.4 | 템플릿 렉서 | `src/Lexer/TemplateLexer.php` | `tests/Lexer/TemplateLexerTest.php` | 동일 | [x] |
| T4.P.5 | 표현식 렉서와 파서 | `src/Expr/Lexer.php`, `Parser.php`, `Node.php` | 픽스처를 로드하는 `tests/Expr/*Test.php` | 동일 | [x] |
| T4.P.6 | 템플릿 파서와 AST | `src/Parser/Parser.php`, `Standalone.php`, `BlockTag.php`, `toArray()`를 가진 `src/Ast/*.php` | `tests/Parser/*Test.php`, 스키마 검증 테스트 | 동일 | [x] |
| T4.P.7 | 함수 | `src/Functions/*.php` | `tests/Functions/*Test.php` | 동일 | [x] |
| T4.P.8 | 로더 | `src/Loader/LoaderInterface.php`, `ArrayLoader.php`, `FilesystemLoader.php` | `tests/Loader/*Test.php` | 동일 | [x] |
| T4.P.9 | 렌더러 | `src/Render/Engine.php`, `Context.php`, `Statements.php`, `Expressions.php` | `tests/Render/*Test.php` | 동일 | [x] |
| T4.P.10 | CLI | `bin/template.php` | `tests/CliTest.php` | `php bin/template.php parse ...` | [x] |
| T4.P.11 | 적합성 | `tests/ConformanceTest.php` | 동일 | `make test-php`; `node tests/runner/conformance.mjs --langs ts,go,rust,php` | [x] |

### 교차 언어 검사 (세 트랙 뒤 순차)

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T4.X.1 | 분기 0건의 일치 실행 | `node tests/runner/parity.mjs` | [x] |
| T4.X.2 | 전체 검사 | `make check` (docs-check, lint, 단위 스위트 4개, conformance) | [x] |
| T4.X.3 | 상태 갱신 | `docs/features.md`(.ko)의 `template-go`, `template-rust`, `template-php`, `conformance` 행과 근거 링크; `CHANGELOG.md`(.ko) 항목 | `make docs-check` | [x] |

종료 기준: 깨끗한 체크아웃에서 `make check` 통과.

## Wave 5 — PHP 확장 (순차)

의존: T4.R.11, T4.P.11.

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T5.1 | 툴체인 확인 | Rust PHP 바인딩이 설치된 PHP 버전(8.5)을 지원하는지 `docs/operations/development.md`(.ko)에 기록; 지원하지 않으면 T5.2–T5.6을 필요한 버전과 함께 `blocked`로 표시 | `php-config --version` | [x] |
| T5.2 | 확장 크레이트 | `packages/template-php-ext/Cargo.toml` (cdylib, Rust 크레이트 의존), `src/lib.rs` (`parse`, `render`, `register`를 가진 `Polyspec\Template\Native\Engine`), `src/convert.rs` (zval과 값의 상호 변환) | `cargo build --locked --release` | [x] |
| T5.3 | 스텁과 패키지 연결 | `stubs/polyspec_template.stub.php`; `packages/template-php`가 네이티브 엔진을 명시적으로 선택하는 방법을 문서화 | `make docs-check` | [x] |
| T5.4 | CLI와 테스트 | `bin/template-ext.php`; `php -d extension=...`로 실행하는 `tests/ExtConformanceTest.php` | `make test-ext` | [x] |
| T5.5 | Makefile 타겟 | `ext`, `test-ext`; 러너 드라이버 `php-ext` | `node tests/runner/conformance.mjs --langs php-ext` | [x] |
| T5.6 | 상태 갱신 | `docs/features.md`(.ko)의 `template-php-ext` 행; `CHANGELOG.md`(.ko) | `make docs-check` | [x] |

종료 기준: `make ext` 빌드; `extension_loaded('polyspec_template')`가 true; `php-ext` 적합성 통과.

## Wave 6 — 벤치마크, 문서 사이트, 상태 (병렬)

의존: T4.X.2. T6.1–T6.5와 T6.7은 `parallel`; T6.6은 그 뒤.

| ID | 작업 | 산출물 | 검증 | 완료 |
| --- | --- | --- | --- | --- |
| T6.1 | 성능 측정 | 언어별 AST와 generated 측정값; 측정 전 출력 동일성 검사 | `make showcase` | [x] |
| T6.2 | 문서 커버리지 검사기 | `make doc-coverage`가 실행하는 `scripts/check-doc-coverage.mjs` (4개 패키지의 공개 심볼 문서화) | `make doc-coverage` | [x] |
| T6.3 | 문서 사이트 | `docs/.vitepress/config.mts`, 검증 뒤 실행되는 정적 GitHub Pages job, 생성된 API 문서는 git 제외 | `make docs-static-check`; `make docs-verify-idempotent` | [x] |
| T6.4 | CI 워크플로 | 기존 Makefile 타겟을 호출하고 모든 필수 job 통과 뒤에만 Pages를 배포하는 `.github/workflows/ci.yml` | 워크플로 파일 lint | [x] |
| T6.5 | 발행 절차 | `docs/operations/publication.md`(.ko): Go, npm, composer 패키지의 로컬 불변 발행 | `make docs-check` | [x] |
| T6.7 | 실행 가능한 예제 사이트 | `examples/site/` 시나리오와 정적 페이지; `tools/showcase/build.mjs`; AST/generated program 일치성, 반복 렌더, 동일 조건 모드 벤치마크 JSON 결과물 | `make showcase`; `make showcase-check` | [x] |
| T6.6 | 최종 상태 | 테스트 리비전을 기록한 `docs/features.md`(.ko); `CHANGELOG.md`(.ko) | `make check` | [x] |

T6.2를 완료했다. `scripts/check-doc-coverage.mjs`는 `make doc-coverage`와 `make docs-check`에서 실행한다. 검사기는 문서화된 공개 심볼과 파일 250개를 보고한다(template-ts 55개, template-go 58개, template-php 25개, template-rust 1개, 파일 111개).

T6.7은 공통 레이아웃, 중첩 파셜과 반복문, define 데이터와 scope 우선순위, HTML 슬롯, 없는 define을 다룬다. RT-43–RT-53에 따라 모든 시나리오는 모든 구현에서 같은 JSON 형태의 assign과 직접 경로 대응 define 레지스트리를 사용하며 모든 렌더는 `layout` target에서 시작한다. 어댑터 타입, 필드, 연산과 상태 전이는 `tools/compiler/interface.json`에 선언하고 생성기가 언어별 선언부와 Mermaid 원본을 만든다. `make contract-check`가 매핑된 구현과 실패 후 복구를 검증한다. 포털 레이아웃과 콘텐츠는 원본 스냅샷 바이트를 유지한다. `make showcase`가 5개 구현의 원시 출력과 반복 렌더 해시를 비교하고 AST program과 제품 compiler artifact를 대조하며 HTML·JSON·동일 조건 모드 벤치마크 결과물을 쓴다. `make showcase-check`가 결과물과 정적 HTML 페이지를 검증한다. 예제는 애플리케이션 컨트롤러나 서비스에 의존하지 않는다.

T6.6을 완료했다. 2026-09-11에 `make check`가 통과했다. `make test-ext`가 PHP 확장을 빌드하고 적합성 216건 중 216건과 확장 테스트 236개를 통과했다. `make showcase`가 출력 동일성과 반복 렌더 검사를 통과했다. 기능 상태와 변경 기록에 이 결과를 기록했다.

종료 기준: `make check`, `make showcase-check`, `make docs-verify-idempotent` 통과.

## Wave 7 — generated compiler 완성과 패키지 소비 검증

의존: T4.X.2. 모든 검증은 이 저장소 안에서 독립적으로 수행한다. 패키지 소비 검사는 불변 package artifact를 격리한 임시 프로젝트에 설치하며 다른 애플리케이션 checkout에 의존하지 않는다.

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T7.1 | compiler/runtime manifest 하나, 생성 선언부, 소유 관계와 지원 수준 도표를 정의하고 TypeScript·Go·Rust·PHP 구조 이탈을 거부 | `make compiler-interface-check`; `make runtime-interface-check` | [x] |
| T7.2 | generated callback과 showcase 전용 생성을 하나의 compiler pipeline과 네 host backend로 교체하고 호환 옵션과 fallback 경로 제거 | package test; compiler mutation test | [x] |
| T7.3 | 모든 명세 node, expression, 내장 함수와 host 함수를 generated 실행에서 지원 | generated compiler test | [x] |
| T7.4 | 216개 케이스 전체를 TypeScript·Go·Rust·PHP의 AST와 generated 실행으로 검증 | `make conformance-all-modes` | [x] |
| T7.5 | build 경계 artifact 갱신 검증: `dev`는 항상 재생성, `true`는 digest 변경 시 재생성, `false`는 source를 읽지 않음 | artifact lifecycle test | [x] |
| T7.6 | npm·Go·Cargo·Composer artifact를 격리한 임시 프로젝트에 설치하고 같은 assign/define page 렌더 | `make consumer-check` | [x] |
| T7.7 | production artifact로 parser 기반 showcase 구문 강조, 크기 제한 artifact/source 보기와 React island 예제 생성 | `make showcase-check` | [x] |
| T7.8 | production artifact를 사용해 출력이 같은 AST/generated 성능 측정 재실행 | `make bench`; `make showcase` | [x] |
| T7.9 | 명세, 기능 상태, 변경 기록, 생성 Mermaid, 정적 문서와 완료 근거 동기화 | `make docs-check`; `make docs-verify-idempotent` | [x] |
| T7.10 | 상용 release test pyramid 강제: lexer/parser/IR/runtime 단위 검사, generated source compile 검사, 전체 mode matrix, 위치 오류와 실패 복구 회귀, mutation 거부, 격리 package·browser 소비, 출력 동일 성능 회귀 | `make release-test-matrix` | [x] |
| T7.11 | 깨끗한 checkout의 release gate 통과와 정적 사이트 배포 | `make release-check`; CI와 Pages 성공 | [x] |

## Wave 8 — assign 인스턴스와 클래스 함수 실행

의존: T7.1과 canonical AST parser 변경. 모든 런타임과 생성 프로그램에서 native 인스턴스를 assign으로 전달하고 같은 멤버·클래스 호출을 실행하기 전까지 이 wave는 완료되지 않는다.

| ID | 작업 | 검증 | 완료 |
| --- | --- | --- | --- |
| T8.1 | 애플리케이션 클래스를 복제하지 않는 공통 object value 경계를 추가 | 네 언어 value·binding 테스트 | [x] |
| T8.2 | assign native 인스턴스에서 선언된 public 필드와 멤버 메서드를 조회 | 멤버 조회 테스트 | [x] |
| T8.3 | 같은 registry 계약으로 선언된 논리 클래스 함수를 조회 | 클래스 호출 테스트 | [x] |
| T8.4 | AST와 generated 프로그램에서 멤버·클래스 호출을 실행 | AST/generated 일치 테스트 | [x] |
| T8.5 | 네 언어에서 출력, arity, type, unknown-member와 throw 오류 동작을 검증 | 전체 호출 적합성 matrix | [ ] |
| T8.6 | object 호출 선언과 생성 Mermaid 인터페이스 도표를 추가 | interface 검사 | [x] |
| T8.7 | native 인스턴스 assign, 필드 조회, 멤버 호출과 클래스 호출 결과를 보여주는 showcase 페이지 추가 | `make showcase-check`; 정적 HTML 검사 | [x] |
| T8.8 | 명세, 기능 상태, changelog, Pages 산출물과 완료 근거 동기화 | `make check`; `make docs-verify-idempotent`; Pages URL 검사 | [ ] |

## 병렬성 요약

| 웨이브 | 병렬 그룹 | 순차 제약 |
| --- | --- | --- |
| W0 | 없음 | T0.1 → T0.7 순서 |
| W1 | T1.1–T1.10 | T1.11은 모두 끝난 뒤 |
| W2 | T2.1–T2.18 | 없음 |
| W3 | {T3.2, T3.3, T3.4}, T3.5와 함께 {T3.6, T3.9}, {T3.14, T3.15, T3.16} | T3.1 → T3.5 → T3.7 → T3.10 → T3.11 → T3.12 → T3.13 |
| W4 | 트랙 G, R, P | 각 트랙 안에서 1 → 11; T4.X는 모든 트랙 뒤 |
| W5 | 없음 | T5.1 → T5.6 |
| W6 | T6.1–T6.5, T6.7 | T6.6은 모두 끝난 뒤 |
| W7 | T7.1 → T7.2 → {T7.3, T7.5} → {T7.4, T7.6, T7.7} → T7.8 → T7.9 → T7.10 → T7.11 | compiler 계약과 구현 뒤에 증명과 발행 수행 |
| W8 | T8.1 → {T8.2, T8.3} → T8.4 → {T8.5, T8.6, T8.7} → T8.8 | runtime 지원 뒤에 일치 검증과 발행 수행 |

## 완료 정의

- W0–W8의 모든 작업이 `done`.
- Node 26.8.1, Go 1.27.1, Rust 1.98.1, PHP 8.5의 깨끗한 체크아웃에서 `make check` 통과.
- `node tests/runner/parity.mjs`가 `ts`, `go`, `rust`, `php`, 그리고 빌드된 경우 `php-ext` 사이에 분기 0건을 보고.
- `make test-browser` 통과.
- `make conformance-all-modes`가 TypeScript·Go·Rust·PHP의 mode·언어·케이스 조합 1,728개를 모두 통과하고 generated 실행에서 AST로 fallback하지 않음.
- `make release-test-matrix`가 단위, generated source compile, 적합성, 위치 오류와 실패 복구, mutation 거부, 격리 소비, browser DOM 출력, 성능 동일성의 각 release 계층을 독립적으로 증명.
- 깨끗한 checkout에서 `make consumer-check`, `make showcase-check`, `make docs-verify-idempotent`, `make release-check` 통과.
- `docs/features.md`와 `docs/features.ko.md`가 모든 행에 동일한 상태 필드와 근거 링크를 가짐.
