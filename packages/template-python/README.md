# polyspec-template

[한국어](README.ko.md)

Python implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. Python 3.11 or later is required and no external package is needed.

## Install

The package installs from a tag of this repository. Replace `vX.Y.Z` with the first release tag that contains `packages/template-python`:

```sh
pip install "polyspec-template @ git+https://github.com/polyspec/template@vX.Y.Z#subdirectory=packages/template-python"
```

No release tag contains this package yet. From a checkout of this repository, install it with `pip install ./packages/template-python`.

## Render

```python
from polyspec.template import AstProgram, Engine, EngineOptions, RenderOptions
from polyspec.template import FsLoader

program = AstProgram(EngineOptions(loader=FsLoader('templates')))
program.register('greet', lambda args, context: 'Hello, ' + args[0])
engine = Engine(program)
assign = {'title': 'Home'}
html = engine.render('layout', assign, RenderOptions(
    define={'layout': {'template': 'layout.tpl'},
            'content': {'template': 'pages/home.tpl'}},
    env={'timezone': '+09:00', 'now': 1700000000},
))
```

Assign data is a Python value: a `dict` is a map, a `list` or `tuple` is a list, `int` and `float` bind within the safe integer range of the double, and `None` is the empty map. JSON input goes through `parse_json` and `parse_json_bytes`, which keep object key order.

## Parse

```python
from polyspec.template import analyze, parse

ast = parse(source, 'layout.tpl')
tags_and_tokens = analyze(source, 'layout.tpl')
```

A parsed template can be passed to `render()` or stored in a `MapLoader`.

## Command line

```sh
python -m polyspec.template.cli parse FILE [--root DIR] [--delimiters OC]
python -m polyspec.template.cli render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse` writes the AST as JSON; a template error writes its fields as JSON to standard error and exits with status 2.

## API

| Member | Description |
| --- | --- |
| `parse(source, name, options)` | Parses one template into its AST. `options.delimiters` selects the delimiters. |
| `analyze(source, name, options)` | Parses once and returns the AST with the tag ranges and expression tokens. |
| `analyze_prefix(source, name, options)` | Returns the ranges accepted before the first error, and that error. |
| `AstProgram(options)` | Creates an AST program. Options: `loader`, `functions`, `class_functions`, `limits`, `delimiters`, `artifact_refresh`. |
| `Engine(program)` | Creates an engine that delegates to one AST or generated program. |
| `RenderOptions(define, env)` | One render call: template definitions and the environment. |
| `MapLoader()` / `FsLoader(root)` | Loaders from a mapping or a directory. |
| `bind(value)` / `merge(first, second)` | Check host data once and combine bound maps. |
| `parse_json(text)` / `parse_json_bytes(data)` | Order-preserving JSON input that applies the binding rules. |
| `TemplateError` | The error of parsing and rendering; `to_object()` returns its fields. |
| `PageCache()` | Caches rendered pages. |

The [language documentation](https://github.com/polyspec/template/blob/main/docs/spec/lexical.md) defines the shared behavior; the [conformance document](https://github.com/polyspec/template/blob/main/docs/spec/conformance.md) defines the command line. Source is provided by this repository; registry publication is not verified.
