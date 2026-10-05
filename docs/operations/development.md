# Development

[한국어](/ko/operations/development).

## Toolchain

| Tool | Version | Source |
| --- | --- | --- |
| Node.js | 26.8.1 | `.node-version` |
| npm | 12.2.0 | `packageManager` of `package.json`; `make install-tools` installs it into `var/tools` |
| Go | 1.27.1 | the go directive of `packages/template-go/go.mod`; `make install-tools` installs it into `var/tools` |
| Rust | 1.98.1 with rustfmt and clippy | `rust-toolchain.toml`; installed with rustup, `~/.cargo/bin` is added to `PATH` by the Makefile |
| PHP | 8.2 or 8.5 | `config/toolchain.json`, the minor version; the patch of each run is recorded in `var/full-run.json` |
| Composer | 2.10.3 | `config/toolchain.json` |
| make | not pinned | GNU Make 3.81 or later |

`make install-tools` (`scripts/install-tools.mjs`) installs npm with the npm of the machine into `var/tools/npm` and downloads Go as the module `golang.org/toolchain@v0.0.1-go<version>.<os>-<arch>` with the Go of the machine into the module cache `var/tools/go`; it writes wrapper scripts, never symbolic links, into `var/tools/bin` and skips an install when the exact version is present. The npm and Go of the machine are not changed. The Makefile puts `var/tools/bin` first on `PATH` and exports `GOTOOLCHAIN=local`, so go never downloads another toolchain. GNU Make 3.81 starts a recipe line without shell syntax itself and finds its program with the `PATH` that make started with, not the exported one, also when `SHELL` names another shell; a recipe therefore starts npm as `$(NPM)`, the path of its wrapper, and go and gofmt only in lines with shell syntax, which the shell runs with the exported `PATH`. `tests/scripts/toolchain-files.test.mjs`, which `make owner-check` runs for every change, fails with the expected and the actual version when Node.js, npm, Go, Rust, the PHP minor version or Composer of the recipes differs from these files.

PHP is pinned by its minor version: setup-php, which installs PHP in CI, installs the latest patch of a minor version and cannot pin a patch. Each full run records the versions it ran on, the PHP patch included, in `environment` of `var/full-run.json`. Composer is pinned exactly (`composer:2.10.3` in the workflows). make is not pinned: the Makefile uses no construct newer than GNU Make 3.81, and make 3.81 and GNU Make 4.4.1 printed the same commands for every target (T17.1-4). The CI jobs run on `ubuntu-24.04`, pin every action by its commit and install with `make install`; setup-go provides the Go that bootstraps `make install-tools`.

The Rust PHP binding of `packages/template-php-ext` supports PHP 8.5; on macOS the extension is linked with `-Wl,-undefined,dynamic_lookup`, which the build script of the package emits, because the PHP binary that loads the extension provides the PHP symbols.

## Commands

```sh
make install
make help
make check
make rerun-failed
make owner-check
```

`make owner-check` runs the owner checks of the changed paths: the uncommitted changes, the paths of `PATHS`, or the paths changed since `BASE`. `scripts/owner-checks.json` declares, for globs of paths, the make targets and node test files that own them, and the tests that run for every change (`always`). `inputs` of the same file declares, for each check target, the globs of the paths that it reads, such as `packages/template-go/**` for `lint-go` and `tools/compiler/**` for `conformance-generated-go`; every path of an input needs a rule that selects the target or a target that runs it as a prerequisite, so a change of the path runs every check that reads it. Before any owner runs, the script fails on a tracked path that no rule owns, on an input path whose rules do not select its target, on a glob that matches no path, on a target that is not in the Makefile and on a target that runs the full suite; each failure names the path, the glob or the target. A rule with `variable` passes its changed paths to its targets: a change under `tests/cases` runs `make conformance-cases CASES="<paths>"`, which runs the AST conformance and the four generated conformance runners for those cases only, while `conformance-all-modes` runs every case in `make check`.

`make install` runs `make install-tools`, `npm ci` and `rustup toolchain install --no-self-update`, which installs the Rust toolchain that `rust-toolchain.toml` names and changes nothing when it is installed. The Makefile exports `RUSTUP_AUTO_INSTALL=0`, and the CI workflows set it, so rustup never installs a toolchain on the first cargo: the test files of one `node --test` run start cargo at once, and their concurrent installs broke each other (T18.7-1); a missing toolchain fails with rustup's message `toolchain '...' is not installed`, which names `rustup toolchain install`. npm installs every dependency as a copy and writes no bin link (`.npmrc`: `install-links=true`, `bin-links=false`): the root `package.json` declares the five packages of `packages/` as `file:` dependencies with overrides for the dependencies between them and holds the development tools of every package, and there are no npm workspaces, because npm always links a workspace. Each build target installs the npm copy of its package again after the build (`make build-ts` the copy of `@polyspec/template`, and so on), and the recipes start TypeScript, tsup, esbuild, Vitest, Playwright, ESLint, VitePress, vsce and vscode-tmgrammar-test with the file of their package (`scripts/tools.mjs` for the scripts). `tests/scripts/no-symlinks.test.mjs` fails on any symbolic link below `node_modules` or `vendor`.

`make build-ts`, `make build-language`, `make build-lsp`, `make build-codemirror` and `make build-vscode` run `scripts/build-package.mjs --package <package>`, which builds the package only when the hash of its inputs differs from the one recorded in `packages/<package>/dist.inputs.json`; otherwise it prints that `dist` is current, so one `make check` builds each package at most once. The inputs are the sources and configuration of the package, its manifest, the root `package-lock.json`, the installed copies of the packages of this repository that it depends on, and the version of Node.js. A build writes into `packages/<package>/dist.next-<pid>` and moves each file into `dist` with a rename, a file after the relative modules it imports, so the entries move last; then it removes the files of the previous build that the new one does not have. A reader of `dist`, such as another repository that copies a package or the next target of a run, never finds a file missing. Limit: a reader that reads several files while a build of changed sources publishes can combine files of the two builds, for example an entry of the previous build whose chunk the new build removed; a rebuild of unchanged inputs writes the same files. With `--install`, the npm copy in `node_modules` is installed again only when its files differ from the package, and in the same way: each file that differs is written into `node_modules/<name>.next-<pid>` and moves into the copy with a rename, a file after the relative modules it imports and `package.json` last, then the files that the package no longer has are removed, so a reader of the copy, such as another test file of the same `node --test` run, never finds a file missing. A change of the dependencies of a package is a change of `package-lock.json`: the install then fails and names `npm install` as the fix. `tests/scripts/build-package.test.mjs` builds and installs the packages that it depends on itself, so it passes on a checkout where nothing was built.

`make check` runs, through the guard described below, `docs-check`, `docs-static-check`, `test-scripts`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `feature-check`, `language-test-matrix`, `contract-check`, `function-contract-check`, `function-inventory-check`, `lint`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `conformance-all-modes`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser` and `showcase-check`. The last four are also release layers; they are part of `make check` because a change that passes `make check` must not fail the release matrix. Every target of the full suite and of its prerequisites runs at most one command: a target with several checks names them as prerequisites, such as `lint-go` and `lint-php` of `lint`, and the Makefile sets `MAKEFLAGS += -k`, so make runs every check after a failed one and fails at the end; a prerequisite that fails keeps the targets that depend on it from running. The scripts that check each language (`scripts/check-generated-*.mjs`, `scripts/check-typed-generator.mjs`, `scripts/check-package-installs.mjs`) run every language through `checkLanguages` of `scripts/language-checks.mjs` and name every language that failed. `tests/scripts/failure-accumulation.test.mjs` checks these rules. `lint` runs ESLint, gofmt, `cargo fmt --check` for the Rust crate, the PHP extension and the Rust showcase adapter, compiles the Rust showcase adapter with warnings as errors and runs Pint. `test-rust` and `test-ext` run clippy with warnings as errors on the Rust crate and on the PHP extension.

`make check` runs once per committed tree, when no task of `docs/plans/execution-checklist.md` is `[~]`. Before any step it starts `scripts/full-run.mjs`, which prints its decision with the reason (`[full-run] run: ...` or `[full-run] refuse: ...`) and refuses with status 1:

- while a task row of the checklist is `[~]`; the refusal lists each active ID with its task;
- while tracked files have uncommitted changes (`git status --porcelain --untracked-files=no`), because a full run verifies a committed tree;
- when `var/full-run.json` records a full run of the current tree (`git rev-parse HEAD^{tree}`); the refusal names that run with its commit, its start time and its result;
- while the process of an `incomplete` record still runs;
- while the guard of another run holds `var/full-run.json.lock`, the holder lock of the record (`scripts/holder-lock.mjs`), which a guard takes before it reads the record and releases after its last write, also when a target throws, so two guards never decide on the same record or write it in turn; the refusal names the holder, and `node scripts/holder-lock.mjs clear var/full-run.json.lock` removes a lock whose process has ended.

The guard runs each target of `CHECK_TARGETS` with `make -k <target>` to its end, also after a target fails, and prints `[full-run] start <target> (<n>/<total>)` and `[full-run] <target> passed|failed in <seconds> s`; no target has a time limit. It writes `var/full-run.json` before and after each target: the tree, the commit, the process, the start and end times, the versions of Node.js, npm, Go, cargo, PHP and Composer on `PATH` (`environment`, also for each rerun), the result (`incomplete` until the last target ends, then `passed` or `failed`), the failed targets and each target with its status (`pending`, `running`, `passed`, `failed`), its times and its elapsed milliseconds. A run that is stopped therefore stays recorded as `incomplete`, with the target that was running. `var/` is ignored by Git, so each checkout and worktree has its own record. A commit that changes the tree permits a new full run when no task is `[~]`.

`make rerun-failed` reruns only the targets of the current tree that did not pass: the failed targets and the targets that an `incomplete` run did not finish. It is refused like `make check` for a task in progress, uncommitted changes and a running process, and also when there is no record, when the record belongs to another tree and when the full run of the tree passed. It writes each rerun into `reruns` of the record; when every target has passed, the result of the tree becomes `passed`.

The CI workflow (`.github/workflows/ci.yml`) runs the targets in separate jobs on each push to `main` and on each pull request; it does not run `make check`, so the guard does not decide CI runs. A push happens only when every active task is done. A new checkout, as in CI, has no record, so `make check` runs there when no task is `[~]` and the tree is clean.

`test-go`, `test-rust`, `test-php` and `test-ext` run `go test`, `cargo test` and PHPUnit through `scripts/run-tests.mjs`, `test-ext` with `--php-extension`, which loads the built extension into the PHP of PHPUnit; `test-ts`, `test-language`, `test-lsp` and `test-codemirror` run vitest and `test-vscode` runs `node --test` through it. The runner prints each test when it starts, every 5 s while it runs and when it passes, fails or is skipped, with its elapsed time, and stops the tool when a test outlives its own timeout (30 s, `--timeout <seconds>`); no package, file or whole run has a time limit. `cargo test` runs one test at a time, so each test prints its start before its result. PHPUnit also stops a test after 10 s (`enforceTimeLimit`, `failOnRisky`). A Go package that does not build prints its compiler output and `✖ build of <package> failed`, and the summary line names the compiler errors. A run in which no test ran fails with `no test ran`; a test does not skip itself when what it needs is not built, it builds it, and the conformance runners run every language unless `--langs` names them, failing on an absent package. `test-scripts` runs the tests of the runner in `tests/scripts/`.

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
