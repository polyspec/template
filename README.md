# Template

[한국어](README.ko.md).

Template is a template language defined by one specification. Implementations in TypeScript, Go, Rust and PHP are included, with a native PHP extension for the same engine. Each implementation renders a template from its AST, and the typed compiler turns templates into generated programs in the four languages that render the same output. Current status is in [Feature status](docs/features.md).

A template consists of text and tags. A tag starts with `{` followed by one of the symbols `= @ ? :? : / + # ?# * %`, or with `{` followed by an assignment. Any other `{` is text.

```
<h1>{= title}</h1>
{@ item = items}
<p class="{? item.index_ == 0}first{/}">{= item.name} {= item.price | number}</p>
{:}
<p>No items.</p>
{/}
{# footer.tpl year}
```

## Start

```sh
npm ci
make check
make showcase
```

`make help` lists every target. `make check` runs the document, rule and contract checks, lint, the unit tests of every package, the formatter and editor tests, the cross-language conformance suite in AST and generated modes, and the browser, package install and example site checks.

## Editor support

One language service holds every editor rule, and each editor reaches it through an adapter ([Editor support](docs/spec/editor.md)).

| Package | Use |
| --- | --- |
| `@polyspec/template-language` | the language service `openDocument()`, the formatter `format()` and the command `template-fmt` |
| `@polyspec/template-lsp` | the Language Server Protocol server `template-lsp` for every editor with an LSP client |
| `@polyspec/template-codemirror` | the CodeMirror 6 extension `template()` |
| `polyspec-template` | the VS Code extension, a client of the bundled language server |

`make vscode-install` installs the VS Code extension, and `make install-cli` installs `template-fmt` as a script under `CLI_PREFIX` (`~/.local/bin`).

## Documents

- [Usage guide](docs/guide.md) shows how to write a template and how to render it.
- [Specification](docs/spec/) defines the lexical rules, the grammar, the expression language, the data model, the functions, the runtime, the typed compiler, the AST, the errors and editor support.
- [Feature status](docs/features.md) records implementation, verification and deployment per feature.
- [Executable example site](examples/site/index.html) renders page scenarios and shows parity, repeatability and throughput artifacts.
- [Operations](docs/operations/) describes development, conformance, release testing, dependency, documentation and publication procedures.
- [Formatter, language server and editors](docs/operations/editor-tools.md) describes how to build, install and verify the formatter, the language server, the CodeMirror 6 adapter and the VS Code extension.
- [Execution plan](docs/plans/execution-plan.md) states the waves, their dependencies and causes, the exit criteria, the definition of done and its evidence.
- [Execution checklist](docs/plans/execution-checklist.md) lists the tasks, their verification and their states.
- [Changelog](CHANGELOG.md) records actual changes and their verification.
