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
npm ci
make help
make check
```

`make check`는 `docs-check`, `lint`, `test-ts`, `test-go`, `test-rust`, `test-php`, `conformance`를 실행한다. 패키지가 아직 없는 타겟은 `not implemented`를 출력하고 상태 1로 종료한다.

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
5. 변경된 모든 패키지의 테스트와 `make docs-check`를 실행한다.
6. 동작, 주체, 대상을 명시한 메시지로 커밋한다.
