# 예제

[English](examples.md).

이 문서는 페이지 하나 전체를 보여준다: 레이아웃, include된 파셜, scope 인자를 가진 템플릿 define, 루프를 가진 목록 define, 카드 define. 기대 출력은 아래 파일에 렉시컬, 문법, 표현식, 함수, 런타임 규칙을 적용해 도출한다.

## 파일

로더 루트는 `layout.tpl`, `parts/head.tpl`, `parts/footer.tpl`, `product/list.tpl`, `product/card.tpl`을 포함한다. 호스트는 `data.json`, `define.json`, `env.json`으로 `layout` target을 렌더한다.

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

모든 템플릿 파일은 개행으로 끝난다.

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

`define.json`은 레이아웃을 선택하고 슬롯을 제공한다:

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

## 출력

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

출력은 개행으로 끝난다.

## 도출

| 소스 | 결과 | 적용 규칙 |
| --- | --- | --- |
| 한 줄에 혼자 있는 `{og_image = ...}` | 줄이 제거된다. `meta.og_image`가 `null`이고 문자열 피연산자를 가진 `+`는 결합하므로 `og_image`는 `https://cdn.example.com/og.png`다. | standalone 줄 제거, `??`, `+` |
| `{= title \| default(meta.site)}` | `MaxShop`. `title`이 `null`이고 `default`는 falsy 첫 인자에 대해 두 번째 인자를 반환한다. | 파이프, `default` |
| 한 줄에 혼자 있는 `{+ parts/head.tpl}` | 줄이 제거되고 그 자리에 `parts/head.tpl`의 출력이 들어간다. include는 스코프를 공유하므로 파셜은 로컬 `og_image`를 읽는다. | include |
| 같은 줄에 텍스트가 있는 `{? og_image}...{/}` | 줄이 유지된다. 조건은 참이다. | standalone 줄 제거는 텍스트가 없는 줄에만 적용 |
| `{= json(page) \| raw}` | `{"id":7,"name":"Tom \u0026 \"Jerry\"","ratio":0.1}`; `json`이 `&`를 `\u0026`으로 쓰고 `raw`가 HTML 이스케이프 없이 텍스트를 쓴다. | `json`, `raw` |
| `init({ debug: false })` | 텍스트. `{` 뒤에 공백과 `d`가 오는데, 이는 기호도 아니고 대입 연산자가 바로 뒤따르는 식별자도 아니다. | 태그 시작 규칙 |
| `{?# content}` | 레지스트리에 `content`가 있으므로 첫 분기가 렌더된다. 태그 줄 `{?# content}`, `{:}`, `{/}`는 제거된다. | if-block |
| `<main>{# content}</main>` | 줄이 유지된다. block은 루트 데이터로 `product/list.tpl`을 렌더한다. block 출력이 개행으로 끝나므로 `</main>`은 새 줄에서 시작한다. | block |
| `{# parts/footer.tpl links year:date(now(), 'Y')}` | 줄이 제거된다. 푸터는 `links`와 `year`를 받는다. | scope 인자를 가진 block |
| `date(now(), 'Y')` | `2026`. `now()`는 `1789084800`이며 1970-01-01로부터 20707일 뒤, 즉 2026-09-11 00:00:00 UTC다. `+09:00`에서는 2026-09-11 09:00:00이다. | `now`, `date` |
| `{total = length(products)}` | `3`; 줄이 제거된다. | `length` |
| `{= category.name \| default('All')}` | `All`. `""`은 falsy다. | `default` |
| `{? total == 0}` / `{:? total > 2}` / `{/}` | 세 태그 줄이 제거된다. 두 번째 분기가 렌더된다. | if, elseif |
| `{@ product = slice(products, 0, 2)}` | 루프가 두 번 실행된다. 첫 반복에서 `product.first_`가 참이고 두 번째 반복에서 `product.last_`가 참이다. | 루프, 루프 메타 |
| `{# card.tpl product no:product.index_}` | `card.tpl`은 `product/list.tpl` 기준으로 `product/card.tpl`로 해석된다. block은 `product`와 `no`를 받는다. | 경로 해석, block |
| `{= 'list ' + (no + 1) \| url}` | `list%201`과 `list%202`. 파이프의 우선순위가 가장 낮으므로 `url`은 `'list ' + (no + 1)`을 받는다. | 우선순위, `+`, `url` |
| `{= product.name}` | `A &lt;b&gt;Bold&lt;/b&gt;`; echo는 `<`와 `>`를 이스케이프한다. | 이스케이프 |
| `{= product.price \| number}` | `12345.5`는 `12,346`(0에서 먼 쪽으로 반올림), `1000`은 `1,000`. | `number` |
| 상품 B의 `{? product.tags}<em>...</em>{/}` | `tags`는 `[]`이며 falsy다. 줄에 텍스트가 있으므로 개행이 유지되고 출력에 빈 줄이 생긴다. | 진릿값, standalone 줄 제거 |
| 루프 본문 뒤의 `{:}` | 루프가 실행되었으므로 빈 분기는 렌더되지 않는다. | 루프 빈 분기 |
| `parts/footer.tpl`의 `&copy;` | 텍스트는 그대로 쓴다. | 텍스트 |

## AST 발췌

소스 `<b>{= product.price | number}</b>`를 가진 템플릿 `x.tpl`:

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

바이트 위치: `<b>`는 바이트 0부터 2, `{`는 바이트 3, `product`는 바이트 6에서 시작, `.price`는 바이트 19 앞에서 끝, `number`는 바이트 28 앞에서 끝, `}`는 바이트 28, `</b>`는 바이트 29부터 32다.
