# Feature status

[한국어](/ko/features). Contracts are defined in the [specification](index.md). Verification and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| spec | Lexical, grammar, expression, data model, function, runtime, AST, error and conformance specification | implemented | passed | not-deployed | [Specification](index.md) |
| ast-schema | JSON Schema for the AST and the schema checker | implemented | passed | not-deployed | [Schema](https://github.com/polyspec/template/tree/main/schema) |
| conformance-suite | Fixture cases, expression fixtures, conformance runner and parity runner | implemented | passed | not-deployed | [Conformance](spec/conformance.md) |
| template-ts | TypeScript lexer, parser, renderer, functions and CLI | implemented | passed | not-deployed | [Package](https://github.com/polyspec/template/tree/main/packages/template-ts) |
| template-browser | Browser build of the TypeScript package and browser rendering test | implemented | passed | not-deployed | [Browser test](../tests/browser/render.spec.ts) |
| template-go | Go lexer, parser, renderer, prepared render state, functions and CLI | implemented | passed | not-deployed | [Package](https://github.com/polyspec/template/tree/main/packages/template-go) |
| template-rust | Rust lexer, parser, renderer, prepared render state, functions and CLI | implemented | passed | not-deployed | [Package](https://github.com/polyspec/template/tree/main/packages/template-rust) |
| template-php | PHP lexer, parser, renderer, functions and CLI | implemented | passed | not-deployed | [Package](https://github.com/polyspec/template/tree/main/packages/template-php) |
| template-php-ext | PHP extension built from the Rust crate | implemented | passed | not-deployed | [Package](https://github.com/polyspec/template/tree/main/packages/template-php-ext) |
| performance-measurements | Equal-output AST and generated compile, process, render and RSS measurements | implemented | passed | not-deployed | [Performance measurements](operations/benchmark.md) |
| showcase | Shared templates, mock JSON assign data, direct path-based define registries, one committed canonical AST graph, parser-backed syntax highlighting, bounded artifact views and throughput artifacts | implemented | passed | not-deployed | [Example site](operations/showcase.md) |
| generated-mode | Host-language renderers lowered from canonical AST for TypeScript, Go, Rust and PHP | implemented | passed | not-deployed | [Compiler contract](spec/compiler.md) |
| docs-check | Document links, translation pairs, code blocks and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |
| release-test-matrix | Seven-layer contract, unit, compiler, conformance, mutation, consumer, presentation and performance gate | implemented | passed | not-deployed | [Release testing](operations/testing.md) |
| dependency-policy | Latest compatible stable releases, machine-checked pin exceptions, locked advisory rejection and supported-runtime CI endpoints | implemented | passed | not-deployed | [Dependency policy](operations/dependencies.md) |

Verification on 2026-09-12: `make release-test-matrix` passed all seven layers. `make conformance-all-modes` passed all 1,688 core AST/generated cells for 211 canonical cases in TypeScript, Go, Rust and PHP, and the PHP extension passed 211 cases and 236 package tests. Generated runners compared compile, input and positioned runtime diagnostics or exact UTF-8 output without an AST fallback. Immutable npm, Go module, Cargo and Composer consumers matched AST/generated output; the browser and five-scenario static showcase passed. The 21-sample benchmark recorded compile, cold process, full render, prepared render and RSS after exact-output validation. `make docs-check` passed 34 document pairs, 189 AST files, 53 expression ASTs, 332 documented public symbols and files, and all 254 specification rules have machine-checked evidence. No package has been published.
