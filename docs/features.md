# Feature status

The executable source is [contracts/features.json](../contracts/features.json). Each entry defines inputs, outputs, state transitions, errors, client support, fixtures, tests, verification commands and paired documentation.

| ID | Feature | Status | Client support | Evidence |
|---|---|---|---|---|
| spec | Template language specification | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](spec/lexical.md) |
| ast-schema | Canonical AST schema | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](spec/ast.md) |
| conformance-suite | Cross-language conformance suite | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](spec/conformance.md) |
| template-ts | TypeScript runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass | [Evidence](spec/compiler.md) |
| template-browser | Browser ESM runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass | [Evidence](operations/browser.md) |
| template-go | Go runtime | implemented | go: pass<br>php: unsupported<br>rust: unsupported<br>typescript: unsupported | [Evidence](spec/compiler.md) |
| template-rust | Rust runtime | implemented | go: unsupported<br>php: unsupported<br>rust: pass<br>typescript: unsupported | [Evidence](spec/compiler.md) |
| template-php | PHP runtime | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported | [Evidence](spec/compiler.md) |
| template-php-ext | PHP native extension | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported | [Evidence](operations/testing.md) |
| performance-measurements | Performance measurements | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](operations/benchmark.md) |
| showcase | Executable example site | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](operations/showcase.md) |
| generated-mode | Generated compiler mode | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](spec/compiler.md) |
| docs-check | Documentation and generated contract checks | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass | [Evidence](operations/documentation.md) |
| release-test-matrix | Release verification matrix | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](operations/testing.md) |
| dependency-policy | Dependency policy | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass | [Evidence](operations/dependencies.md) |

Run `make feature-check` to validate every contract and referenced path. An implemented feature requires executable verification and paired documentation; partial and planned are incomplete.
