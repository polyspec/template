# 개발

[English](/operations/development).

## 툴체인

| 도구 | 버전 | 출처 |
| --- | --- | --- |
| Node.js | 26.8.1 | `.node-version` |
| npm | 11 이상 | Node.js에 포함 |
| Go | 1.27.1 | `packages/template-go`의 `go.mod`; `GOTOOLCHAIN`이 내려받음 |
| Rust | rustfmt와 clippy를 포함한 1.98.1 | `rust-toolchain.toml`; rustup으로 설치, Makefile이 `~/.cargo/bin`을 `PATH`에 추가 |
| PHP | composer 2를 포함한 8.5 | `packages/template-php/composer.json` |

`packages/template-php-ext`의 Rust PHP 바인딩은 PHP 8.5를 지원한다. macOS에서는 확장을 로드하는 PHP 바이너리가 PHP 심볼을 제공하므로 확장을 `-Wl,-undefined,dynamic_lookup`으로 링크하며, 이 인자는 패키지의 빌드 스크립트가 내보낸다.

## 명령

```sh
make install
make help
make check
```

`make install`은 `npm ci`를 실행한다. npm은 모든 의존성을 사본으로 설치하고 bin link를 쓰지 않는다(`.npmrc`: `install-links=true`, `bin-links=false`). root `package.json`은 `packages/`의 다섯 package를 그 사이의 의존성에 대한 override와 함께 `file:` 의존성으로 선언하고 모든 package의 개발 도구를 가지며, npm은 workspace를 언제나 link하므로 npm workspace는 없다. 각 build target은 build 뒤 그 package의 npm 사본을 다시 설치하고(`make build-ts`는 `@polyspec/template`의 사본 등), recipe는 TypeScript, tsup, esbuild, Vitest, Playwright, ESLint, VitePress, vsce, vscode-tmgrammar-test를 그 package의 파일로 실행한다(script는 `scripts/tools.mjs`). `tests/scripts/no-symlinks.test.mjs`는 `node_modules`나 `vendor` 아래의 symbolic link 하나에도 실패한다.

`make check`는 `docs-check`, `docs-static-check`, `test-scripts`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `feature-check`, `language-test-matrix`, `contract-check`, `function-contract-check`, `lint`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `conformance-all-modes`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser`, `showcase-check`를 실행한다. 마지막 네 개는 릴리스 계층이기도 하다. `make check`를 통과한 변경이 릴리스 매트릭스에서 실패하면 안 되므로 `make check`에 포함한다. 패키지가 아직 없는 타겟은 `not implemented`를 출력하고 상태 1로 종료한다. `lint`는 ESLint, gofmt, Rust 크레이트·PHP 확장·Rust showcase adapter의 `cargo fmt --check`를 실행하고, Rust showcase adapter를 경고를 오류로 처리해 컴파일하며, Pint를 실행한다. `test-rust`와 `test-ext`는 Rust 크레이트와 PHP 확장에 경고를 오류로 처리하는 clippy를 실행한다.

`test-go`, `test-rust`, `test-php`는 `go test`, `cargo test`, PHPUnit을 `scripts/run-tests.mjs`로 실행하고, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`는 vitest를, `test-vscode`는 `node --test`를 이 runner로 실행한다. runner는 각 test가 시작할 때, 실행 중에는 5 s마다, 통과·실패·건너뜀으로 끝날 때 경과 시간과 함께 출력하고, test가 자기 timeout(30 s, `--timeout <seconds>`)을 넘으면 도구를 멈춘다. package, 파일, 실행 전체에는 시간 제한이 없다. `cargo test`는 test를 하나씩 실행하므로 각 test는 결과 전에 시작을 출력한다. PHPUnit도 10 s가 지난 test를 멈춘다(`enforceTimeLimit`, `failOnRisky`). `test-scripts`는 `tests/scripts/`에 있는 runner의 test를 실행한다.

언어별 명령:

```sh
make test-ts
make test-go
make test-rust
make test-php
node tests/runner/conformance.mjs --langs ts,go
node tests/runner/parity.mjs
```

## 변경 절차

1. `docs/spec/`의 명세와 `.ko.md` 파일을 수정한다.
2. `tests/cases/`의 픽스처 케이스와 `tests/fixtures/expr/`의 표현식 픽스처를 추가하거나 수정한다.
3. 패키지에 실패 테스트를 추가하고, 코드를 수정하고, 테스트를 유지한다.
4. `docs/features.md`, `docs/features.ko.md`, `CHANGELOG.md`, `CHANGELOG.ko.md`를 갱신한다.
5. 변경을 소유한 Red와 Green test와 `make docs-check`를 실행한다.
6. 동작, 주체, 대상을 명시한 메시지로 커밋한다.
