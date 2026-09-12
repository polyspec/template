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
| benchmarks | Throughput comparison of the four implementations with output equality and repeatability checks | implemented | passed | not-deployed | [Benchmark results](../tools/bench/results.md) |
| showcase | Shared templates, mock JSON assign data, direct path-based define registries, committed per-language AST artifacts, AST/generated execution-mode contract, support-level contracts, static HTML structure checks and throughput artifacts | implemented | passed | not-deployed | [Example site](operations/showcase.md) |
| generated-mode | Host-language renderers lowered from canonical AST with parity checks across TypeScript, JavaScript, Go, Rust and PHP | implemented | passed | not-deployed | [Runtime modes](spec/runtime.md#support-levels-and-compiled-artifacts) |
| docs-check | Document links, translation pairs, code blocks and status checks | implemented | passed | not-deployed | [Documentation procedure](operations/documentation.md) |

Verification on 2026-09-12: `make docs-check` passed with 30 document pairs; `node scripts/check-schema.mjs` validated 189 AST files and 53 expression ASTs; documentation coverage reported 250 documented public symbols and files; `make check` passed lint, the four package unit suites and 1055 of 1055 conformance checks over 211 cases and five implementations; `make test-browser` passed in Chromium; `make test-ext` built the PHP extension and passed 211 of 211 conformance cases and 236 extension tests; `make bench BENCH_ITERS=3000 BENCH_WARMUP=300` passed its output equality and repeatability checks and wrote the benchmark table.

Verification after simplifying the examples: `make showcase` passed all 25 pairs across five scenarios and five implementations and wrote 125 benchmark samples. Every scenario renders `layout` directly. The page composition output is 376 bytes with SHA-256 `6de7a00c32889afe300a9e9ba10ac57520c60e4aceda3bbc6f257c9213856782`; it demonstrates the two direct define paths, assign values, a loop and a conditional. `make showcase-check` passed fresh render comparisons and browser checks for the mock assign data, define registry and template display. `make docs-check` passed with 30 document pairs, 189 AST files, 53 expression ASTs and coverage of 250 public symbols and files. Consumer application integration is a separate task. No package has been published.

Verification after defining the cross-language contract: `make showcase` passed the same 25 pairs with direct path `define.json` entries, preserving all five scenario output hashes. `make docs-check` passed the runtime contract diagrams, the four language examples and 30 document pairs. The build now rejects a scenario that does not use the canonical assign and define shapes.

Verification after enforcing the adapter contract: `node scripts/check-showcase-contract.mjs` passed manifest generation, generated declarations, source method order, TypeScript compilation, Go interface compilation and formatting, Rust trait compilation, PHP reflection, runtime assertion rejection, five scenario requests and repeat-after-failure hashes across TypeScript, JavaScript, Go, Rust and PHP. `make docs-check` passed the synchronized Mermaid contract and 30 document pairs.
