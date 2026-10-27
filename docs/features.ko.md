<!-- doc-id: docs-features -->
<!-- source-sha256: 9676ed8181c02072352002a580aaf77fa346c416caf11913ae3de00e2442fc08 -->
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
| release-test-matrix | Release verification matrix | implemented | go: partial<br>php: partial<br>rust: partial<br>typescript: partial<br>python: partial | [근거](operations/testing) |
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

릴리스 후보 0.0.12의 매니페스트와 네이티브 lock 파일은 동기화했다. 기존 배포 파일 후보 9개는 현재 SDK 수정 이전의 산출물이므로 다시 빌드하고 검증해야 한다. 후보는 공개하지 않았다.

main 232028be의 TypeScript·Rust·PHP·Python·browser·generated program·showcase·delimiter CI job과 Python bound-map·merge 사례는 통과했다. CI 40448062183과 gates 40448062181은 도구 분류 누락, vector 이동 뒤 테스트가 없는 네이티브 패키지, Rust 리터럴 이름 오타 한 곳을 거부했다. 후보는 세 원인을 정정하고 의존성 검토를 갱신했으며 변경 커밋의 전체 CI가 필요하다. 공개 API 감사는 기존 미선언 424건이나 signature type 누출을 더 이상 보고하지 않는다. 개발 검증은 PHP 8.4.27을 사용하고 라이브러리 요구사항은 >=8.4.0(표기 >=8.4), Windows 설치 기준은 8.4.27-1로 유지한다.
