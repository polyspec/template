<!-- doc-id: packages-template-ts-readme -->
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
import { AstProgram, Engine, MapLoader, decodeTemplate } from '@polyspec/template/render';

const cardAst = decodeTemplate(cardAstJson);
const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'card.tpl': cardAst }) }));
```

`decodeTemplate` validates every node of the AST JSON against the AST schema and fails with an `AstDecodeError` whose `path` is the JSON Pointer of the invalid node (AST-10).

`@polyspec/template/decode` exports only `decodeTemplate` and `AstDecodeError`. Either entry brings no other code of the package into a bundle that imports only `decodeTemplate`: about 87 KB minified, 7.5 KB gzip, almost all of it the validator of the schema.

## API

| Export | Description |
| --- | --- |
| `parse(source, name, { delimiters })` | Parses one template into its AST. `source` is a string or UTF-8 bytes. |
| `decodeTemplate(json)` | Reads the AST JSON, as text or as its parsed value, into a `Template`, validated against `contracts/schema/ast.schema.json`; an `AstDecodeError` names the JSON Pointer of the invalid node in `path` (AST-10). Also exported by `@polyspec/template/render` and `@polyspec/template/decode`. |
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
node bin/template.mjs parse [--root DIR] [--delimiters OC] FILE
node bin/template.mjs render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
node bin/template.mjs tokens [--root DIR] [--delimiters OC] FILE
```

`parse` prints the AST JSON. `render` prints the output. `tokens` prints the tokens of the template as `[start, end, type]` with UTF-8 byte offsets ([formatting](../../docs/spec/formatting.md), FMT-1, FMT-2). A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
make build-ts
make test-ts
```

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process.

The package exports names for the AST, loader and runtime types that appear in its public signatures. `SetNode` names an AST assignment, `LoopMetaExpression` an AST metadata expression, `RuntimeLoopMeta` the active loop metadata, and `SourceSpan` an error source span. These are type exports. `RenderAstProgram` names the type of `AstProgram` from the render-only entry; it adds no constructor to the root runtime exports. A consumer can import these types through the package entry without an implementation path.
