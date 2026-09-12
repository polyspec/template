# Usage guide

[한국어](guide.ko.md).

This guide shows how to write templates and how to render them. The rules that every implementation follows are in the [specification](index.md); this document explains the parts you need to write a page. Every example below is the real output of the engine.

## A template

A template is text with tags. A tag starts with `{` followed by one of the symbols `= @ ? :? : / + # ?# *`, or with `{` followed by a name and an assignment. Any other `{` is text.

```
<h1>{= title}</h1>
<p>{= user.name}</p>
```

with `{"title": "Shop & Co", "user": {"name": "<b>Kim</b>"}}` renders

```
<h1>Shop &amp; Co</h1>
<p>&lt;b&gt;Kim&lt;/b&gt;</p>
```

Output is HTML-escaped. A missing value is empty, not an error: `{= user.address.city}` with no address renders nothing.

## Output

| Tag | Result |
| --- | --- |
| `{= expression}` | The value, converted to text and HTML-escaped |
| `{= expression \| raw}` | The value without escaping |

Use `raw` only for text you produced yourself, such as JSON for a script element or HTML from a trusted source.

## Conditions

```
{? count == 0}
None.
{:? count > 2}
Many.
{:}
Some.
{/}
```

with `{"count": 5}` renders

```
Many.
```

A line that contains only tags disappears from the output. A line that contains text keeps its line break. `{:? ...}` branches come before `{:}`, and `{/}` closes the block.

These values are false: `null`, `false`, `0`, `""`, an empty list and an empty map. Everything else is true, including the string `"0"`.

## Loops

```
<ul>
{@ item = items}
<li>{= item.index_}: {= item.name}{? item.last_} (last){/}</li>
{:}
<li>empty</li>
{/}
</ul>
```

with `{"items": [{"name": "a"}, {"name": "b"}]}` renders

```
<ul>
<li>0: a</li>
<li>1: b (last)</li>
</ul>
```

The `{:}` branch runs when the loop has no elements. Inside a loop the loop variable carries the position:

| Name | Value |
| --- | --- |
| `item.index_` | Position, starting at 0 |
| `item.key_` | The list index, or the map key |
| `item.value_` | The current element |
| `item.first_`, `item.last_` | Whether this is the first or the last element |
| `item.size_` | The number of elements |

A loop over a map walks the keys in the order of the data:

```
{@ v = m}
{= v.key_} = {= v}
{/}
```

with `{"m": {"b": 2, "a": 1}}` renders

```
b = 2
a = 1
```

A data field named `index_` is still reachable as `item['index_']`.

## Variables

```
{total = 0}
{@ row = rows}
{total += row.price}
{/}
{= total | number}
```

with `{"rows": [{"price": 1200}, {"price": 800}]}` renders

```
2,000
```

`{name = expression}` writes a variable of the current file. `+=`, `-=`, `*=`, `/=`, `%=`, `++` and `--` also work. A variable hides a field of the assign data with the same name.

## Expressions

```
{= 1 + 2} {= "a" + 1} {= 10 / 4} {= 7 % 3}
{= a ?? "default"} {= b ?: "falsy"} {= c ? "yes" : "no"}
{= "x" in list} {= n in m}
{= name | upper} {= price | number(2)} {= words | join(", ")}
{= [1, 2, 3] | length} {= ["k" => 1] | keys | join(",")}
```

with `{"a": null, "b": "", "c": 1, "list": ["x"], "n": 2, "m": {"2": true}, "name": "kim", "price": 1234.567, "words": ["a", "b"]}` renders

```
3 a1 2.5 1
default falsy yes
true true
KIM 1,234.57 a, b
3 k
```

- Paths: `a.b`, `a.0`, `a[expression]`. A missing step gives nothing.
- Arithmetic: `+ - * / %`. `+` adds two numbers and joins text when either side is text.
- Comparison: `== != === !== < > <= >=` and `in`. `==` compares a number with a numeric string; `===` does not.
- Choice: `a ?? b` uses `b` only when `a` is missing, `a ?: b` when `a` is false, `c ? x : y` picks a branch. A `??` with nothing after it means "or nothing".
- Pipes: `value | name(argument)` is the function call `name(value, argument)`. Pipes read left to right and bind last, so `a ?? 'n/a' | upper` applies `upper` to the whole left side.
- Literals: `null true false`, numbers, `'text'` or `"text"`, a list `[1, 2]`, a map `['k' => 1]`, and `...` to spread one into another.

Templates call functions only from the built-in set and from functions the application registers. There are no method calls and no access to the host language.

## Escaping and embedding

```
text: {= html}
raw:  {= html | raw}
attr: <div data-s="{= json(s)}"></div>
json: <script type="application/json">{= json(s) | raw}</script>
url:  <a href="/q?s={= q | url}">go</a>
```

with `{"html": "<b>hi</b>", "s": {"id": 1, "t": "a & \"b\""}, "q": "a b&c"}` renders

```
text: &lt;b&gt;hi&lt;/b&gt;
raw:  <b>hi</b>
attr: <div data-s="{&quot;id&quot;:1,&quot;t&quot;:&quot;a & \&quot;b\&quot;&quot;}"></div>
json: <script type="application/json">{"id":1,"t":"a & \"b\""}</script>
url:  <a href="/q?s=a%20b%26c">go</a>
```

`json` writes `<`, `>` and `&` as escapes, so its text cannot end a script element. In an attribute write it without `raw`; in a script element write it with `raw`.

## Files

`{+ path}` inserts another file at that point and shares the variables of the current file.

```
{x = 1}
{+ parts/head.tpl}
body
```

with `parts/head.tpl` containing `head x={= x}` renders

```
head x=1
body
```

`{# path}` renders another file with the assign data and the values you pass, and without the variables of the calling file.

```
{@ p = products}
{# card.tpl p no:p.index_}
{/}
```

with `card.tpl` containing `<div>{= no}. {= p.name}</div>` and `{"products": [{"name": "A"}, {"name": "B"}]}` renders

```
<div>0. A</div>
<div>1. B</div>
```

A name in the tag passes the value of that name; `name:expression` passes a value under another name. A path is relative to the file that contains the tag; a path that starts with `/` is relative to the root.

## Layouts

A layout renders named template definitions that the application supplies, so one layout serves many pages.

```
<header>{# header.tpl}</header>
<main>{# content}</main>
```

with `header.tpl` containing `<b>{= site}</b>`, the definition `content` pointing at `list.tpl`, and `list.tpl` containing `{@ p = products}<div>{= p.name}</div>{/}` renders

```
<header><b>Shop</b>
</header>
<main><div>A</div>
</main>
```

`{?# name}` renders its body when the application supplied that definition:

```
{?# sidebar}
<aside>{# sidebar}</aside>
{:}
<aside class="empty"></aside>
{/}
```

with no `sidebar` block renders

```
<aside class="empty"></aside>
```

A definition entry can also carry finished HTML instead of a template, which is how a page embeds a region that another renderer produced.

## Comments

```
a{* hidden *}b
{* whole line *}
c
```

renders

```
ab
c
```

## Braces that are not tags

Text keeps every `{` that does not start a tag, so style sheets, scripts and component frameworks need no change:

```
css:  .a { color: red; }
js:   if (x) { return {a: 1}; }
vue:  {{ msg }}
jsx:  {items.map(f)}
tag:  \{= not a tag}
```

renders

```
css:  .a { color: red; }
js:   if (x) { return {a: 1}; }
vue:  {{ msg }}
jsx:  {items.map(f)}
tag:  {= not a tag}
```

Write `\{` where a real tag would start but you want the text. A file may also choose other delimiters with a first line such as `{% delimiter ;;}`, after which tags are written `;= title;`.

## Functions

| Group | Functions |
| --- | --- |
| Output | `escape` `raw` `json` `url` `nl2br` |
| Text | `upper` `lower` `trim` `replace` `split` `truncate` `contains` `starts_with` `ends_with` `length` |
| Collections | `keys` `values` `first` `last` `reverse` `slice` `sort` `join` `range` `default` |
| Numbers | `number` `round` `floor` `ceil` `abs` `min` `max` `num` |
| Values | `str` `type` |
| Time | `date` `now` |

The [function specification](spec/functions.md) gives the arguments and the exact result of each one. `date` uses the fixed offset that the application passes, so the same data gives the same output everywhere.

An application can register its own functions. A template that uses one renders only where that function is registered, so register the same names in every place that renders the template.

## Render a template

Each implementation loads templates through a loader and returns the output as a string.

```ts
import { Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const engine = new Engine({ loader: new FsLoader('templates') });
const html = engine.render('layout', assign, {
  define: { layout: 'page.tpl', content: 'pages/list.tpl' },
  env: { timezone: '+09:00', now: 1789084800 },
});
```

```go
engine, _ := template.NewEngine(template.Options{Loader: template.NewFSLoader(os.DirFS("templates"))})
html, _ := engine.Render("layout", assign, template.RenderOptions{
	Define: map[string]template.DefineInput{"layout": {Template: "page.tpl"}, "content": {Template: "pages/list.tpl"}},
})
```

```php
$engine = new Polyspec\Template\Engine(new Polyspec\Template\Loader\FilesystemLoader('templates'));
$html = $engine->render('layout', $assign, ['define' => ['layout' => ['template' => 'page.tpl'], 'content' => ['template' => 'pages/list.tpl']]]);
```

```rust
let engine = Engine::new(EngineOptions { loader: Some(Box::new(FsLoader::new("templates"))), ..Default::default() });
let mut options = RenderOptions::default();
options.define.insert("layout".to_string(), DefineInput { template: Some("page.tpl".to_string()), ..Default::default() });
options.define.insert("content".to_string(), DefineInput { template: Some("pages/list.tpl".to_string()), ..Default::default() });
let html = engine.render(RenderTarget::Name("layout"), &assign, &options)?;
```

The package documents give the full API: [TypeScript](../packages/template-ts/README.md), [Go](../packages/template-go/README.md), [Rust](../packages/template-rust/README.md), [PHP](../packages/template-php/README.md).

## Render in a browser

The same templates render in a browser from the TypeScript package. The server embeds the assign data as JSON, and the browser reads it and renders the same template name. [Browser rendering](operations/browser.md) describes how to ship templates and data, and how to place a component framework next to the engine.

For React, keep the server rendered shell and mount a client owned island at a marked element. The static `react-boundary` showcase contains the exact templates, assign data, output and host source. Use `hydrateRoot` only when the server HTML came from the same React component tree; otherwise use a separate `createRoot` island.

## Errors

A mistake stops the render and reports a code and a position. This template

```
{= a}
{? b}
```

reports

```
ERROR E_PARSE_UNCLOSED_BLOCK line 2 col 1
```

The [error specification](spec/errors.md) lists every code. A missing variable is not an error; an unknown function, a wrong type and an unclosed block are.

## Keep a template portable

- Prefer the built-in functions over registered ones. A template that uses only built-ins renders the same in every implementation with no setup.
- Pass the time zone and the current time from the application instead of relying on the machine.
- Keep the assign data to JSON types: text, numbers, true and false, nothing, lists and maps.
