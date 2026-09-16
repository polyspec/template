# Release testing

[한국어](/ko/operations/testing).

The release gate runs with:

```sh
make release-test-matrix
```

It executes seven layers in order and stops at the first failure.

| Layer | Scope | Failure evidence |
| --- | --- | --- |
| Contracts | Manifest-generated declarations and Mermaid, document pairs, schemas, public API documentation, locked dependency advisories, format and static analysis | Structural drift, stale generated files, known dependency vulnerability, undocumented API or invalid source |
| Units | Lexer, parser, data model, functions, runtime, limits, artifact refresh and page cache in every core package | The smallest package and test identify the defect |
| Compiler | Canonical AST lifecycle, typed IR rejection, four generated backends and host compiler checks | The rejected IR node, stale artifact or target compiler diagnostic |
| Conformance | 216 canonical cases through four AST and four generated programs, plus the PHP extension support level | Exact language, mode, case and output or structured diagnostic difference |
| Regressions | Positioned errors, failure recovery, request immutability and mutations of interfaces, artifacts and benchmark hashes | A known bad mutation is accepted or recovery changes output |
| Consumers | Immutable npm, Go module, Cargo and Composer packages, plus browser DOM output | Package installation, public import or consumer output failure |
| Presentation and performance | Static example HTML, parser-backed highlighting, bounded source views, documentation idempotence and a fresh equal-output benchmark smoke run | Invalid HTML, stale site, unequal second build or invalid measurement row |

The complete mode matrix contains 1,728 core cells: 216 cases × two compiler modes × four languages. Success cases compare exact UTF-8 bytes. Failure cases compare the error code, message, template name and source position. Generated execution is also checked for parser, AST interpreter and fallback references before its host source is accepted.

The language test matrix is declared in `contracts/features.json`. Its semantic features must declare pass support for TypeScript, Go, Rust and PHP, and its required checks must cover both `ast` and `gen`. `make language-test-matrix` rejects a missing feature, language declaration or test path; `make conformance-all-modes`, `make function-contract-check` and `make generated-native-check` provide the executable coverage.

Mutation tests are required evidence. They damage an interface operation, an artifact digest or an output hash and require the corresponding validator to fail. A validator that accepts its mutation fails the release gate.

Every specification rule has one machine-checked evidence route. Canonical fixtures directly cover executable language behavior. Rules about schemas, host binding, public runtime structure, compiler artifacts and publication boundaries are listed in `tests/rule-evidence.json` with their verification command and concrete test files. An unknown rule, missing evidence file, duplicate non-fixture assignment or rule with no route fails `make rules-check`.

The short performance run is a correctness regression, not a stable speed score. It creates three fresh samples for every language-mode row, verifies output identity and validates all metric fields without replacing the committed 21-sample report.

Before publication, `make release-check` requires a clean source worktree, creates a detached temporary worktree at `HEAD`, installs the locked JavaScript dependencies and browser, and runs the complete release matrix there. The matrix prepares the locked PHP dependencies before its first contract check, and the extension test target prepares its own dependencies. The temporary checkout is removed whether the matrix succeeds or fails.
