# Development

[한국어](/ko/operations/development).

## Toolchain

| Tool | Version | Source |
| --- | --- | --- |
| Node.js | 26.8.1 | `.node-version` |
| npm | 11 or later | bundled with Node.js |
| Go | 1.27.1 | `go.mod` of `packages/template-go`; `GOTOOLCHAIN` downloads it |
| Rust | 1.98.1 with rustfmt and clippy | `rust-toolchain.toml`; installed with rustup, `~/.cargo/bin` is added to `PATH` by the Makefile |
| PHP | 8.5 with composer 2 | `packages/template-php/composer.json` |

The Rust PHP binding of `packages/template-php-ext` supports PHP 8.5; on macOS the extension is linked with `-Wl,-undefined,dynamic_lookup`, which the build script of the package emits, because the PHP binary that loads the extension provides the PHP symbols.

## Commands

```sh
npm ci
make help
make check
```

`make check` runs `docs-check`, `docs-static-check`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `feature-check`, `language-test-matrix`, `contract-check`, `function-contract-check`, `lint`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `conformance-all-modes`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser` and `showcase-check`. The last four are also release layers; they are part of `make check` because a change that passes `make check` must not fail the release matrix. A target whose package does not exist yet prints `not implemented` and exits with status 1. `lint` runs ESLint, gofmt, `cargo fmt --check` for the Rust crate, the PHP extension and the Rust showcase adapter, compiles the Rust showcase adapter with warnings as errors and runs Pint. `test-rust` and `test-ext` run clippy with warnings as errors on the Rust crate and on the PHP extension.

Single-language commands:

```sh
make test-ts
make test-go
make test-rust
make test-php
node tests/runner/conformance.mjs --langs ts,go
node tests/runner/parity.mjs
```

## Change procedure

1. Change the specification in `docs/spec/` and its `.ko.md` file.
2. Add or change the fixture cases in `tests/cases/` and the expression fixtures in `tests/fixtures/expr/`.
3. Add a failing test in the package, change the code, and keep the test.
4. Update `docs/features.md`, `docs/features.ko.md`, `CHANGELOG.md` and `CHANGELOG.ko.md`.
5. Run the tests of every changed package and `make docs-check`.
6. Commit with a message that names the action, the subject and the object.
