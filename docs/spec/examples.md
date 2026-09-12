# Examples

[한국어](examples.ko.md).

This document shows one complete page: a layout, an included partial, a template definition with scope arguments, a list definition with a loop and a card definition. The expected output is derived by applying the lexical, grammar, expression, function and runtime rules to the files below.

## Files

The loader root contains `layout.tpl`, `parts/head.tpl`, `parts/footer.tpl`, `product/list.tpl` and `product/card.tpl`. The host renders the `layout` target with `data.json`, `define.json` and `env.json`.

`layout.tpl`:

```
<!DOCTYPE html>
<html lang="{= meta.lang}">
<head>
{og_image = meta.og_image ?? links.assets + '/og.png'}
<title>{= title | default(meta.site)}</title>
{+ parts/head.tpl}
</head>
<body>
<script nonce="{= nonce}">
var page = {= json(page) | raw};
$(function () { init({ debug: false }); });
</script>
{?# content}
<main>{# content}</main>
{:}
<main class="empty">No content</main>
{/}
{# parts/footer.tpl links year:date(now(), 'Y')}
</body>
</html>
```

`parts/head.tpl`:

```
<meta charset="utf-8">
{? og_image}<meta property="og:image" content="{= og_image}">{/}
```

`parts/footer.tpl`:

```
<footer>&copy; {= year} <a href="{= links.home}">Home</a></footer>
```

`product/list.tpl`:

```
{total = length(products)}
<h1>{= category.name | default('All')} <small>{= total | number}</small></h1>
{? total == 0}
<p class="empty">No products.</p>
{:? total > 2}
<p class="notice">Showing first 2 of {= total}.</p>
{/}
<ul class="products">
{@ product = slice(products, 0, 2)}
<li class="product{? product.first_} first{/}{? product.last_} last{/}">
{# card.tpl product no:product.index_}
</li>
{:}
<li class="empty">-</li>
{/}
</ul>
```

`product/card.tpl`:

```
<a href="/p/{= product.seq}?ref={= 'list ' + (no + 1) | url}">
<img src="{= product.image ?? links.assets + '/no-image.png'}" alt="{= product.name}">
<strong>{= product.name}</strong>
<span class="price">{= product.price | number}</span>
{? product.tags}<em>{= product.tags | join(', ')}</em>{/}
</a>
```

Every template file ends with a newline.

`data.json`:

```json
{
  "meta": { "lang": "ko", "site": "MaxShop", "og_image": null },
  "title": null,
  "nonce": "abc123",
  "links": { "assets": "https://cdn.example.com", "home": "/" },
  "page": { "id": 7, "name": "Tom & \"Jerry\"", "ratio": 0.1 },
  "category": { "name": "" },
  "products": [
    { "seq": 101, "name": "A <b>Bold</b>", "price": 12345.5, "image": null, "tags": ["new", "hot"] },
    { "seq": 102, "name": "B", "price": 1000, "image": "https://cdn.example.com/b.png", "tags": [] },
    { "seq": 103, "name": "C", "price": 5, "image": null, "tags": null }
  ]
}
```

`define.json` selects the layout and supplies its slots:

```json
{
  "layout": "layout.tpl",
  "content": "product/list.tpl"
}
```

`env.json`:

```json
{ "timezone": "+09:00", "now": 1789084800 }
```

## Output

```
<!DOCTYPE html>
<html lang="ko">
<head>
<title>MaxShop</title>
<meta charset="utf-8">
<meta property="og:image" content="https://cdn.example.com/og.png">
</head>
<body>
<script nonce="abc123">
var page = {"id":7,"name":"Tom \u0026 \"Jerry\"","ratio":0.1};
$(function () { init({ debug: false }); });
</script>
<main><h1>All <small>3</small></h1>
<p class="notice">Showing first 2 of 3.</p>
<ul class="products">
<li class="product first">
<a href="/p/101?ref=list%201">
<img src="https://cdn.example.com/no-image.png" alt="A &lt;b&gt;Bold&lt;/b&gt;">
<strong>A &lt;b&gt;Bold&lt;/b&gt;</strong>
<span class="price">12,346</span>
<em>new, hot</em>
</a>
</li>
<li class="product last">
<a href="/p/102?ref=list%202">
<img src="https://cdn.example.com/b.png" alt="B">
<strong>B</strong>
<span class="price">1,000</span>

</a>
</li>
</ul>
</main>
<footer>&copy; 2026 <a href="/">Home</a></footer>
</body>
</html>
```

The output ends with a newline.

## Derivation

| Source | Result | Rule applied |
| --- | --- | --- |
| `{og_image = ...}` on its own line | The line is removed. `og_image` is `https://cdn.example.com/og.png` because `meta.og_image` is `null` and `+` with a string operand concatenates. | standalone line removal, `??`, `+` |
| `{= title \| default(meta.site)}` | `MaxShop`, because `title` is `null` and `default` returns its second argument for a falsy first argument. | pipe, `default` |
| `{+ parts/head.tpl}` on its own line | The line is removed and the output of `parts/head.tpl` takes its place. The partial reads the local `og_image` because an include shares the scope. | include |
| `{? og_image}...{/}` with text on the same line | The line is kept. The condition is true. | standalone line removal applies only to lines without text |
| `{= json(page) \| raw}` | `{"id":7,"name":"Tom \u0026 \"Jerry\"","ratio":0.1}`; `json` writes `&` as `\u0026`, and `raw` writes the text without HTML escaping. | `json`, `raw` |
| `init({ debug: false })` | Text, because `{` is followed by a space and `d`, which is neither a sigil nor an identifier immediately followed by an assignment operator. | tag start rule |
| `{?# content}` | The registry has `content`, so the first branch renders. The tag lines `{?# content}`, `{:}` and `{/}` are removed. | if-block |
| `<main>{# content}</main>` | The line is kept. The block renders `product/list.tpl` with the root data. The block output ends with a newline, so `</main>` starts a new line. | block |
| `{# parts/footer.tpl links year:date(now(), 'Y')}` | The line is removed. The footer receives `links` and `year`. | block with scope arguments |
| `date(now(), 'Y')` | `2026`. `now()` is `1789084800`, which is 20707 days after 1970-01-01, that is 2026-09-11 00:00:00 UTC; in `+09:00` it is 2026-09-11 09:00:00. | `now`, `date` |
| `{total = length(products)}` | `3`; the line is removed. | `length` |
| `{= category.name \| default('All')}` | `All`, because `""` is falsy. | `default` |
| `{? total == 0}` / `{:? total > 2}` / `{/}` | The three tag lines are removed. The second branch renders. | if, elseif |
| `{@ product = slice(products, 0, 2)}` | The loop runs twice. `product.first_` is true in the first iteration and `product.last_` is true in the second. | loop, loop meta |
| `{# card.tpl product no:product.index_}` | `card.tpl` resolves relative to `product/list.tpl` to `product/card.tpl`. The block receives `product` and `no`. | path resolution, block |
| `{= 'list ' + (no + 1) \| url}` | `list%201` and `list%202`. The pipe has the lowest precedence, so `url` receives `'list ' + (no + 1)`. | precedence, `+`, `url` |
| `{= product.name}` | `A &lt;b&gt;Bold&lt;/b&gt;`; echo escapes `<` and `>`. | escaping |
| `{= product.price \| number}` | `12,346` for `12345.5` (half away from zero) and `1,000` for `1000`. | `number` |
| `{? product.tags}<em>...</em>{/}` for product B | `tags` is `[]`, which is falsy. The line keeps its newline because it contains text, so the output has an empty line. | truthiness, standalone line removal |
| `{:}` after the loop body | The empty branch does not render because the loop ran. | loop empty branch |
| `&copy;` in `parts/footer.tpl` | Text is written as is. | text |

## AST excerpt

Template `x.tpl` with the source `<b>{= product.price | number}</b>`:

```json
{
  "type": "Template",
  "name": "x.tpl",
  "body": [
    { "type": "Text", "value": "<b>", "span": [0, 3] },
    {
      "type": "Echo",
      "span": [3, 29],
      "expr": {
        "type": "Call",
        "name": "number",
        "span": [6, 28],
        "args": [
          {
            "type": "Member",
            "key": "price",
            "span": [6, 19],
            "object": { "type": "Var", "name": "product", "span": [6, 13] }
          }
        ]
      }
    },
    { "type": "Text", "value": "</b>", "span": [29, 33] }
  ]
}
```

Byte positions: `<b>` occupies bytes 0 to 2, `{` is byte 3, `product` starts at byte 6, `.price` ends before byte 19, `number` ends before byte 28, `}` is byte 28, and `</b>` occupies bytes 29 to 32.
