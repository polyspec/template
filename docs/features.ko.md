<!-- doc-id: docs-features -->
<!-- source-sha256: f9920ce22699a8efd050b63e15b937a9993331f9842ec41bb73ff80fe1e9441d -->
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
| performance-measurements | Performance measurements | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](operations/benchmark) |
| showcase | Executable example site | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: partial | [근거](operations/showcase) |
| generated-mode | Generated compiler mode | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/compiler) |
| docs-check | Documentation and generated contract checks | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/documentation) |
| release-test-matrix | Release verification matrix | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: partial | [근거](operations/testing) |
| template-function-inventory | Template function inventory | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/template-functions) |
| template-language | 템플릿 언어 서비스, 포매터, CLI | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/editor-tools) |
| formatting | 모든 런타임의 토큰과 포매터(`tokens`, `format`) | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/formatting) |
| template-vscode | VS Code 확장 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](operations/editor-tools) |
| template-lsp | 템플릿 언어 서버 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](spec/editor) |
| template-codemirror | CodeMirror 6 어댑터 | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [근거](spec/editor) |
| dependency-policy | Dependency policy | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: unsupported | [근거](operations/dependencies) |
| template-function-contract | Canonical template function contract | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/functions) |
| object-and-class-calls | Assigned object and class function calls | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [근거](spec/ast) |
| bound-data | 여러 render를 위한 bound data | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: partial | [근거](spec/data-model) |

implemented 항목은 실행 가능한 검증과 언어별 문서 쌍이 필요하며 partial과 planned는 미완료 상태다.

릴리스 후보 0.0.12의 매니페스트와 네이티브 lock 파일을 동기화하고 PHP CLI를 포함한 배포 파일 후보 9개를 로컬에서 빌드했다. 버전 범위 검사, 선택한 도구와 Python API 단위 테스트, 타입 검사와 문서 검사가 로컬에서 통과했다. 후보는 main에 통합했다. 깨끗한 CI 환경에서 정확히 고정된 의존성 그래프 및 전체 릴리스 매트릭스 검증은 남아 있다. 후보 배포 파일은 준비 산출물이며 공개된 릴리스가 아니다.
