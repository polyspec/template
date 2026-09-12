# Template

[한국어](README.ko.md).

Template is a template language defined by one specification. Implementations in TypeScript, Go, Rust and PHP are included, with a native PHP extension for the same engine. Current status is in [Feature status](docs/features.md).

A template consists of text and tags. A tag starts with `{` followed by one of the symbols `= @ ? :? : / + # ?# *`, or with `{` followed by an assignment. Any other `{` is text.

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

`make help` lists every target. `make check` runs the document checks, lint, the unit tests of every package and the cross-language conformance suite.

## Documents

- [Usage guide](docs/guide.md) shows how to write a template and how to render it.
- [Specification](docs/spec/) defines the lexical rules, the grammar, the expression language, the data model, the functions, the runtime, the AST and the errors.
- [Feature status](docs/features.md) records implementation, verification and deployment per feature.
- [Executable example site](examples/site/index.html) renders application situations and shows parity, repeatability and throughput artifacts.
- [Operations](docs/operations/) describes development, conformance and documentation procedures.
- [Execution checklist](docs/plans/execution-checklist.md) lists the tasks that remain.
- [Changelog](CHANGELOG.md) records actual changes and their verification.
