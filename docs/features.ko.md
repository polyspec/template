<!-- doc-id: docs-features -->
<!-- source-sha256: f2bd14435aa1585ec34a5ad65890b87b5d5a32089df3b33053ee40600b2d2ab0 -->
# 기능 상태

표는 각 기능의 상태를 기록한다. 구현과 각 구현이 가진 unit은 `config/parity.json`에 선언하며, `make parity-check`가 이를 tree에 대해 검사한다(CNF-11).

| ID | 기능 | 상태 | Client 지원 | 근거 |
|---|---|---|---|---|
| spec | Template language specification | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/lexical) |
| ast-schema | Canonical AST schema | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/ast) |
| conformance-suite | Cross-language conformance suite | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](operations/conformance) |
| template-ts | TypeScript runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](spec/compiler) |
| template-browser | Browser ESM runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/browser) |
| template-go | Go runtime | implemented | go: pass<br>php: unsupported<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [근거](spec/compiler) |
| template-rust | Rust runtime | implemented | go: unsupported<br>php: unsupported<br>rust: pass<br>typescript: unsupported<br>python: unsupported | [근거](spec/compiler) |
| template-php | PHP runtime | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [근거](spec/compiler) |
| template-php-ext | C로 구현한 PHP native extension | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [근거](operations/testing) |
| template-python | Python 런타임 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: unsupported<br>python: pass | [Evidence](spec/compiler) |
| performance-measurements | Performance measurements | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](operations/benchmark) |
| showcase | Executable example site | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](operations/showcase) |
| generated-mode | Generated compiler mode | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/compiler) |
| docs-check | Documentation and generated contract checks | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/documentation) |
| release-test-matrix | Release verification matrix | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](operations/testing) |
| template-function-inventory | Template function inventory | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/template-functions) |
| template-language | 템플릿 언어 서비스, 포매터, CLI | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/editor-tools) |
| formatting | 모든 런타임의 토큰과 포매터(`tokens`, `format`) | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/formatting) |
| template-vscode | VS Code 확장 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/editor-tools) |
| template-lsp | 템플릿 언어 서버 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](spec/editor) |
| template-codemirror | CodeMirror 6 어댑터 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](spec/editor) |
| dependency-policy | Dependency policy | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](operations/dependencies) |
| template-function-contract | Canonical template function contract | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/functions) |
| object-and-class-calls | Assigned object and class function calls | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/ast) |
| bound-data | 여러 render를 위한 bound data | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/data-model) |

implemented 항목은 실행 가능한 검증과 언어별 문서 쌍이 필요하며 partial과 planned는 미완료 상태다.

[0.0.12](https://github.com/polyspec/template/releases/tag/v0.0.12)는 main 커밋 86edcaa1에서 공개됐으며 2026-10-27 04:40:32 UTC에 archive 9개를 발행했다. Go module tag `packages/go/v0.0.12`도 같은 커밋을 가리킨다.

검증: [CI 40450000056](https://github.com/polyspec/template/actions/runs/40450000056)의 worker 13개와 ci-passed, [gates 40450000190](https://github.com/polyspec/template/actions/runs/40450000190)가 통과했다. parity는 binding 253개를 두 번 실행해 사례 5,622개를 통과했고 API·binding 지적은 없다. CI 실행 8분 06초와 대기 8초가 걸렸다. 의존성 검토는 레지스트리 의존성 50개와 lock 8개에 수용하지 않은 새 안정 버전 미달이나 취약점 권고가 없음을 확인했다.

배포: [release 40450815462](https://github.com/polyspec/template/actions/runs/40450815462)는 tag archive 9개를 빌드하고 정확한 asset 목록을 검증했으며, commit된 consumer lock으로 archive 패키지 8개를 설치하고 wheel 의존성 그래프·Rust git consumer 빌드·Go module tag 해석을 검증한 뒤 공개했다. [Go release 40450815549](https://github.com/polyspec/template/actions/runs/40450815549)도 통과했다. 0.0.x 배포 정책상 registry에는 발행하지 않는다.

PHP 라이브러리 요구사항은 >=8.4.0(표기 >=8.4)을 유지하고 개발 검증은 8.4.27, Windows 설치 기준은 8.4.27-1이다.

문서 배포: [Pages 40453338233](https://github.com/polyspec/template/actions/runs/40453338233)이 ae6f7173의 [CI 40451767762](https://github.com/polyspec/template/actions/runs/40451767762) artifact를 [문서 사이트](https://polyspec.github.io/template/)에 성공적으로 배포했다. 첫 make 전에 설치 패키지 bootstrap과 선언한 PHP를 준비하며 모든 설치 workflow를 회귀 검사로 검증한다.

후보 0.0.13은 동기화한 manifest와 후보 자산 아홉 개, 네이티브 소비자 잠금 파일을 준비했다. Kit 0.0.64의 무결성을 잠그고 workflow 복사본을 동기화했다. 0.0.64는 [Kit 이슈 18](https://github.com/polyspec/kit/issues/18), [5](https://github.com/polyspec/kit/issues/5), [16](https://github.com/polyspec/kit/issues/16)의 공급자 수정을 공개하며, 그 수용에는 이 버전에서의 소비자 CI 실행이 필요하다. 이전 0.0.62 후보는 [CI 40735651886](https://github.com/polyspec/template/actions/runs/40735651886)과 [gates 40735651946](https://github.com/polyspec/template/actions/runs/40735651946)에서 검사 전에 실패했다. parity 열거가 bootstrap에서 Node를 만들기 전에 실행했기 때문이다. [Kit 이슈 15](https://github.com/polyspec/kit/issues/15)는 공개한 0.0.63 수정으로 닫혔으며 템플릿은 새 후보의 전체 CI를 통과해야 한다. 0.0.13 릴리즈 태그와 배포는 없다.

준비한 Composer manifest는 Kit 자산이 요구하는 명시적 버전을 유지한다. 이는 저장소의 태그 기반 버전 규칙과 충돌하며 [Kit 이슈 16](https://github.com/polyspec/kit/issues/16)이 릴리즈 수용 전에 필요한 자산·소비자 계약 수정을 추적한다.

새 0.0.63 [CI 40741569142](https://github.com/polyspec/template/actions/runs/40741569142)에서 공식 Go·PHP 바인딩 단계와 브라우저 작업이 통과했다. 템플릿 JSON 타입 단정, 네이티브 생성 순서와 showcase Cargo 잠금 누락이 드러났으며 수정 후 관련 회귀 검사와 공식 린트·다운로드 검증이 통과했다. 수정하지 않은 공급자 [gates 40741569064](https://github.com/polyspec/template/actions/runs/40741569064)는 깨끗한 discover를 통과했지만 따옴표가 포함된 모드 출력 때문에 parity 작업을 전부 건너뛰며 [Kit 이슈 18](https://github.com/polyspec/kit/issues/18)이 이를 추적한다. 표준 Go 탐색은 런타임 테스트가 통과했어도 테스트가 없는 showcase 앱 모듈의 성공을 거부하며 [Kit 이슈 5](https://github.com/polyspec/kit/issues/5)에 다중 모듈 근거를 추가했다. 전체 수용은 대기 중이다.

Source.error 확장 선언을 네 개 매개변수 계약으로 복구하고 arginfo를 다시 생성했다. PHP와 C 확장 각각에서 관련 단위 검사 11개·단언 70개와 공식 PHP·확장 린트가 통과했다. 공통 CI 도구 선언에는 workspace·테스트 marker 검사에 필요한 Go·Python을 추가했다. 이 변경은 새 전체 CI로 검증해야 한다.
