# Browser rendering

[한국어](browser.ko.md).

The TypeScript package renders in a browser with the same engine that runs on a server. The browser test verifies that the browser build produces the expected output for the fixture cases.

## Run the browser test

```sh
npx playwright install chromium
make test-browser
```

`make test-browser` builds the package, starts a static server on `127.0.0.1:4173` from `tests/browser/server.mjs`, opens `tests/browser/index.html` in Chromium and compares the rendered output of every case with `expected.html` or `expected.error.json`. Cases whose input depends on raw bytes (invalid UTF-8, a byte order mark) are covered by the command line suite and skipped in the browser.

## Ship templates and data to a browser

- Templates: bundle the template sources or their AST JSON and give them to a `MapLoader`. The `@polyspec/template/render` entry renders AST JSON without the lexer and parser.
- Data: embed the assign data with `{= json(state) | raw}` inside `<script type="application/json">` and read it with `parseJson` from the package. An attribute such as `data-state="{= json(state)}"` needs no `raw`, because the echo tag escapes the JSON text. `JSON.parse` changes the order of integer-like keys and accepts integers outside the safe range.
- Template definitions and environment: pass the same `define` and `env` values that the server used.

## Coexistence with a component framework

- The template renders the document and the static regions and leaves container elements for the framework to mount into.
- The framework renders its own regions on the server and in the browser; the template inserts a server-rendered result through a definition entry with `html`.

The tag start rule keeps framework syntax as text: `{{ msg }}`, `{cond && x}`, `{/* comment */}` and `{ a: 1 }` are not tags. A `{` immediately followed by an identifier and an assignment operator, such as `{a = 1}`, is a tag; write `\{a = 1}` to keep it as text.
