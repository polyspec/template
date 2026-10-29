<!-- doc-id: readme -->
# Template

[한국어](README.ko.md).

Template is a template language defined by one specification. Implementations in TypeScript, Go, Rust, PHP, the PHP extension and Python are included. Each implementation renders a template from its AST, and the typed compiler turns templates into generated programs that render the same output. Current status is in [Feature status](docs/features.md).

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
make showcase
```

`make help` lists every target.

## Editor support

A single language service holds every editor rule, and each editor reaches it through an adapter ([Editor support](docs/spec/editor.md)).

| Package | Use |
| --- | --- |
| `@polyspec/template-language` | the language service `openDocument()`, the formatter `format()` and the command `template-fmt` |
| `@polyspec/template-lsp` | the Language Server Protocol server `template-lsp` for every editor with an LSP client |
| `@polyspec/template-codemirror` | the CodeMirror 6 extension `template()` |
| `polyspec-template` | the VS Code extension, a client of the bundled language server |

`make vscode-install` installs the VS Code extension, and `make template-install-cli` installs `template-fmt` as a script under `CLI_PREFIX` (`~/.local/bin`).

## Documents

- [Usage guide](docs/operations/guide.md) shows how to write a template and how to render it.
- [Specification](docs/spec/) defines the lexical rules, the grammar, the expression language, the data model, the functions, the runtime, the typed compiler, the AST, the errors and editor support.
- [Feature status](docs/features.md) records implementation, verification and deployment per feature.
- [Executable example site](https://polyspec.github.io/template/examples/site/index.html) renders page scenarios and shows parity, repeatability and throughput artifacts. `make showcase` builds it locally at `examples/site/index.html`.
- [Operations](docs/operations/) describes development, conformance, release testing, dependency, documentation and publication procedures.
- [Formatter, language server and editors](docs/operations/editor-tools.md) describes how to build, install and verify the formatter, the language server, the CodeMirror 6 adapter and the VS Code extension.
- [Execution plan](docs/plans/execution/plan.md) states the waves, their dependencies and causes, the exit criteria, the definition of done and its evidence.
- [Execution checklist](docs/plans/execution/checklist.md) lists the tasks, their verification and their states.
- [Changelog](CHANGELOG.md) records actual changes and their verification.
