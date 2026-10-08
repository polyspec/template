# Feature status

The executable source is [contracts/features.json](../contracts/features.json). Each entry defines inputs, outputs, state transitions, errors, client support, fixtures, tests, verification commands and paired documentation.

| ID | Feature | Status | Client support | Evidence |
|---|---|---|---|---|
| spec | Template language specification | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/lexical) |
| ast-schema | Canonical AST schema | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/ast) |
| conformance-suite | Cross-language conformance suite | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/conformance) |
| template-ts | TypeScript runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](spec/compiler) |
| template-browser | Browser ESM runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/browser) |
| template-go | Go runtime | implemented | go: pass<br>php: unsupported<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [Evidence](spec/compiler) |
| template-rust | Rust runtime | implemented | go: unsupported<br>php: unsupported<br>rust: pass<br>typescript: unsupported<br>python: unsupported | [Evidence](spec/compiler) |
| template-php | PHP runtime | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [Evidence](spec/compiler) |
| template-php-ext | PHP native extension in C | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [Evidence](operations/testing) |
| performance-measurements | Performance measurements | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: unsupported | [Evidence](operations/benchmark) |
| showcase | Executable example site | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: partial | [Evidence](operations/showcase) |
| generated-mode | Generated compiler mode | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/compiler) |
| docs-check | Documentation and generated contract checks | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/documentation) |
| release-test-matrix | Release verification matrix | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: partial | [Evidence](operations/testing) |
| template-function-inventory | Template function inventory | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/template-functions) |
| template-language | Template language service, formatter and CLI | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/editor-tools) |
| template-vscode | VS Code extension | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/editor-tools) |
| template-lsp | Template language server | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](spec/editor) |
| template-codemirror | CodeMirror 6 adapter | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](spec/editor) |
| dependency-policy | Dependency policy | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: unsupported | [Evidence](operations/dependencies) |
| template-function-contract | Canonical template function contract | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/functions) |
| object-and-class-calls | Assigned object and class function calls | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/ast) |
| bound-data | Bound data for several renders | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: partial | [Evidence](spec/data-model) |

Run `make feature-check` to validate every contract and referenced path. An implemented feature requires executable verification and paired documentation; partial and planned are incomplete.
