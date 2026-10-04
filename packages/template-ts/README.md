# @polyspec/template

[한국어](README.ko.md).

TypeScript implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. The package runs in Node.js and in browsers.

## Install

```sh
npm install @polyspec/template
```

## Render on a server

```ts
import { AstProgram, Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const program = new AstProgram({ loader: new FsLoader('templates') });
program.register('greet', ([name]) => `Hello, ${name}`);
const engine = new Engine(program);
const assign = { title: 'Home' };
const html = engine.render('layout', assign, {
  define: { layout: 'layout.tpl', content: 'pages/home.tpl' },
  env: { timezone: '+09:00', now: Math.floor(Date.now() / 1000) },
});
```

## Render in a browser

```ts
import { AstProgram, Engine, MapLoader, parseJson } from '@polyspec/template';

const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'card.tpl': '<b>{= name}</b>' }) }));
const assign = parseJson(document.getElementById('state').textContent);
document.getElementById('card').innerHTML = engine.render('card.tpl', assign);
```

`parseJson` preserves the key order of the JSON text and rejects numbers outside ±(2^53 − 1), unpaired surrogate escapes and nesting deeper than 64 levels. Text that is not one JSON document is `E_DATA_INVALID_JSON`. `JSON.parse` does none of these.

## Render a parsed template

`@polyspec/template/render` exports an engine that accepts parsed templates (AST JSON) and does not include the lexer and parser.

```ts
import { AstProgram, Engine, MapLoader } from '@polyspec/template/render';

const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'card.tpl': cardAst }) }));
```

## API

| Export | Description |
| --- | --- |
| `parse(source, name, { delimiters })` | Parses one template into its AST. `source` is a string or UTF-8 bytes. |
| `analyze(source, name, { delimiters })` | Parses once and returns the AST plus parser tag ranges and consumed expression-token ranges. |
| `new AstProgram({ loader, functions, limits, delimiters })` | Creates an AST program. `loader` defaults to an empty `MapLoader`. |
| `new Engine(program)` | Creates an engine that delegates to one AST or generated program. |
| `engine.render(nameOrAst, assign, { define, env })` | Renders a template to a string. `assign` contains variables; `define` supplies template paths or HTML entries. |
| `bind(value)`, `merge(first, second)` | `bind` checks data once and returns a `BoundMap`; `merge` combines two bound maps, and an entry of `second` replaces the entry of `first` with the same key. `render` and `prepare` take a bound map as `assign` and as definition `data` without binding it again; at another position it fails with `E_DATA_UNSUPPORTED_TYPE` (VAL-22). Errors have no template and no position (ERR-14). Both entries and both module formats share one bound map type. |
| `astProgram.register(name, fn)` | Registers a host function `(args, { env }) => value`. Arguments have the form of VAL-21: a safe string is a `string`, a list is a new array, a map is a new `Map` in entry order, and a native object, also inside a list or map, is the original class instance. |
| `MapLoader`, `FsLoader` | In-memory and filesystem loaders. An exception that a loader throws fails the render with `E_LOAD_FAILED`; `FsLoader` reports a regular file that cannot be read in this way. |
| `parseJson`, `parseJsonBytes` | Order-preserving JSON parsers for assign data. |
| `TemplateError` | Error with `code`, `template`, `line`, `col`, `offset`, `end`, `message`. |
| `SafeString` | A string that the echo tag writes without escaping. |

## Command line

```sh
node bin/template.mjs parse FILE [--root DIR] [--delimiters OC]
node bin/template.mjs render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
npm run build -w @polyspec/template
npm test -w @polyspec/template -- --run
npm run typecheck -w @polyspec/template
```

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process.
