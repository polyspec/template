# Conformance

[한국어](/ko/operations/conformance).

The conformance suite verifies that every implementation produces the same AST, the same output and the same error fields for the cases in `tests/cases/`. The contract is in the [conformance specification](../spec/conformance.md).

## Run the suite

```sh
make conformance
node tests/runner/conformance.mjs --langs ts,go
node tests/runner/conformance.mjs --case loop/meta-fields
node tests/runner/parity.mjs
```

`make conformance` builds every package and runs all cases; a missing package fails the run. The runner prints `<case> [<lang>] pass|fail (<ms> ms)` when a case finishes in an implementation, then a summary table with one row per case and implementation, and exits with status 1 when a comparison fails. `parity.mjs` compares the implementations with each other and does not read expected files. A runner builds the CLI of each implementation before the cases (`tests/runner/drivers.mjs`), also when a binary is present, because it may be built from older sources; the build does nothing when its inputs are unchanged. The runner executes the Go and Rust CLIs and loads the PHP extension from `var/build`, where `scripts/publish-build.mjs` publishes a build only when its bytes change: cargo links `target/release` again on every build, go build writes a new file, and macOS checks a new executable file on its first run, which took 29.8 s for the Rust CLI on a loaded machine and failed the 10 s limit of a call. `make build-go`, `make build-rust` and `make ext` publish to the same files. It is a step without a time limit, which prints its start, the output of the build and its result with the elapsed time on standard error and fails when the build exits with a nonzero status; each CLI call has a timeout of 10 s. `make delimiter-matrix` renders a template with every valid ASCII delimiter pair and with quoted delimiter characters in every language, prints `<pair> [<lang>] pass|fail (<ms> ms)` when a pair finishes in a language, and prints the number of checks at the end.

`make conformance-generated-ts`, `make conformance-generated-go`, `make conformance-generated-rust`, `make conformance-generated-php` and `make conformance-generated-python` run the generated program of every case; `--case <group>/<name>` or `--case <group>` selects cases. Each case prints its start and its result with its elapsed time and has its own deadline of 30 s. The Go and Rust runners run the case tests through `scripts/run-tests.mjs`; a Go case is the package `case_<case id>` and a Rust case is the test `case_<case id>`, with each run of characters other than letters and digits written as `_`. The PHP runner stops `php -l` and the process of a case at the deadline. The Python runner stops `python3 -m py_compile` and the process of a case at the deadline. The TypeScript runner runs `tsc` once as a step without a time limit, prints its start, a line every 5 s while it runs and its result with the elapsed time, fails when `tsc` exits with a nonzero code, and renders each case in a worker.

## Add a case

1. Create `tests/cases/<group>/<name>/` with `input.tpl`, `case.json` (`rules` and `stage`), and `data.json`, `define.json`, `env.json`, `options.json` or additional templates as needed.
2. Write `expected.html` or `expected.error.json` by hand from the specification.
3. Generate `expected.ast.json` with the TypeScript implementation and review it:

```sh
node tests/runner/conformance.mjs --langs ts --case <group>/<name> --update ast
node scripts/check-schema.mjs
node scripts/check-rules.mjs
```

4. Run the suite for every implementation.

`scripts/check-schema.mjs` fails when a case whose `input.tpl` parses has no `expected.ast.json`, and when a case that expects a lexical or parse error of `input.tpl` has one (CNF-15). `make schema-check`, `make docs-check` and therefore `make check` run it.

`--update html` and `--update error` write the expected output from the TypeScript implementation. Review a generated file against the specification before committing it.

## Add an expression fixture

Add an entry to `tests/fixtures/expr/cases.json` with `name`, `expr`, `tokens`, `ast` and `cases`, or `name`, `expr` and `error`. Spans count bytes from the start of `expr`. Every implementation loads the file in its unit tests.
