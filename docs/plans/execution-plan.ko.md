# 실행 계획

[English](/plans/execution-plan).

이 문서는 템플릿 엔진을 완성하는 계획이다: 명세, 적합성 스위트, TypeScript·Go·Rust·PHP 구현, PHP 확장, 브라우저 빌드, 벤치마크, 문서. 작업은 웨이브로 묶고, 각 절은 웨이브의 의존 관계, 작업의 원인, 완료 기준을 적는다. 한 웨이브 안에서 `parallel` 표시가 있는 작업은 서로 독립이다. 웨이브는 명시된 의존 작업이 모두 완료된 뒤에만 시작한다.

웨이브마다 작업, 검증 방법, 상태는 [실행 체크리스트](/ko/plans/execution-checklist)에 있다.

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
                                              W7 package installation
```

## Wave 0 — 저장소 기반 (순차)

의존: 없음. 각 작업은 직전 작업에 의존한다.

종료 기준: `make docs-check` 통과; `make help`가 모든 타겟을 나열; 첫 커밋 존재.

## Wave 1 — 명세 (병렬)

의존: T0.2, T0.5. T1.1–T1.10은 `parallel`. T1.11은 그 뒤에 실행한다. 각 문서는 영어 파일과 같은 내용의 `.ko.md` 파일이다. 모든 규범 규칙은 식별자(`LEX-1`, `GRM-4`, `EXP-12`, `VAL-3`, `FUN-7`, `RT-5`, `AST-2`, `ERR-9`, `CNF-1`)를 가져 픽스처와 테스트가 인용할 수 있다.

종료 기준: 문서 쌍 10개 존재; `make docs-check` 통과; `schema/ast.schema.json`이 메타스키마 검증 통과.

## Wave 2 — 적합성 자산 (병렬)

의존: T1.11. 모든 작업은 `parallel`. `AST 수기` 표시가 있는 케이스는 AST를 손으로 작성한다. 나머지 `expected.ast.json`은 T3.13에서 생성하고 커밋 전에 검토한다.

종료 기준: 80건 이상 열거; 손으로 쓴 모든 AST가 검증 통과; 모든 명세 규칙 ID가 최소 한 케이스에 등장.

## Wave 3 — TypeScript 구현

의존: T2.1, T2.2, T2.4와 픽스처 작업. 패키지 `packages/template-ts`, npm 이름 `@polyspec/template`. 소스는 `src/`, 테스트는 `tests/`. 표시된 작업은 `parallel`이고 나머지는 의존 순서를 따른다.

종료 기준: `make test-ts`, `npm run lint`, `node tests/runner/conformance.mjs --langs ts`, `make test-browser` 통과; `docs/features.md`의 `template-ts`, `template-browser` 행이 `implemented`/`passed`.

## Wave 4 — Go, Rust, PHP 구현 (병렬 트랙 3개)

의존: T3.13(검토된 AST)과 T3.15. 세 트랙은 서로 독립이다. 트랙 안의 순서는 고정이다. 각 트랙은 TypeScript의 모듈 분할을 그대로 따르고 테스트를 코드와 분리한다.

### 교차 언어 검사 (세 트랙 뒤 순차)

종료 기준: 깨끗한 체크아웃에서 `make check` 통과.

## Wave 5 — PHP 확장 (순차)

의존: T4.R.11, T4.P.11.

종료 기준: `make ext` 빌드; `extension_loaded('polyspec_template')`가 true; `php-ext` 적합성 통과.

## Wave 6 — 벤치마크, 문서 사이트, 상태 (병렬)

의존: T4.X.2. T6.1–T6.5와 T6.7은 `parallel`; T6.6은 그 뒤.

T6.2를 완료했다. `scripts/check-doc-coverage.mjs`는 `make doc-coverage`와 `make docs-check`에서 실행한다. 검사기는 문서화된 공개 심볼과 파일 250개를 보고한다(template-ts 55개, template-go 58개, template-php 25개, template-rust 1개, 파일 111개).

T6.7은 공통 레이아웃, 중첩 파셜과 반복문, define 데이터와 scope 우선순위, HTML 슬롯, 없는 define을 다룬다. RT-43–RT-53에 따라 모든 시나리오는 모든 구현에서 같은 JSON 형태의 assign과 직접 경로 대응 define 레지스트리를 사용하며 모든 렌더는 `layout` target에서 시작한다. 어댑터 타입, 필드, 연산과 상태 전이는 `tools/compiler/interface.json`에 선언하고 생성기가 언어별 선언부와 Mermaid 원본을 만든다. `make contract-check`가 매핑된 구현과 실패 후 복구를 검증한다. `make showcase`가 5개 구현의 원시 출력과 반복 렌더 해시를 비교하고 AST program과 제품 compiler artifact를 대조하며 HTML·JSON·동일 조건 모드 벤치마크 결과물을 쓴다. `make showcase-check`가 결과물과 정적 HTML 페이지를 검증한다. 예제는 컨트롤러나 서비스에 의존하지 않는다.

T6.6을 완료했다. 2026-09-11에 `make check`가 통과했다. `make test-ext`가 PHP 확장을 빌드하고 적합성 216건 중 216건과 확장 테스트 236개를 통과했다. `make showcase`가 출력 동일성과 반복 렌더 검사를 통과했다. 기능 상태와 변경 기록에 이 결과를 기록했다.

종료 기준: `make check`, `make showcase-check`, `make docs-verify-idempotent` 통과.

## Wave 7 — generated compiler 완성과 패키지 설치 검증

의존: T4.X.2. 모든 검증은 이 저장소 안에서 독립적으로 수행한다. 패키지 설치 검사는 불변 package artifact를 격리한 임시 프로젝트에 설치하며 이 저장소 밖의 checkout에 의존하지 않는다.

## Wave 8 — assign 인스턴스와 클래스 함수 실행

의존: T7.1과 canonical AST parser 변경. 모든 런타임과 생성 프로그램에서 native 인스턴스를 assign으로 전달하고 같은 멤버·클래스 호출을 실행하기 전까지 이 wave는 완료되지 않는다.

## Wave 9 — AST의 템플릿 주석

의존: 없음. 주석은 문장 노드를 만들지 않으므로, 템플릿의 모든 주석을 읽는 도구는 parser에서 주석을 읽는다.

## Wave 10 — 설치 검사 작업 디렉터리 제거

의존: 없음. Go module cache 파일이 읽기 전용이고 제거 실패가 무시되었으므로, 끝난 설치 검사는 매번 243 MB의 임시 디렉터리를 남겼다.

## Wave 11 — 에디터 언어 서비스, LSP 서버, CodeMirror 어댑터

의존: 없음. 모든 에디터 규칙을 하나의 언어 서비스로 옮기고, 각 에디터는 위치 변환과 기능 등록만 하는 어댑터로 그 서비스에 연결한다([에디터 지원](/ko/spec/editor)). 작업은 브랜치 `feat/<shortname>-<id>`와 작업 사본 `template-<shortname>-<id>`에서 하며, 작업이 `main`에 합쳐지면 둘 다 바로 지운다.

T11.1~T11.6을 완료했다. 2026-10-02에 브랜치 `feat/language-T11.2`의 커밋 "Refresh the generated artifact digests after the lockfile change"에서 `editor-boundary-check`, `test-language`, `test-lsp`, `test-codemirror`, `test-vscode`, `test-vscode-integration`을 포함한 `make check`가 통과했고, `rules-check`는 덮이지 않은 규칙이 없다고 보고했다.

## Wave 12 — 콜론 앞에 식별자가 오는 삼항 연산

의존: 없음. `c ? a : b`는 올바른 식이다(EXP-7, EXP-13). 그런데 TypeScript 식 파서는 `:` 앞의 식별자를 클래스 호출 `Class::method()`의 시작으로 읽어 `unexpected token "b"`로 실패한다. `c ? 1 : 2`와 `c ? (a) : b`는 파싱된다. 작업은 브랜치 `fix/ternary-T12.1`과 작업 사본 `template-ternary-T12.1`에서 한다.

## Wave 13 — 네 가지 작업 상태

의존: 없음. 모든 checklist는 AGENTS가 정한 네 가지 작업 상태를 쓴다. 대기, 진행 중, 완료, 원인과 재시도 조건을 적은 일시 우회다. 이 checklist는 완료 작업을 글자 x로, 막힌 작업을 대기 표시 뒤에 `blocked: <이유>`를 붙여 적었고, `scripts/check-documents.mjs`는 그것만 받았다.

## Wave 14 — Data binding 비용

의존: 없음. host binding은 모든 문자열, map key, define id를 `Utf8::firstInvalid`로 검사한다. 이것은 한 step에 byte 하나를 읽는 PHP loop다. 문자열 1442개(49 KB, 대부분 한국어)의 map을 binding하는 데 1.16 ms가 걸렸고, 그중 loop가 1.01 ms였다. `mb_check_encoding`은 같은 결과를 0.02 ms에 낸다. document 하나를 여러 template으로 render하는 renderer는 같은 data를 render마다 binding한다. 작업은 branch `fix/utf8-T14.1`과 worktree `template-utf8-T14.1`에서 한다.

## Wave 15 — runtime마다 다른 binding 오류

의존성: 없음. runtime은 두 곳에서 T14.2 명세와 달랐다. Rust는 null `assign`을 E_DATA_UNSUPPORTED_TYPE으로 실패시킨다(`value/bind.rs`의 `bind_map`). PHP extension도 같다(`convert.rs`의 `php_to_map`). TypeScript, Go, PHP는 RT-4대로 빈 map으로 렌더한다. typed generated program은 선언한 type과 맞지 않는 request를 ERR-13대로 PHP에서 `\InvalidArgumentException`, TypeScript에서 `Error`, Go에서 `fmt.Errorf`의 `error`로 보고한다. Rust는 E_DATA_UNSUPPORTED_TYPE으로 보고한다. T14.2에서 세 번째를 찾았다. Go typed generated program은 없는 optional field를 그 type의 zero value로 읽으므로 `??`가 적용되지 않는다.

## Wave 16 — 동시 render

의존성: 없음. VAL-22는 render들이 하나의 bound map을 동시에 읽을 수 있다고 적지만, render들이 하나의 program을 공유할 수 있는지는 명세에 없다. Go AST program은 template cache를 lock 없이 읽고 쓰므로, 한 program의 동시 render는 경합한다(`go test -race`, `render/engine.go`의 `LoadTemplate`에서 cache를 읽고 쓰는 곳).

## Wave 17 — test 실행

의존성: 없음. 각 test는 실행 중에 시작, 결과, 경과 시간을 출력하고 자기 timeout을 가진다. 전체 suite는 활성 작업이 모두 끝났을 때 한 번 실행한다. AGENTS는 모든 작업을 완료로 표시하기 전에 `make check`를 요구했고, `AGENTS.ko.md`에는 "결정과 수용 규칙" 절이 없었다. `test-go`는 package마다 120 s로 제한했고, `test-rust`와 `test-php`는 test에 timeout을 주지 않았으며 test가 도는 동안 아무것도 출력하지 않았다. conformance runner는 마지막 case가 끝난 뒤에야 표를 출력했다. 네 generated conformance runner는 모든 case를 `go test`나 `cargo test` 호출 하나에서 600 s 제한 하나로 실행하거나, 제한 없이 자기 process에서 실행했고, 마지막 개수만 출력했다. VS Code integration runner는 VS Code 실행, profile 설치, check를 각각 제한 없이 기다렸다. 작업은 branch `fix/test-runs-T17.1`과 worktree `template-test-runs-T17`에서 진행한다. 오래 걸리는 작업(build, `tsc`, 설치, VS Code download·설치·실행, 실행 전체)은 단계 log를 출력하고 timeout을 두지 않는다. 시간 제한은 예상보다 느린 정상 실행을 실패시키기 때문이다. T17.4와 T17.5는 `tsc`, profile 설치, 실행에 deadline을 주었고, driver build와 package 설치 검사에도 시간 제한이 있었다. `tests/runner/delimiter-matrix.mjs`는 마지막 case 뒤에 한 줄만 출력했고, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `test-vscode`의 unit test는 `scripts/run-tests.mjs`로 실행하지 않았다. T17.6부터 T17.10은 branch `test/no-deadline-T17.6`과 worktree `template-no-deadline-T17.6`에서 진행한다. T17.1-1은 branch `test/full-run-T17.1-1`과 worktree `template-full-run-T17.1-1`에서 진행한다. AGENTS는 모든 진행 중 작업이 끝났을 때만 push한다고 했지만 이를 강제하는 것이 없었다. T17.1-3은 추적되는 pre-push hook으로 그런 push를 거부하고 그런 commit에 대해 CI job `push-gate`를 실패시키며, branch `feat/push-gate-T17.1-3`과 worktree `template-push-gate-T17.1-3`에서 진행한다.

## Wave 18 — 한 실행의 test resource

의존: 없음. 같은 checkout이나 서로 다른 checkout에서 동시에 도는 두 실행이, 다른 실행이 쓰고 있는 resource를 바꾸거나 초기화했다. `tests/browser/server.mjs`는 고정 port `127.0.0.1:4173`에서 listen했으므로 두 번째 실행은 `EADDRINUSE`로 실패했고, Playwright는 어느 서버가 그 port를 잡고 있든 그 port에서 page를 열었다. `packages/template-vscode/tests/integration/run.mjs`는 VS Code를 저장소 root의 `.vscode-test`에 내려받아 풀며, 한 checkout의 모든 실행이 이 directory를 공유한다. `make clean`은 실행이 그 directory를 쓰는 동안에도 지웠다. 실행의 resource는 그 실행이 격리한다(system이 배정하는 port, 임시 directory, 실행의 이름). 하나뿐인 resource는 한 번에 holder 하나를 가지며, holder는 원자적으로 만드는 lock file에 기록되고 그 file은 holder의 checkout, process ID, 시작 시각을 적는다. 다른 실행은 그 holder를 밝히며 실패하고, holder가 lock을 푼다. process가 끝난 lock은 보고되고 명시적인 명령으로 지운다. 작업은 branch `fix/shared-T18.1`과 worktree `template-shared-T18.1`에서 한다.

## Wave 19 — 한 tree가 정하는 결과

의존성: 없음. 검사에는 열 가지 결함 class가 있었다. 검사의 결과가 시간, network, 기계, 이전 실행의 잔여물에도 의존했다. package 설치 검사는 crate와 Go toolchain을 network에서 해석했고 Rust 설치 프로젝트를 기계의 기본 toolchain으로 빌드했으며, Go는 내려받은 toolchain으로 스스로 전환했고, test runner는 Go의 compile error를 숨기고 test가 없는 실행을 통과시켰으며, target들은 자신이 만들지 않은 PHP 의존성과 package build를 읽었고, owner check는 바뀐 path를 읽는 target을 놓쳤으며, 출력은 제거 후 다시 쓰는 방식으로 교체되었고, recipe는 처음 실패한 명령에서 멈췄으며, 여러 실패가 기대값을 밝히지 않았다. 각 작업은 한 class를 가장 작은 경계에서 재현하고 저장소 전체에서 고치며 test를 유지한다. AGENTS는 열 가지 규칙을 적는다.

## Wave 20 — 다른 실행과 아무것도 공유하지 않는 test

의존성: 없음. `make test-scripts`의 한 `node --test` 실행에서 test file들은 동시에 실행되고, checkout에 쓰거나 PATH에서 명령을 찾거나 process를 남기는 검사는 다른 file의 timing에 따라 실패했다. 저장소 root에 있는 runner의 임시 file은 모든 추적 경로에 대한 owner 검사를 실패시켰고, browser test의 느린 server stub은 실행이 확실하지 않았으며 `dist` inode에 대한 단언은 T18.8-2의 전제 조건 build와 만났고, stub의 자식 process가 아직 쓰는 동안 임시 directory를 지웠다. 이제 각 검사는 file을 system 임시 directory 아래에 두고, 명령을 명시적으로 받으며, 시작한 process를 기다린다.

## Wave 21 — C로 구현한 PHP extension

의존성: 없음. PHP extension `packages/template-php-ext`는 ext-php-rs로 Rust 구현을 감쌌다. 그래서 독립된 구현이 아니었고, PHP version마다 cargo, Rust toolchain, ext-php-rs binding에 의존했다. 이제 PHP 구현 `packages/template-php`와 conformance case를 사양으로 하는 C 독립 구현이 된다. source, `config.m4`, class의 stub은 `src/`에 있고, gen_stub.php가 stub에서 arginfo를 만들며, phpize, configure, make가 build한다. 작업은 parser, JSON data를 쓰는 renderer, PHP 값의 binding을 차례로 더하고, 그다음 target, runner, CI에서 Rust extension을 바꾼다.

## Wave 22 — Tag 릴리스

의존성: 없음. 모든 변경은 필수 check와 함께 merge queue로 `main`에 도달하므로 `main`의 모든 commit은 전체 suite를 통과했고, 릴리스는 메인테이너가 버전 올림 pull request 뒤에 `main`의 commit에 붙이는 tag다. changelog는 tag `v0.0.1`의 항목을 `## Unreleased` 아래에 두었고, `packages/template-go/go.mod`의 module 경로는 `go get`이 그 directory로 해석하지 않는 `github.com/polyspec/template`이었으며, ruleset `main`은 `ci.yml`의 모든 job을 적었으므로 새 job은 ruleset이 이름을 적기 전까지 요구되지 않았고, tag에서 실행되는 workflow가 없었다. 종료 조건: changelog는 `## 0.0.1` 위에 `## Unreleased`를 두고, module 경로는 `github.com/polyspec/template/packages/template-go`이며, ruleset은 정확히 `push-gate`와 `ci-passed`를 요구하고, `.github/workflows/release.yml`은 check를 통과했고 manifest가 tag의 버전을 담으며 changelog에 그 section이 있는 `main`의 commit에 대해서만 tag의 GitHub Release를 만든다.

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
| W8 | T8.1 → {T8.2, T8.3} → T8.4 → {T8.5, T8.6, T8.7} → T8.8 → T8.5-1 → T8.5-2 | runtime 지원 뒤에 일치 검증과 발행 수행 |
| W9 | 없음 | T9.1 |
| W10 | 없음 | T10.1 |
| W11 | T11.3 → T11.4와 T11.5를 병렬로 | T11.1 → T11.2 → 병렬 그룹 → T11.6 |
| W14 | 없음 | T14.1 → T14.2 |
| W15 | T15.1, T15.2, T15.3, T15.4 | 없음 |
| W16 | 없음 | T16.1 |
| W17 | 없음 | T17.1 → T17.2 → {T17.3, T17.4, T17.5} → T17.6 → {T17.4-1, T17.5-2, T17.7, T17.8, T17.9, T17.10, T17.11} → T17.1-1 → T17.1-2 → T17.1-3 → T17.1-5 → T17.1-6 → T17.1-7 → T17.1-9 → T17.1-10 |
| W18 | T18.1, T18.2, T18.3, T18.4, T18.5, T18.6 | 없음 |
| W19 | 없음 | T19.1 → T19.15 순서대로, T19.6-1은 T19.11 뒤, T19.8-1은 T19.15 뒤 |
| W20 | T20.1, T20.2, T20.3 | T20.3-1은 T20.3 뒤, T20.1-1은 T20.3-1 뒤, T20.1-2는 T20.1-1 뒤, T20.1-3은 T20.1-2 뒤, T20.1-4는 T20.1-3 뒤, T20.1-5는 T20.1-4 뒤, T20.1-6은 T20.1-5 뒤, T20.1-7은 T20.1-6 뒤, T20.1-8은 T20.1-7 뒤, T20.1-9는 T20.1-8 뒤, T20.1-10은 T20.1-9 뒤, T20.1-11은 T20.1-10 뒤, T20.1-12는 T20.1-11 뒤, T20.1-13은 T20.1-12 뒤 |
| W21 | 없음 | T21.1 → T21.2 → T21.3 → T21.4 → T21.4-1 → T21.4-2 |
| W22 | 없음 | T22.1-1 → T22.1-2 → T22.1-3 → T22.1-4 → T22.1 → T22.2 → T22.2-1 → T22.2-2 → T22.2-3 → T22.3 → T22.3-1 |

## 완료 정의

- W0–W11의 모든 작업이 `done`.
- Node 26.8.1, Go 1.27.1, Rust 1.98.1, PHP 8.5의 깨끗한 체크아웃에서 `make check` 통과.
- `node tests/runner/parity.mjs`가 `ts`, `go`, `rust`, `php`, 그리고 빌드된 경우 `php-ext` 사이에 분기 0건을 보고.
- `make test-browser` 통과.
- `make conformance-all-modes`가 TypeScript·Go·Rust·PHP의 모든 mode·언어·케이스 조합(mode 두 개 × 언어 네 개 × 모든 정규 케이스. T9.1의 246개 케이스로 1,968개)을 통과하고 generated 실행에서 AST로 fallback하지 않음.
- `make release-test-matrix`가 단위, generated source compile, 적합성, 위치 오류와 실패 복구, mutation 거부, 격리 설치, browser DOM 출력, 성능 동일성의 각 release 계층을 독립적으로 증명.
- 깨끗한 checkout에서 `make install-check`, `make showcase-check`, `make docs-verify-idempotent`, `make release-check` 통과.
- `docs/features.md`와 `docs/features.ko.md`가 모든 행에 동일한 상태 필드와 근거 링크를 가짐.

2026-10-02의 증거. Node 26.8.1, Go 1.27.1(`go.mod`의 toolchain 줄로 받음), Rust 1.98.1, PHP 8.5.10에서 실행했다.

- 커밋 "Make template tags stand out in VS Code whatever the color theme is"의 새 체크아웃에서 `npm ci` 뒤 `make check`가 상태 0으로 통과했다. 이 증거를 기록하는 커밋의 Makefile 변경을 적용한 상태다. 이 실행에서 `runtime-interface-check`와 `compiler-interface-check`가 사용하는 PHP 의존성을 설치하지 않는다는 것을 발견했고, 이제 두 타깃은 `build-php`에 의존한다. 커밋 "Repair the release checks broken by the host value changes and run them in make check"부터 `make check`는 `test-browser`, `conformance-all-modes`, `install-check`, `showcase-check`, 문서 상태 검사를 포함한다.
- 커밋 "Make template tags stand out in VS Code whatever the color theme is"에서 `node tests/runner/parity.mjs`가 `ts`, `go`, `rust`, `php`, `php-ext` 사이에 244개 케이스 중 244개가 일치한다고 보고했다.
- `make conformance-all-modes`가 1,952개 칸을 fallback 없이 모두 통과했다. `make test-browser`, `make install-check`, `make showcase-check`, `make docs-verify-idempotent`가 통과했다.
- 커밋 "Make template tags stand out in VS Code whatever the color theme is"에서 `make release-check`가 통과했다. 격리된 깨끗한 체크아웃에서 `make release-test-matrix`의 일곱 계층을 모두 실행했다.
