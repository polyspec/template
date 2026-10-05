# 릴리스 테스트

[English](/operations/testing).

릴리스 gate는 다음 명령으로 실행한다.

```sh
make release-test-matrix
```

이 명령은 `make check`의 전체 suite를 같은 guard `scripts/full-run.mjs`로 실행한다. `Makefile`의 `CHECK_TARGETS`에 있는 모든 target을 앞선 target의 실패와 상관없이 각각 `make <target>`으로 끝까지 실행하고, target마다 결과와 걸린 시간을 `var/full-run.json`에 기록한다. `CHECK_TARGETS`는 전체 suite의 유일한 목록이며 `make check`, `make release-test-matrix`, `make release-check`, CI workflow의 release job이 이를 실행하고, release job은 그 기록을 올린다. guard는 tree마다 한 번 실행하므로, 어떤 tree에서 `make check`를 실행한 뒤에는 `make release-test-matrix`가 그 tree를 그 실행을 밝히며 거부한다. `make rerun-failed`는 통과하지 못한 target을 다시 실행한다. target들은 일곱 계층을 다룬다.

| 계층 | 범위 | 실패 근거 |
| --- | --- | --- |
| 계약 | Manifest에서 생성한 선언과 Mermaid, 문서 쌍, schema, 공개 API 문서화, lock 의존성 보안 권고, format과 정적 분석 | 구조 이탈, 오래된 생성 파일, 알려진 의존성 취약점, 문서가 없는 API 또는 잘못된 source |
| 단위 | 모든 core package의 lexer, parser, 데이터 모델, 함수, runtime, limit, artifact refresh, page cache | 가장 작은 package와 test가 결함을 식별한다. |
| Compiler | Canonical AST 생명주기, typed IR 거부, generated backend 네 개와 host compiler 검사 | 거부된 IR node, 오래된 artifact 또는 target compiler 진단 |
| 적합성 | Canonical case 248개를 AST 네 개와 generated program 네 개로 실행하고 PHP 확장 지원 수준도 검사 | 정확한 언어, 모드, case와 출력 또는 구조화 진단 차이 |
| 회귀 | 위치 오류, 실패 복구, request 불변성과 interface·artifact·benchmark hash mutation | 알려진 잘못된 mutation을 받거나 복구 후 출력이 달라진다. |
| Package 설치 | 변경 불가능한 npm, Go module, Cargo, Composer package와 browser DOM 출력 | Package 설치, 공개 import 또는 설치 프로젝트 출력 실패 |
| 표시와 성능 | 정적 예제 HTML, parser 기반 하이라이트, 크기가 제한된 source 보기, 문서 멱등성과 출력이 같은 새 benchmark smoke | 잘못된 HTML, 오래된 site, 두 번째 build 차이 또는 잘못된 측정 행 |

전체 mode matrix는 canonical case 248개 × compiler mode 두 개 × 언어 네 개로 core cell 1,984개를 갖는다. 성공 case는 정확한 UTF-8 바이트를 비교한다. 실패 case는 오류 code, message, template 이름, source 위치를 비교한다. Generated 실행은 host source를 승인하기 전에 parser, AST interpreter, fallback 참조가 없는지도 검사한다.

언어 테스트 매트릭스는 `contracts/features.json`에 선언한다. 매트릭스의 의미 기능은 TypeScript, Go, Rust, PHP의 pass 지원을 선언해야 하며 `ast`와 `gen`을 모두 검사해야 한다. `make language-test-matrix`는 기능·언어 선언 또는 테스트 경로가 빠지면 실패한다. `make conformance-all-modes`, `make function-contract-check`, `make generated-native-check`가 실행 가능한 적용 범위를 제공한다.

Mutation test는 필수 근거다. Interface operation, artifact digest, output hash를 손상시키고 해당 validator가 반드시 실패하게 한다. Validator가 mutation을 받으면 release gate가 실패한다.

모든 명세 규칙은 기계적으로 검사되는 근거 경로 하나를 갖는다. 실행 가능한 언어 동작은 canonical fixture가 직접 검증한다. Schema, host binding, 공개 runtime 구조, compiler artifact, 발행 경계에 관한 규칙은 `tests/rule-evidence.json`에 검증 명령과 구체적인 test file을 기록한다. 알 수 없는 규칙, 없는 근거 file, 중복된 비-fixture 배정, 근거 경로가 없는 규칙이 있으면 `make rules-check`가 실패한다.

Package 설치 검사는 package, 설치 프로젝트, Go module cache와 Cargo target을 시스템 임시 디렉터리의 새 디렉터리 하나에 만들고, 설치 프로젝트가 통과하든 실패하든 검사가 끝날 때 그 디렉터리를 제거한다. Go는 기본적으로 module cache 파일을 읽기 전용으로 만들어 재귀 제거가 그 파일을 제거하지 못하므로, Go는 `-modcacherw`로 module cache를 만든다. 제거가 실패하면 검사는 그 디렉터리의 경로와 함께 실패한다. `scripts/check-install-workspace.mjs`가 설치 프로젝트보다 먼저 실행되어 두 조건을 증명한다. 설치 프로젝트는 network의 source를 읽지 않고 checkout의 toolchain을 쓴다. Go 설치 프로젝트는 `GOSUMDB=off`, `GOTOOLCHAIN=local`과 `packages/template-go/go.mod`의 go 지시문으로 실행의 proxy에서만 module을 해석한다. Rust 설치 프로젝트는 `rust-toolchain.toml`의 사본과 `packages/template-rust/Cargo.lock`에서 유도한 lock으로 `cargo run --locked`를 실행해 빌드한다. PHP 설치 프로젝트는 실행의 package 외에 어떤 저장소도 읽지 않는다(`tests/scripts/package-installs.test.mjs`). 두 script는 `npm pack`, `go mod tidy`, `cargo run`, `composer install` 같은 각 명령을 시간 제한 없는 단계로 실행한다(`scripts/test-progress/step.mjs`). 단계는 시작, 명령 출력, 경과 시간이 붙은 결과를 standard error에 출력하고 명령이 0이 아닌 status로 종료하면 실패한다.

짧은 성능 실행은 안정적인 속도 점수가 아니라 정확성 회귀 검사다. 언어·모드마다 새 표본 세 개를 만들고 출력 식별값과 모든 metric field를 검사하며 커밋된 21표본 보고서는 바꾸지 않는다.

발행 전에는 `make release-check`를 실행한다. 이 명령은 source worktree가 깨끗한지 확인하고 `HEAD`의 분리된 임시 worktree를 만든 다음 lock으로 고정한 JavaScript 의존성과 browser를 설치하고 그 안에서 전체 release matrix를 실행한다. 각 target은 lock으로 고정한 PHP 의존성 같은 자기 의존성을 준비한다. 임시 checkout은 성공하거나 실패해도 제거한다.
