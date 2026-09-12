# 릴리스 테스트

[English](testing.md).

릴리스 gate는 다음 명령으로 실행한다.

```sh
make release-test-matrix
```

일곱 계층을 순서대로 실행하며 처음 실패한 위치에서 중단한다.

| 계층 | 범위 | 실패 근거 |
| --- | --- | --- |
| 계약 | Manifest에서 생성한 선언과 Mermaid, 문서 쌍, schema, 공개 API 문서화, format과 정적 분석 | 구조 이탈, 오래된 생성 파일, 문서가 없는 API 또는 잘못된 source |
| 단위 | 모든 core package의 lexer, parser, 데이터 모델, 함수, runtime, limit, artifact refresh, page cache | 가장 작은 package와 test가 결함을 식별한다. |
| Compiler | Canonical AST 생명주기, typed IR 거부, generated backend 네 개와 host compiler 검사 | 거부된 IR node, 오래된 artifact 또는 target compiler 진단 |
| 적합성 | Canonical case 211개를 AST 네 개와 generated program 네 개로 실행하고 PHP 확장 지원 수준도 검사 | 정확한 언어, 모드, case와 출력 또는 구조화 진단 차이 |
| 회귀 | 위치 오류, 실패 복구, request 불변성과 interface·artifact·benchmark hash mutation | 알려진 잘못된 mutation을 받거나 복구 후 출력이 달라진다. |
| 소비 | 변경 불가능한 npm, Go module, Cargo, Composer package와 browser DOM 출력 | Package 설치, 공개 import 또는 소비 출력 실패 |
| 표시와 성능 | 정적 예제 HTML, parser 기반 하이라이트, 크기가 제한된 source 보기, 문서 멱등성과 출력이 같은 새 benchmark smoke | 잘못된 HTML, 오래된 site, 두 번째 build 차이 또는 잘못된 측정 행 |

전체 mode matrix는 canonical case 211개 × compiler mode 두 개 × 언어 네 개로 core cell 1,688개를 갖는다. 성공 case는 정확한 UTF-8 바이트를 비교한다. 실패 case는 오류 code, message, template 이름, source 위치를 비교한다. Generated 실행은 host source를 승인하기 전에 parser, AST interpreter, fallback 참조가 없는지도 검사한다.

Mutation test는 필수 근거다. Interface operation, artifact digest, output hash를 손상시키고 해당 validator가 반드시 실패하게 한다. Validator가 mutation을 받으면 release gate가 실패한다.

모든 명세 규칙은 기계적으로 검사되는 근거 경로 하나를 갖는다. 실행 가능한 언어 동작은 canonical fixture가 직접 검증한다. Schema, host binding, 공개 runtime 구조, compiler artifact, 발행 경계에 관한 규칙은 `tests/rule-evidence.json`에 검증 명령과 구체적인 test file을 기록한다. 알 수 없는 규칙, 없는 근거 file, 중복된 비-fixture 배정, 근거 경로가 없는 규칙이 있으면 `make rules-check`가 실패한다.

짧은 성능 실행은 안정적인 속도 점수가 아니라 정확성 회귀 검사다. 언어·모드마다 새 표본 세 개를 만들고 출력 식별값과 모든 metric field를 검사하며 커밋된 21표본 보고서는 바꾸지 않는다.

발행 전에는 `make release-check`를 실행한다. 이 명령은 source worktree가 깨끗한지 확인하고 `HEAD`의 분리된 임시 worktree를 만든 다음 lock으로 고정한 JavaScript 의존성과 browser를 설치하고 그 안에서 전체 release matrix를 실행한다. PHP test 의존성은 각 package target이 설치한다. 임시 checkout은 성공하거나 실패해도 제거한다.
