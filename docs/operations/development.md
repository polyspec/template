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
make rerun-failed
make owner-check
```

`make owner-check` runs the owner checks of the changed paths: the uncommitted changes, the paths of `PATHS`, or the paths changed since `BASE`. `scripts/owner-checks.json` declares, for globs of paths, the make targets and node test files that own them, and the tests that run for every change (`always`). Before any owner runs, the script fails on a tracked path that no rule owns, on a glob that matches no path, on a target that is not in the Makefile and on a target that runs the full suite; each failure names the path, the glob or the target. A rule with `variable` passes its changed paths to its targets: a change under `tests/cases` runs `make conformance-cases CASES="<paths>"`, which runs the AST conformance and the four generated conformance runners for those cases only, while `conformance-all-modes` runs every case in `make check`.

`make install` runs `npm ci`. npm installs every dependency as a copy and writes no bin link (`.npmrc`: `install-links=true`, `bin-links=false`): the root `package.json` declares the five packages of `packages/` as `file:` dependencies with overrides for the dependencies between them and holds the development tools of every package, and there are no npm workspaces, because npm always links a workspace. Each build target installs the npm copy of its package again after the build (`make build-ts` the copy of `@polyspec/template`, and so on), and the recipes start TypeScript, tsup, esbuild, Vitest, Playwright, ESLint, VitePress, vsce and vscode-tmgrammar-test with the file of their package (`scripts/tools.mjs` for the scripts). `tests/scripts/no-symlinks.test.mjs` fails on any symbolic link below `node_modules` or `vendor`.

`make build-ts`, `make build-language`, `make build-lsp`, `make build-codemirror` and `make build-vscode` run `scripts/build-package.mjs --package <package>`, which builds the package only when the hash of its inputs differs from the one recorded in `packages/<package>/dist.inputs.json`; otherwise it prints that `dist` is current, so one `make check` builds each package at most once. The inputs are the sources and configuration of the package, its manifest, the root `package-lock.json`, the installed copies of the packages of this repository that it depends on, and the version of Node.js. A build writes into `packages/<package>/dist.next-<pid>` and moves each file into `dist` with a rename, a file after the relative modules it imports, so the entries move last; then it removes the files of the previous build that the new one does not have. A reader of `dist`, such as another repository that copies a package or the next target of a run, never finds a file missing. Limit: a reader that reads several files while a build of changed sources publishes can combine files of the two builds, for example an entry of the previous build whose chunk the new build removed; a rebuild of unchanged inputs writes the same files. With `--install`, the npm copy in `node_modules` is installed again only when its files differ from the package, and in the same way: each file that differs is written into `node_modules/<name>.next-<pid>` and moves into the copy with a rename, a file after the relative modules it imports and `package.json` last, then the files that the package no longer has are removed, so a reader of the copy, such as another test file of the same `node --test` run, never finds a file missing. A change of the dependencies of a package is a change of `package-lock.json`: the install then fails and names `npm install` as the fix. `tests/scripts/build-package.test.mjs` builds and installs the packages that it depends on itself, so it passes on a checkout where nothing was built.

`make check` runs, through the guard described below, `docs-check`, `docs-static-check`, `test-scripts`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `feature-check`, `language-test-matrix`, `contract-check`, `function-contract-check`, `function-inventory-check`, `lint`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `conformance-all-modes`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser` and `showcase-check`. The last four are also release layers; they are part of `make check` because a change that passes `make check` must not fail the release matrix. A target whose package does not exist yet prints `not implemented` and exits with status 1. `lint` runs ESLint, gofmt, `cargo fmt --check` for the Rust crate, the PHP extension and the Rust showcase adapter, compiles the Rust showcase adapter with warnings as errors and runs Pint. `test-rust` and `test-ext` run clippy with warnings as errors on the Rust crate and on the PHP extension.

`make check` runs once per committed tree, when no task of `docs/plans/execution-checklist.md` is `[~]`. Before any step it starts `scripts/full-run.mjs`, which prints its decision with the reason (`[full-run] run: ...` or `[full-run] refuse: ...`) and refuses with status 1:

- while a task row of the checklist is `[~]`; the refusal lists each active ID with its task;
- while tracked files have uncommitted changes (`git status --porcelain --untracked-files=no`), because a full run verifies a committed tree;
- when `var/full-run.json` records a full run of the current tree (`git rev-parse HEAD^{tree}`); the refusal names that run with its commit, its start time and its result;
- while the process of an `incomplete` record still runs.

The guard runs each target of `CHECK_TARGETS` with `make <target>` to its end, also after a target fails, and prints `[full-run] start <target> (<n>/<total>)` and `[full-run] <target> passed|failed in <seconds> s`; no target has a time limit. It writes `var/full-run.json` before and after each target: the tree, the commit, the process, the start and end times, the result (`incomplete` until the last target ends, then `passed` or `failed`), the failed targets and each target with its status (`pending`, `running`, `passed`, `failed`), its times and its elapsed milliseconds. A run that is stopped therefore stays recorded as `incomplete`, with the target that was running. `var/` is ignored by Git, so each checkout and worktree has its own record. A commit that changes the tree permits a new full run when no task is `[~]`.

`make rerun-failed` reruns only the targets of the current tree that did not pass: the failed targets and the targets that an `incomplete` run did not finish. It is refused like `make check` for a task in progress, uncommitted changes and a running process, and also when there is no record, when the record belongs to another tree and when the full run of the tree passed. It writes each rerun into `reruns` of the record; when every target has passed, the result of the tree becomes `passed`.

The CI workflow (`.github/workflows/ci.yml`) runs the targets in separate jobs on each push to `main` and on each pull request; it does not run `make check`, so the guard does not decide CI runs. A push happens only when every active task is done. A new checkout, as in CI, has no record, so `make check` runs there when no task is `[~]` and the tree is clean.

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
