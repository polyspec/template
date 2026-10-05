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
make install
make help
make check
```

`make install` runs `npm ci`. npm installs every dependency as a copy and writes no bin link (`.npmrc`: `install-links=true`, `bin-links=false`): the root `package.json` declares the five packages of `packages/` as `file:` dependencies with overrides for the dependencies between them and holds the development tools of every package, and there are no npm workspaces, because npm always links a workspace. Each build target installs the npm copy of its package again after the build (`make build-ts` the copy of `@polyspec/template`, and so on), and the recipes start TypeScript, tsup, esbuild, Vitest, Playwright, ESLint, VitePress, vsce and vscode-tmgrammar-test with the file of their package (`scripts/tools.mjs` for the scripts). `tests/scripts/no-symlinks.test.mjs` fails on any symbolic link below `node_modules` or `vendor`.

`make check` runs `docs-check`, `docs-static-check`, `test-scripts`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `feature-check`, `language-test-matrix`, `contract-check`, `function-contract-check`, `lint`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `conformance-all-modes`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser` and `showcase-check`. The last four are also release layers; they are part of `make check` because a change that passes `make check` must not fail the release matrix. A target whose package does not exist yet prints `not implemented` and exits with status 1. `lint` runs ESLint, gofmt, `cargo fmt --check` for the Rust crate, the PHP extension and the Rust showcase adapter, compiles the Rust showcase adapter with warnings as errors and runs Pint. `test-rust` and `test-ext` run clippy with warnings as errors on the Rust crate and on the PHP extension.

`test-go`, `test-rust` and `test-php` run `go test`, `cargo test` and PHPUnit through `scripts/run-tests.mjs`; `test-ts`, `test-language`, `test-lsp` and `test-codemirror` run vitest and `test-vscode` runs `node --test` through it. The runner prints each test when it starts, every 5 s while it runs and when it passes, fails or is skipped, with its elapsed time, and stops the tool when a test outlives its own timeout (30 s, `--timeout <seconds>`); no package, file or whole run has a time limit. `cargo test` runs one test at a time, so each test prints its start before its result. PHPUnit also stops a test after 10 s (`enforceTimeLimit`, `failOnRisky`). `test-scripts` runs the tests of the runner in `tests/scripts/`.

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
5. Run the Red and Green tests that own the change and `make docs-check`.
6. Commit with a message that names the action, the subject and the object.
