<!-- doc-id: docs-index -->
# Documents

[한국어](/ko/).

[Usage guide](guide.md) shows how to write and render a template.

## Specification

| Document | Topic |
| --- | --- |
| [`spec/lexical.md`](spec/lexical.md) | Source encoding, tag start rule, escape, comment, tag end, standalone line removal |
| [`spec/grammar.md`](spec/grammar.md) | Tag grammar, block structure, closing rules |
| [`spec/expressions.md`](spec/expressions.md) | Expression tokens, grammar, precedence, evaluation |
| [`spec/data-model.md`](spec/data-model.md) | Value types, host binding, number formatting, truthiness, equality |
| [`spec/functions.md`](spec/functions.md) | Built-in functions and host function registration |
| [`spec/runtime.md`](spec/runtime.md) | Engine API, scope, include, block, loader, modes, limits, escaping |
| [`spec/compiler.md`](spec/compiler.md) | Typed compiler, manifest and generated programs |
| [`spec/ast.md`](spec/ast.md) | AST nodes and JSON serialization |
| [`spec/errors.md`](spec/errors.md) | Error object and error codes |
| [`spec/conformance.md`](spec/conformance.md) | Fixture layout, CLI contract, comparison rules |
| [`spec/examples.md`](spec/examples.md) | Complete page example |
| [`spec/editor.md`](spec/editor.md) | Language service, LSP server and editor adapters |

The [execution plan](plans/execution-plan.md) states the waves, their dependencies and causes, the exit criteria, the definition of done and its evidence. The [execution checklist](plans/execution-checklist.md) lists the tasks, their verification and their states.

## Status and procedures

- [Feature status](features.md)
- [Development](operations/development.md)
- [Conformance](operations/conformance.md)
- [Release testing](operations/testing.md)
- [Dependency policy](operations/dependencies.md)
- [Browser rendering](operations/browser.md)
- [Formatter, language server and editors](operations/editor-tools.md)
- [Example site](operations/showcase.md)
- [Performance measurements](operations/benchmark.md)
- [Template function inventory](operations/template-functions.md)
- [Publication](operations/publication.md)
- [Documentation](operations/documentation.md)
