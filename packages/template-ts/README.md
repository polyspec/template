# @polyspec/template

[한국어](README.ko.md).

TypeScript implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. The package runs in Node.js and in browsers.

## Install

```sh
npm install @polyspec/template
```

## Render on a server

```ts
import { Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const engine = new Engine({ loader: new FsLoader('templates') });
engine.register('greet', ([name]) => `Hello, ${name}`);
const assign = { title: 'Home' };
const html = engine.render('layout', assign, {
  define: { layout: 'layout.tpl', content: 'pages/home.tpl' },
  env: { timezone: '+09:00', now: Math.floor(Date.now() / 1000) },
});
```

## Render in a browser

```ts
import { Engine, MapLoader, parseJson } from '@polyspec/template';

const engine = new Engine({ loader: new MapLoader({ 'card.tpl': '<b>{= name}</b>' }) });
const assign = parseJson(document.getElementById('state').textContent);
document.getElementById('card').innerHTML = engine.render('card.tpl', assign);
```

`parseJson` preserves the key order of the JSON text and rejects integers outside the safe range. `JSON.parse` does neither.

## Render a parsed template

`@polyspec/template/render` exports an engine that accepts parsed templates (AST JSON) and does not include the lexer and parser.

```ts
import { Engine, MapLoader } from '@polyspec/template/render';

const engine = new Engine({ loader: new MapLoader({ 'card.tpl': cardAst }) });
```

## API

| Export | Description |
| --- | --- |
| `parse(source, name, { delimiters })` | Parses one template into its AST. `source` is a string or UTF-8 bytes. |
| `new Engine({ loader, functions, limits, delimiters })` | Creates an engine. `loader` defaults to an empty `MapLoader`. |
| `engine.render(nameOrAst, assign, { define, env })` | Renders a template to a string. `assign` contains variables; `define` supplies template paths or HTML entries. |
| `engine.register(name, fn)` | Registers a host function `(args, { env }) => value`. |
| `MapLoader`, `FsLoader` | In-memory and filesystem loaders. |
| `parseJson`, `parseJsonBytes` | Order-preserving JSON parsers for assign data. |
| `TemplateError` | Error with `code`, `template`, `line`, `col`, `offset`, `end`, `message`. |
| `SafeString` | A string that the echo tag writes without escaping. |

## Command line

```sh
node bin/template.mjs parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
node bin/template.mjs render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
npm run build -w @polyspec/template
npm test -w @polyspec/template -- --run
npm run typecheck -w @polyspec/template
```

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process.
