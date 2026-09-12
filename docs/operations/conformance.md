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

`make conformance` builds every package whose directory exists and runs all cases. The runner prints one row per case and implementation and exits with status 1 when a comparison fails. `parity.mjs` compares the implementations with each other and does not read expected files.

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

`--update html` and `--update error` write the expected output from the TypeScript implementation. Review a generated file against the specification before committing it.

## Add an expression fixture

Add an entry to `tests/fixtures/expr/cases.json` with `name`, `expr`, `tokens`, `ast` and `cases`, or `name`, `expr` and `error`. Spans count bytes from the start of `expr`. Every implementation loads the file in its unit tests.
