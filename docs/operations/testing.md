<!-- doc-id: docs-operations-testing -->
# Release testing

[한국어](/ko/operations/testing).

The release gate runs with:

```sh
make release-test-matrix
```

It runs the full suite of `make check` through the same guard `node_modules/@polyspec/kit/dist/full-run.mjs`: every target of `CHECK_TARGETS` in the `Makefile`, each with `make <target>` to its end, whether an earlier target failed or not, and it records the result of each target with its elapsed time in `var/full-run.json`. `CHECK_TARGETS` is the one list of the full suite; `make check`, `make release-test-matrix` and `make release-check` run it, and the jobs of the CI workflow run each of its targets in exactly one job with `make ci-targets` and upload their reports. The guard runs once per tree, so after `make check` on a tree `make release-test-matrix` refuses that tree and names its run; `make rerun-failed` reruns the targets that did not pass. The targets cover seven layers:

| Layer | Scope | Failure evidence |
| --- | --- | --- |
| Contracts | Manifest-generated declarations and Mermaid, document pairs, schemas, public API documentation, locked dependency advisories, format and static analysis | Structural drift, stale generated files, known dependency vulnerability, undocumented API or invalid source |
| Units | Lexer, parser, data model, functions, runtime, limits, artifact refresh and page cache in every core package | The smallest package and test identify the defect |
| Compiler | Canonical AST lifecycle, typed IR rejection, five generated backends and host compiler checks | The rejected IR node, stale artifact or target compiler diagnostic |
| Conformance | Every canonical case of `tests/cases` through five AST and five generated programs, plus the PHP extension support level | Exact language, mode, case and output or structured diagnostic difference |
| Regressions | Positioned errors, failure recovery, request immutability and mutations of interfaces, artifacts and benchmark hashes | A known bad mutation is accepted or recovery changes output |
| Package installs | Immutable npm, Go module, Cargo, Composer and Python wheel packages, plus browser DOM output | Package installation, public import or install project output failure |
| Presentation and performance | Static example HTML, parser-backed highlighting, bounded source views, documentation idempotence and a fresh equal-output benchmark smoke run | Invalid HTML, stale site, unequal second build or invalid measurement row |

The complete mode matrix crosses every canonical case with two compiler modes and five languages. Success cases compare exact UTF-8 bytes. Failure cases compare the error code, message, template name and source position. Generated execution is also checked for parser, AST interpreter and fallback references before its host source is accepted.

The implementations and the shared suites are declared in `config/parity.json` (CNF-11): TypeScript, Go, Rust, PHP, the PHP extension and Python hold the conformance cases and the expression vectors. `make parity-declarations-check` checks the declaration without running anything, and `make parity-check` runs the native test of each implementation that binds a suite; `make conformance-all-modes`, `make function-contract-check` and `make generated-native-check` provide the coverage of both modes.

Mutation tests are required evidence. They damage an interface operation, an artifact digest or an output hash and require the corresponding validator to fail. A validator that accepts its mutation fails the release gate.

Every specification requirement is cited by a unit of `config/parity.json`, and the test of each implementation of the unit names it (or the `case.json` of a case lists it). A requirement that no unit cites, an id that the specification does not define and a cited id that no test names fail `make parity-declarations-check`.

The package install check creates its packages, install projects, Go module cache and Cargo targets in one new directory of the system temporary directory and removes that directory when the check ends, whether the install projects pass or fail. Go creates the module cache with `-modcacherw`, because it creates module cache files read-only by default and a recursive removal cannot remove them. A removal that fails fails the check with the path of the directory. `scripts/check-install-workspace.mts` runs before the install projects and proves both conditions. The install projects read no source of the network and use the toolchains of the checkout: the Go install project resolves modules only from the proxy of the run with `GOSUMDB=off`, `GOTOOLCHAIN=local` and the go directive of `packages/go/go.mod`; the Rust install project builds with a copy of `rust-toolchain.toml` and `cargo run --locked` with a lock derived from `packages/rust/Cargo.lock`; the PHP install project reads no repository other than the package of the run (`tests/scripts/package-installs.test.mts`). Both scripts run each command, such as `npm pack`, `go mod tidy`, `cargo run` or `composer install`, as a step without a time limit (`scripts/test-progress/step.mts`): the step prints its start, the output of the command and its result with the elapsed time on standard error and fails when the command exits with a nonzero status.

The short performance run is a correctness regression, not a stable speed score. It creates three fresh samples for every language-mode row, verifies output identity and validates all metric fields without replacing the committed 21-sample report.

Before publication, `make release-check` requires a clean source worktree, creates a detached temporary worktree at `HEAD`, installs the locked JavaScript dependencies and browser, and runs the complete release matrix there. Each target prepares its own dependencies, such as the locked PHP dependencies. The temporary checkout is removed whether the matrix succeeds or fails.
