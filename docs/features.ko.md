<!-- doc-id: docs-features -->
<!-- source-sha256: 1005ce268455db248189c5528bb75aa5bd1095d769351d0bc17cc9087ebaaa99 -->
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
