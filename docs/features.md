<!-- doc-id: docs-features -->
# Feature status

The table records the status of each feature. The implementations and the units that each holds are declared in `config/parity.json`, which `make parity-check` checks against the tree (CNF-11).

| ID | Feature | Status | Client support | Evidence |
|---|---|---|---|---|
| spec | Template language specification | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/lexical) |
| ast-schema | Canonical AST schema | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/ast) |
| conformance-suite | Cross-language conformance suite | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](operations/conformance) |
| template-ts | TypeScript runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](spec/compiler) |
| template-browser | Browser ESM runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/browser) |
| template-go | Go runtime | implemented | go: pass<br>php: unsupported<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [Evidence](spec/compiler) |
| template-rust | Rust runtime | implemented | go: unsupported<br>php: unsupported<br>rust: pass<br>typescript: unsupported<br>python: unsupported | [Evidence](spec/compiler) |
| template-php | PHP runtime | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [Evidence](spec/compiler) |
| template-php-ext | PHP native extension in C | implemented | go: unsupported<br>php: pass<br>rust: unsupported<br>typescript: unsupported<br>python: unsupported | [Evidence](operations/testing) |
| template-python | Python runtime | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: unsupported<br>python: pass | [Evidence](spec/compiler) |
| performance-measurements | Performance measurements | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](operations/benchmark) |
| showcase | Executable example site | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](operations/showcase) |
| generated-mode | Generated compiler mode | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/compiler) |
| docs-check | Documentation and generated contract checks | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/documentation) |
| release-test-matrix | Release verification matrix | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](operations/testing) |
| template-function-inventory | Template function inventory | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/template-functions) |
| template-language | Template language service, formatter and CLI | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/editor-tools) |
| formatting | Tokens and formatter of every runtime (`tokens`, `format`) | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/formatting) |
| template-vscode | VS Code extension | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](operations/editor-tools) |
| template-lsp | Template language server | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](spec/editor) |
| template-codemirror | CodeMirror 6 adapter | implemented | go: unsupported<br>php: unsupported<br>rust: unsupported<br>typescript: pass<br>python: unsupported | [Evidence](spec/editor) |
| dependency-policy | Dependency policy | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](operations/dependencies) |
| template-function-contract | Canonical template function contract | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/functions) |
| object-and-class-calls | Assigned object and class function calls | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/ast) |
| bound-data | Bound data for several renders | implemented | go: pass<br>php: pass<br>rust: pass<br>typescript: pass<br>python: pass | [Evidence](spec/data-model) |

An implemented feature requires executable verification and paired documentation; partial and planned are incomplete.

Release [0.0.12](https://github.com/polyspec/template/releases/tag/v0.0.12) is public at main commit 86edcaa1, with nine archives published on 2026-10-27 at 04:40:32 UTC. The Go module tag `packages/go/v0.0.12` names the same commit.

Verification: [CI 40450000056](https://github.com/polyspec/template/actions/runs/40450000056) passed all thirteen workers and ci-passed; [gates 40450000190](https://github.com/polyspec/template/actions/runs/40450000190) passed. Parity ran 253 bindings twice and passed 5,622 cases with no remaining API or binding findings. CI execution took 8m06s plus an 8s queue. The dependency review covers 50 registry dependencies and eight locks without unaccepted newer releases or advisories.

Deployment: [release 40450815462](https://github.com/polyspec/template/actions/runs/40450815462) built the nine tagged archives, verified their exact asset set, installed eight archive packages with the committed consumer locks, checked the wheel dependency graph, built the Rust git consumer and resolved the Go module tag before making the release public. [Go release 40450815549](https://github.com/polyspec/template/actions/runs/40450815549) also passed. Registry publication remains outside the 0.0.x distribution policy.

The PHP library requirement stays >=8.4.0 (written >=8.4); development verification uses 8.4.27 and the Windows installation baseline is 8.4.27-1.

Documentation deployment: [Pages 40453338233](https://github.com/polyspec/template/actions/runs/40453338233) successfully publishes the artifact of [CI 40451767762](https://github.com/polyspec/template/actions/runs/40451767762) at ae6f7173 to the [documentation site](https://polyspec.github.io/template/). The installed-package bootstrap and declared PHP are prepared before the first make; all installing workflows have regression coverage.

Candidate 0.0.13 is prepared with Kit 0.0.62 official parity phases, synchronized manifests and native consumer locks. Owning PHP exception tests pass in both implementations, and workflow/configuration checks pass locally. Full candidate [CI 40735651886](https://github.com/polyspec/template/actions/runs/40735651886) and [gates 40735651946](https://github.com/polyspec/template/actions/runs/40735651946) fail before checks: Make enumerates parity targets with the checkout Node before bootstrap creates it. [Kit issue 15](https://github.com/polyspec/kit/issues/15) tracks the provider fix. No 0.0.13 release tag or deployment exists; complete exact-main CI and publication proofs remain required.

The prepared Composer manifests retain explicit versions required by Kit archives. This conflicts with the repository tag-derived version rule; [Kit issue 16](https://github.com/polyspec/kit/issues/16) tracks the required archive/consumer contract correction before release acceptance.
