# Execution plan

[한국어](/ko/plans/execution-plan).

This document plans the delivery of the template engine: the specification, the conformance suite, the TypeScript, Go, Rust and PHP implementations, the PHP extension, the browser build, benchmarks and documentation. Tasks are grouped into waves; each section states the dependencies of a wave, the cause of its tasks and its exit criteria. Tasks inside a wave marked `parallel` are independent of each other. A wave starts only when its listed dependencies are complete.

The tasks of each wave, their verification and their states are in the [execution checklist](execution-checklist.md).

## Dependency overview

```
W0 foundation ──► W1 specification (parallel docs) ──► W1.11 spec review
                                                        │
                                                        ▼
                                          W2 conformance assets (parallel)
                                                        │
                                                        ▼
                                          W3 TypeScript (sequential core, parallel leaves)
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       ▼                                ▼                                ▼
                 W4.G Go track                    W4.R Rust track                  W4.P PHP track
                       └────────────────────────────────┼────────────────────────────────┘
                                                        ▼
                                         W4.X cross-language gate (make check)
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                           ▼
                                   W5 PHP extension            W6 bench, docs site, status
                                          └─────────────┬─────────────┘
                                                        ▼
                                              W7 package installation
```

## Wave 0 — Repository foundation (sequential)

Dependencies: none. Each task depends on the previous one.

Exit criteria: `make docs-check` passes; `make help` lists every target; first commit exists.

## Wave 1 — Specification (parallel)

Dependencies: T0.2, T0.5. Tasks T1.1–T1.10 are `parallel`. T1.11 runs after all of them. Each document is an English file plus a `.ko.md` file with the same content. Every normative rule carries an identifier (`LEX-1`, `GRM-4`, `EXP-12`, `VAL-3`, `FUN-7`, `RT-5`, `AST-2`, `ERR-9`, `CNF-1`) so fixtures and tests can cite it.

Exit criteria: all ten document pairs exist; `make docs-check` passes; `schema/ast.schema.json` validates against its meta-schema.

## Wave 2 — Conformance assets (parallel)

Dependencies: T1.11. All tasks are `parallel`. Fixture ASTs are written by hand for at least the cases marked `AST by hand`; the remaining `expected.ast.json` files are produced by T3.13 and reviewed before commit.

Exit criteria: at least 80 cases enumerated; every hand-written AST validates; every spec rule ID appears in at least one case.

## Wave 3 — TypeScript implementation

Dependencies: T2.1, T2.2, T2.4, and the fixture tasks. Package `packages/template-ts`, npm name `@polyspec/template`. Source in `src/`, tests in `tests/`. Marked tasks are `parallel`; others follow their dependencies.

Exit criteria: `make test-ts`, `npm run lint`, `node tests/runner/conformance.mjs --langs ts` and `make test-browser` pass; `docs/features.md` rows `template-ts` and `template-browser` set to `implemented`/`passed`.

## Wave 4 — Go, Rust and PHP implementations (three parallel tracks)

Dependencies: T3.13 (reviewed ASTs) and T3.15. The three tracks are independent. Inside a track the order is fixed. Each track mirrors the TypeScript module split and keeps tests separate from code.

### Cross-language gate (sequential after the three tracks)

Exit criteria: `make check` passes on a clean checkout.

## Wave 5 — PHP extension (sequential)

Dependencies: T4.R.11, T4.P.11.

Exit criteria: `make ext` builds; `extension_loaded('polyspec_template')` is true; conformance passes for `php-ext`.

## Wave 6 — Benchmarks, documentation site, status (parallel)

Dependencies: T4.X.2. Tasks T6.1–T6.5 and T6.7 are `parallel`; T6.6 follows them.

T6.2 is complete. `scripts/check-doc-coverage.mjs` runs from `make doc-coverage` and `make docs-check`; the checker reports 250 documented public symbols and files (template-ts 55, template-go 58, template-php 25, template-rust 1, files 111).

T6.7 covers shared layouts, nested partials and loops, define data and scope precedence, an HTML slot and a missing definition. It follows RT-43–RT-53: every scenario uses the same JSON-shaped assign and direct path-based define registry for every implementation, and every render starts from the `layout` target. The adapter types, fields, operations and state transitions are declared in `tools/compiler/interface.json`; the generator writes language declarations and Mermaid sources, and `make contract-check` verifies the mapped implementations and failure recovery. `make showcase` compares raw output and repeated-render hashes across five implementations, compares AST programs with product compiler artifacts, and writes HTML, JSON and same-condition mode benchmark artifacts. `make showcase-check` verifies the artifacts and static HTML page. The example has no controller or service dependency.

T6.6 is complete. On 2026-09-11, `make check` passed; `make test-ext` built the PHP extension and passed 216 of 216 conformance cases and 236 extension tests; `make showcase` passed output equality and repeatability checks. The feature status and changelog record these results.

Exit criteria: `make check`, `make showcase-check`, and `make docs-verify-idempotent` pass.

## Wave 7 — Generated compiler completion and package installation

Dependencies: T4.X.2. All verification is self-contained in this repository. Package install checks install immutable package artifacts into isolated temporary projects and depend on no checkout outside this repository.

## Wave 8 — Assigned object and class function execution

Dependencies: T7.1 and the canonical AST parser changes. This wave is incomplete until native instances can be assigned and the same member and class calls execute in every runtime and generated program.

## Wave 9 — Template comments in the AST

Dependencies: none. A tool that reads every comment of a template reads them from the parser, because a comment produces no statement node.

## Wave 10 — Install check workspace removal

Dependencies: none. A finished package install check left its temporary directory, 243 MB each time, because the Go module cache files are read-only and the removal failure was ignored.

## Wave 11 — Editor language service, LSP server and CodeMirror adapter

Dependencies: none. Every editor rule moves into one language service, and each editor reaches it through an adapter that only converts positions and registers features ([editor support](../spec/editor.md)). A task runs in the branch `feat/<shortname>-<id>` and the worktree `template-<shortname>-<id>`; both are removed as soon as the task is merged into `main`.

T11.1 to T11.6 are complete. On 2026-10-02, `make check` passed on commit "Refresh the generated artifact digests after the lockfile change" of the branch `feat/language-T11.2`, including `editor-boundary-check`, `test-language`, `test-lsp`, `test-codemirror`, `test-vscode` and `test-vscode-integration`; `rules-check` reported no uncovered rule.

## Wave 12 — Ternary with an identifier before the colon

Dependencies: none. `c ? a : b` is a valid expression (EXP-7, EXP-13), but the TypeScript expression parser reads an identifier followed by `:` as the start of a class call `Class::method()` and fails with `unexpected token "b"`; `c ? 1 : 2` and `c ? (a) : b` parse. The task runs in the branch `fix/ternary-T12.1` and the worktree `template-ternary-T12.1`.

## Wave 13 — Four task states

Dependencies: none. Every checklist uses the four task states that AGENTS defines: waiting, in progress, done, and bypassed with a cause and a retry condition. This checklist marked a done task with the letter x and a blocked task with the waiting marker followed by `blocked: <reason>`, and `scripts/check-documents.mjs` accepted only those.

## Wave 14 — Data binding cost

Dependencies: none. Host binding checks every string, map key and define id with `Utf8::firstInvalid`, a loop in PHP that reads one byte per step. Binding a map of 1442 strings (49 KB, mostly Korean text) took 1.16 ms, of which the loop took 1.01 ms; `mb_check_encoding` gives the same result in 0.02 ms. A renderer that renders one document as several templates binds the same data once per render. The tasks run in the branch `fix/utf8-T14.1` and the worktree `template-utf8-T14.1`.

## Wave 15 — Binding errors that differ between runtimes

Dependencies: none. The runtimes differed from the T14.2 specification in two places. Rust fails with E_DATA_UNSUPPORTED_TYPE on a null `assign` (`bind_map` in `value/bind.rs`), and so does the PHP extension (`php_to_map` in `convert.rs`), while TypeScript, Go and PHP render it as an empty map, as RT-4 states. A typed generated program reports a request that does not match its declared types with `\InvalidArgumentException` in PHP, `Error` in TypeScript and an `error` of `fmt.Errorf` in Go, as ERR-13 states, while Rust reports it as E_DATA_UNSUPPORTED_TYPE. T14.2 found a third: the Go typed generated program reads an absent optional field as the zero value of its type, so `??` does not apply.

## Wave 16 — Concurrent renders

Dependencies: none. VAL-22 states that renders may read one bound map concurrently, but the specification does not state whether renders may share one program. The Go AST program reads and writes its template cache without a lock, so concurrent renders of one program race (`go test -race`, `render/engine.go`, the cache read and write in `LoadTemplate`).

## Wave 17 — Test runs

Dependencies: none. Each test prints its start, its result and its elapsed time while the run goes on and has its own timeout; the whole suite runs once, when every active task is done. AGENTS required `make check` before any task was marked done, and `AGENTS.ko.md` lacked the section "Decision and acceptance rules". `test-go` limited each package to 120 s; `test-rust` and `test-php` gave a test no timeout and printed nothing while it ran. The conformance runner printed its table only after the last case. The four generated conformance runners ran all cases in one `go test` or `cargo test` call under one 600 s limit, or in their own process without a limit, and printed only a final count. The VS Code integration runner waited for each VS Code launch, each profile installation and each check without a limit. The tasks run in the branch `fix/test-runs-T17.1` and the worktree `template-test-runs-T17`. A long-running operation (a build, `tsc`, an installation, a VS Code download, installation or launch, a whole run) prints step logs and has no timeout, because a time limit fails a normal run that is slower than expected; T17.4 and T17.5 gave `tsc`, the profile installations and the launches deadlines, and the driver build and the package install checks also had time limits. `tests/runner/delimiter-matrix.mjs` printed one line after its last case, and the unit tests of `test-ts`, `test-language`, `test-lsp`, `test-codemirror` and `test-vscode` did not run through `scripts/run-tests.mjs`. T17.6 to T17.10 run in the branch `test/no-deadline-T17.6` and the worktree `template-no-deadline-T17.6`. T17.1-1 runs in the branch `test/full-run-T17.1-1` and the worktree `template-full-run-T17.1-1`. AGENTS stated that a push happens only when every active task is done, and nothing enforced it; T17.1-3 refuses such a push with a tracked pre-push hook and fails the CI job `push-gate` for such a commit, in the branch `feat/push-gate-T17.1-3` and the worktree `template-push-gate-T17.1-3`.

## Wave 18 — Test resources of one run

Dependencies: none. Two concurrent runs of one checkout or of different checkouts replaced or reset a resource that another run was using. `tests/browser/server.mjs` listened on the fixed port `127.0.0.1:4173`, so a second run failed with `EADDRINUSE`, and Playwright loaded the page from that port whichever server held it. `packages/template-vscode/tests/integration/run.mjs` downloads and unpacks VS Code into `.vscode-test` at the repository root, which every session in one checkout shares, and `make clean` removed that directory while a run used it. A resource of a run is isolated by the run (a port that the system assigns, a temporary directory, a name of the run). A resource that exists once has one holder at a time, recorded in a lock file that is created atomically and names the checkout, the process ID and the start time of the holder; another run fails with that holder, the holder releases the lock, and a lock whose process has ended is reported and removed by an explicit command. The tasks run in the branch `fix/shared-T18.1` and the worktree `template-shared-T18.1`.

## Wave 19 — Results that one tree decides

Dependencies: none. The checks had ten classes of defects: the result of a check also depended on the time, the network, the machine and the leftovers of earlier runs: the package install check resolved crates and Go toolchains from the network and built the Rust install project with the default toolchain of the machine, Go switched itself to a downloaded toolchain, the test runner hid the compile errors of Go and passed a run without tests, targets read PHP dependencies and package builds that they did not create, owner checks missed the targets that read a changed path, outputs were replaced by removal and rewriting, recipes stopped at their first failing command and several failures named no expected value. Each task reproduces one class at its smallest boundary, fixes it everywhere in the repository and keeps the test; AGENTS states the ten rules.

## Wave 20 — Tests that share nothing with other runs

Dependencies: none. In one `node --test` run of `make test-scripts` the test files run at once, and checks that wrote into the checkout, looked up a command on PATH or left processes behind failed by the timing of other files: a runner's temporary files in the repository root failed the owner check of every tracked path, the browser test's slow server stub was not certain to run and its assertion on the inode of `dist` met the prerequisite build of T18.8-2, and a temporary directory was removed while a stub's child process still wrote into it. Each check now keeps its files under the system temporary directory, receives its commands explicitly and waits for the processes it starts.

## Wave 21 — PHP extension in C

Dependencies: none. The PHP extension `packages/template-php-ext` wrapped the Rust implementation with ext-php-rs, so it was not an implementation of its own and depended on cargo, a Rust toolchain and the bindings of ext-php-rs for every PHP version. It becomes an independent implementation in C whose specification is the PHP implementation `packages/template-php` and the conformance cases: its sources, `config.m4` and the stub of its classes are in `src/`, gen_stub.php generates the arginfo from the stub, and phpize, configure and make build it. The tasks add the parser, the renderer with JSON data, the binding of PHP values, and then replace the Rust extension in the targets, the runners and CI.

## Wave 22 — Tag releases

Dependencies: none. Every change reaches `main` through the merge queue with the required checks, so every commit of `main` passed the full suite, and a release is a tag of a commit of `main` that the maintainer sets after a version-bump pull request. The changelog held the entries of the tag `v0.0.1` under `## Unreleased`; the module path of `packages/template-go/go.mod` was `github.com/polyspec/template`, which `go get` does not resolve to that directory; the ruleset `main` named every job of `ci.yml`, so a new job was not required until the ruleset named it; and no workflow ran on a tag. Exit criteria: the changelog keeps `## Unreleased` above `## 0.0.1`, the module path is `github.com/polyspec/template/packages/template-go`, the ruleset requires exactly `push-gate` and `ci-passed`, and `.github/workflows/release.yml` creates the GitHub Release of a tag only for a commit of `main` whose checks passed, whose manifests carry the version of the tag and whose changelog has its section.

## Parallelism summary

| Wave | Parallel groups | Sequential constraints |
| --- | --- | --- |
| W0 | none | T0.1 → T0.7 in order |
| W1 | T1.1–T1.10 | T1.11 after all |
| W2 | T2.1–T2.18 | none |
| W3 | {T3.2, T3.3, T3.4}, {T3.6, T3.9} with T3.5, {T3.14, T3.15, T3.16} | T3.1 → T3.5 → T3.7 → T3.10 → T3.11 → T3.12 → T3.13 |
| W4 | tracks G, R, P | inside each track: 1 → 11; T4.X after all tracks |
| W5 | none | T5.1 → T5.6 |
| W6 | T6.1–T6.5, T6.7 | T6.6 after all |
| W7 | T7.1 → T7.2 → {T7.3, T7.5} → {T7.4, T7.6, T7.7} → T7.8 → T7.9 → T7.10 → T7.11 | compiler contract and implementation precede proof and publication |
| W8 | T8.1 → {T8.2, T8.3} → T8.4 → {T8.5, T8.6, T8.7} → T8.8 → T8.5-1 → T8.5-2 | runtime support precedes parity and publication |
| W9 | none | T9.1 |
| W10 | none | T10.1 |
| W11 | T11.3 → T11.4 alongside T11.5 | T11.1 → T11.2 → the parallel group → T11.6 |
| W14 | none | T14.1 → T14.2 |
| W15 | T15.1, T15.2, T15.3, T15.4 | none |
| W16 | none | T16.1 |
| W17 | none | T17.1 → T17.2 → {T17.3, T17.4, T17.5} → T17.6 → {T17.4-1, T17.5-2, T17.7, T17.8, T17.9, T17.10, T17.11} → T17.1-1 → T17.1-2 → T17.1-3 → T17.1-5 → T17.1-6 → T17.1-7 → T17.1-9 → T17.1-10 |
| W18 | T18.1, T18.2, T18.3, T18.4, T18.5, T18.6 | none |
| W19 | none | T19.1 → T19.15 in order; T19.6-1 after T19.11; T19.8-1 after T19.15 |
| W20 | T20.1, T20.2, T20.3 | T20.3-1 after T20.3; T20.1-1 after T20.3-1; T20.1-2 after T20.1-1; T20.1-3 after T20.1-2; T20.1-4 after T20.1-3; T20.1-5 after T20.1-4; T20.1-6 after T20.1-5; T20.1-7 after T20.1-6; T20.1-8 after T20.1-7; T20.1-9 after T20.1-8; T20.1-10 after T20.1-9; T20.1-11 after T20.1-10; T20.1-12 after T20.1-11; T20.1-13 after T20.1-12 |
| W21 | none | T21.1 → T21.2 → T21.3 → T21.4 → T21.4-1 → T21.4-2 |
| W22 | none | T22.1-1 → T22.1-2 → T22.1-3 → T22.1-4 → T22.1 → T22.2 → T22.2-1 → T22.2-2 → T22.2-3 → T22.3 → T22.3-1 → T22.3-2 |

## Definition of done

- Every task in W0–W11 is `done`.
- `make check` passes on a clean checkout with Node 26.8.1, Go 1.27.1, Rust 1.98.1 and PHP 8.5.
- `node tests/runner/parity.mjs` reports zero divergence across `ts`, `go`, `rust`, `php` and, when built, `php-ext`.
- `make test-browser` passes.
- `make conformance-all-modes` passes every TypeScript, Go, Rust and PHP mode-language-case cell (two modes × four languages × every canonical case: 1,968 cells with the 246 cases of T9.1) without a fallback from generated execution to AST execution.
- `make release-test-matrix` proves each release layer independently: units, generated-source compilation, conformance, positioned errors and failure recovery, mutation rejection, isolated install projects, browser DOM output and performance parity.
- `make install-check`, `make showcase-check`, `make docs-verify-idempotent` and `make release-check` pass in a clean checkout.
- `docs/features.md` and `docs/features.ko.md` carry identical status fields with evidence links for every row.

Evidence of 2026-10-02, with Node 26.8.1, Go 1.27.1 (from the `go.mod` toolchain line), Rust 1.98.1 and PHP 8.5.10:

- `make check` passed with status 0 in a new checkout of commit "Make template tags stand out in VS Code whatever the color theme is" after `npm ci`, with the Makefile change of the commit that records this evidence. That run found that `runtime-interface-check` and `compiler-interface-check` did not install the PHP dependencies they use; both now depend on `build-php`. `make check` includes `test-browser`, `conformance-all-modes`, `install-check`, `showcase-check` and the documentation status check since commit "Repair the release checks broken by the host value changes and run them in make check".
- `node tests/runner/parity.mjs` reported that 244 of 244 cases agree across `ts`, `go`, `rust`, `php` and `php-ext` on commit "Make template tags stand out in VS Code whatever the color theme is".
- `make conformance-all-modes` passed all 1,952 cells without a fallback; `make test-browser`, `make install-check`, `make showcase-check` and `make docs-verify-idempotent` passed.
- `make release-check` passed on commit "Make template tags stand out in VS Code whatever the color theme is": it ran `make release-test-matrix`, all seven layers, in an isolated clean checkout.
