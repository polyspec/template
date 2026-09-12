# Feature status

[한국어](features.ko.md). Contracts are defined in the [specification](index.md). Verification and deployment are recorded separately. `pending` is not a passing result.

| ID | Feature | Implementation | Verification | Deployment | Evidence |
| --- | --- | --- | --- | --- | --- |
| spec | Lexical, grammar, expression, data model, function, runtime, AST, error and conformance specification | implemented | passed | not-deployed | [Specification](index.md) |
| ast-schema | JSON Schema for the AST and the schema checker | implemented | passed | not-deployed | [Schema](../schema/README.md) |
| conformance-suite | Fixture cases, expression fixtures, conformance runner and parity runner | implemented | passed | not-deployed | [Conformance](spec/conformance.md) |
| template-ts | TypeScript lexer, parser, renderer, functions and CLI | implemented | passed | not-deployed | [Package](../packages/template-ts/README.md) |
| template-browser | Browser build of the TypeScript package and browser rendering test | implemented | passed | not-deployed | [Browser test](../tests/browser/render.spec.ts) |
| template-go | Go lexer, parser, renderer, prepared render state, functions and CLI | implemented | passed | not-deployed | [Package](../packages/template-go/README.md) |
| template-rust | Rust lexer, parser, renderer, prepared render state, functions and CLI | implemented | passed | not-deployed | [Package](../packages/template-rust/README.md) |
| template-php | PHP lexer, parser, renderer, functions and CLI | implemented | passed | not-deployed | [Package](../packages/template-php/README.md) |
| template-php-ext | PHP extension built from the Rust crate | implemented | passed | not-deployed | [Package](../packages/template-php-ext/README.md) |
| performance-measurements | Equal-output AST and generated compile, process, render and RSS measurements | implemented | passed | not-deployed | [Performance measurements](operations/benchmark.md) |
| showcase | Shared templates, mock JSON assign data, direct path-based define registries, one committed canonical AST graph, parser-backed syntax highlighting, bounded artifact views and throughput artifacts | implemented | passed | not-deployed | [Example site](operations/showcase.md) |
| generated-mode | Host-language renderers lowered from canonical AST for TypeScript, Go, Rust and PHP | implemented | passed | not-deployed | [Compiler contract](spec/compiler.md) |
| docs-check | Document links, translation pairs, code blocks and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |

Verification on 2026-09-12: `make conformance-all-modes` passed all 1,688 core AST/generated cells for 211 canonical cases in TypeScript, Go, Rust and PHP. Generated runners compile and execute host-language artifacts and compare compile, input and positioned runtime diagnostics or exact UTF-8 output without an AST fallback. `make consumer-check` installed immutable npm, Go module, Cargo and Composer artifacts into isolated temporary projects and matched AST/generated output. `make showcase-check` passed five scenarios across five implementations, parser-backed highlighting, bounded source views, React island markup and failure recovery. `make bench` recorded 21 independent equal-output samples for compile, cold process, full render, prepared render and RSS. `make docs-check` passed 32 document pairs, 189 AST files, 53 expression ASTs and coverage of 332 public symbols and files. No package has been published.
