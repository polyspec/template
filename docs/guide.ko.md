# 사용법

[English](/guide).

이 문서는 템플릿을 작성하는 방법과 렌더하는 방법을 설명한다. 모든 구현이 따르는 규칙은 [명세](/ko/)에 있다. 이 문서는 페이지를 작성하는 데 필요한 부분을 다룬다. 아래 예제의 출력은 모두 엔진이 실제로 만든 것이다.

## 템플릿

템플릿은 태그가 들어 있는 텍스트다. 태그는 `{` 뒤에 기호 `= @ ? :? : / + # ?# *` 중 하나가 오거나, `{` 뒤에 이름과 대입이 올 때 시작한다. 그 외의 `{`는 텍스트다.

```
<h1>{= title}</h1>
<p>{= user.name}</p>
```

`{"title": "Shop & Co", "user": {"name": "<b>Kim</b>"}}`로 렌더하면

```
<h1>Shop &amp; Co</h1>
<p>&lt;b&gt;Kim&lt;/b&gt;</p>
```

출력은 HTML 이스케이프된다. 없는 값은 오류가 아니라 빈 값이다. address가 없으면 `{= user.address.city}`는 아무것도 출력하지 않는다.

## 출력

| 태그 | 결과 |
| --- | --- |
| `{= expression}` | 값을 텍스트로 변환하고 HTML 이스케이프 |
| `{= expression \| raw}` | 이스케이프 없이 값 |

`raw`는 직접 만든 텍스트에만 쓴다. script 요소에 넣는 JSON이나 신뢰하는 출처의 HTML이 그 예다.

## 조건

```
{? count == 0}
None.
{:? count > 2}
Many.
{:}
Some.
{/}
```

`{"count": 5}`로 렌더하면

```
Many.
```

태그만 있는 줄은 출력에서 사라진다. 텍스트가 있는 줄은 줄바꿈을 유지한다. `{:? ...}` 분기는 `{:}`보다 앞에 오고, `{/}`가 블록을 닫는다.

거짓인 값은 `null`, `false`, `0`, `""`, 빈 list, 빈 map이다. 그 외는 모두 참이며 문자열 `"0"`도 참이다.

## 반복

```
<ul>
{@ item = items}
<li>{= item.index_}: {= item.name}{? item.last_} (last){/}</li>
{:}
<li>empty</li>
{/}
</ul>
```

`{"items": [{"name": "a"}, {"name": "b"}]}`로 렌더하면

```
<ul>
<li>0: a</li>
<li>1: b (last)</li>
</ul>
```

`{:}` 분기는 원소가 없을 때 실행된다. 루프 안에서 루프 변수는 위치를 함께 가진다.

| 이름 | 값 |
| --- | --- |
| `item.index_` | 0부터 시작하는 위치 |
| `item.key_` | list 인덱스 또는 map 키 |
| `item.value_` | 현재 원소 |
| `item.first_`, `item.last_` | 첫 번째인지, 마지막인지 |
| `item.size_` | 원소 개수 |

map을 반복하면 데이터의 순서대로 키를 돈다.

```
{@ v = m}
{= v.key_} = {= v}
{/}
```

`{"m": {"b": 2, "a": 1}}`로 렌더하면

```
b = 2
a = 1
```

`index_`라는 데이터 필드는 `item['index_']`로 여전히 접근할 수 있다.

## 변수

```
{total = 0}
{@ row = rows}
{total += row.price}
{/}
{= total | number}
```

`{"rows": [{"price": 1200}, {"price": 800}]}`로 렌더하면

```
2,000
```

`{name = expression}`은 현재 파일의 변수를 쓴다. `+=`, `-=`, `*=`, `/=`, `%=`, `++`, `--`도 쓸 수 있다. 변수는 같은 이름의 assign 데이터 필드를 가린다.

## 표현식

```
{= 1 + 2} {= "a" + 1} {= 10 / 4} {= 7 % 3}
{= a ?? "default"} {= b ?: "falsy"} {= c ? "yes" : "no"}
{= "x" in list} {= n in m}
{= name | upper} {= price | number(2)} {= words | join(", ")}
{= [1, 2, 3] | length} {= ["k" => 1] | keys | join(",")}
```

`{"a": null, "b": "", "c": 1, "list": ["x"], "n": 2, "m": {"2": true}, "name": "kim", "price": 1234.567, "words": ["a", "b"]}`로 렌더하면

```
3 a1 2.5 1
default falsy yes
true true
KIM 1,234.57 a, b
3 k
```

- 경로: `a.b`, `a.0`, `a[expression]`. 중간이 없으면 결과도 없다.
- 산술: `+ - * / %`. `+`는 숫자 둘을 더하고, 한쪽이 텍스트면 텍스트를 잇는다.
- 비교: `== != === !== < > <= >=`와 `in`. `==`는 숫자와 숫자 문자열을 비교하고 `===`는 하지 않는다.
- 선택: `a ?? b`는 `a`가 없을 때만 `b`를 쓰고, `a ?: b`는 `a`가 거짓일 때 쓰며, `c ? x : y`는 분기를 고른다. 뒤가 빈 `??`는 "없으면 없음"을 뜻한다.
- 파이프: `value | name(argument)`는 함수 호출 `name(value, argument)`다. 파이프는 왼쪽에서 오른쪽으로 읽고 가장 나중에 묶이므로 `a ?? 'n/a' | upper`는 왼쪽 전체에 `upper`를 적용한다.
- 리터럴: `null true false`, 숫자, `'text'` 또는 `"text"`, list `[1, 2]`, map `['k' => 1]`, 그리고 하나를 다른 것에 펼치는 `...`.

템플릿은 내장 함수와 애플리케이션이 등록한 함수만 호출한다. 메서드 호출은 없고 호스트 언어에 접근하지 않는다.

## 이스케이프와 임베딩

```
text: {= html}
raw:  {= html | raw}
attr: <div data-s="{= json(s)}"></div>
json: <script type="application/json">{= json(s) | raw}</script>
url:  <a href="/q?s={= q | url}">go</a>
```

`{"html": "<b>hi</b>", "s": {"id": 1, "t": "a & \"b\""}, "q": "a b&c"}`로 렌더하면

```
text: &lt;b&gt;hi&lt;/b&gt;
raw:  <b>hi</b>
attr: <div data-s="{&quot;id&quot;:1,&quot;t&quot;:&quot;a & \&quot;b\&quot;&quot;}"></div>
json: <script type="application/json">{"id":1,"t":"a & \"b\""}</script>
url:  <a href="/q?s=a%20b%26c">go</a>
```

`json`은 `<`, `>`, `&`를 이스케이프로 쓰므로 그 텍스트가 script 요소를 끝낼 수 없다. 속성에는 `raw` 없이 쓰고, script 요소에는 `raw`와 함께 쓴다.

## 파일

`{+ path}`는 다른 파일을 그 자리에 넣고 현재 파일의 변수를 공유한다.

```
{x = 1}
{+ parts/head.tpl}
body
```

`parts/head.tpl`이 `head x={= x}`일 때

```
head x=1
body
```

`{# path}`는 다른 파일을 assign 데이터와 전달한 값으로 렌더하며, 부르는 파일의 변수는 넘기지 않는다.

```
{@ p = products}
{# card.tpl p no:p.index_}
{/}
```

`card.tpl`이 `<div>{= no}. {= p.name}</div>`이고 `{"products": [{"name": "A"}, {"name": "B"}]}`일 때

```
<div>0. A</div>
<div>1. B</div>
```

태그 안의 이름은 그 이름의 값을 전달하고, `name:expression`은 다른 이름으로 값을 전달한다. 경로는 태그가 있는 파일 기준이고, `/`로 시작하는 경로는 루트 기준이다.

## 레이아웃

레이아웃은 애플리케이션이 제공하는 이름 붙은 템플릿 define을 렌더하므로, 레이아웃 하나로 여러 페이지를 만든다.

```
<header>{# header.tpl}</header>
<main>{# content}</main>
```

`header.tpl`이 `<b>{= site}</b>`이고, define `content`가 `list.tpl`을 가리키고, `list.tpl`이 `{@ p = products}<div>{= p.name}</div>{/}`일 때

```
<header><b>Shop</b>
</header>
<main><div>A</div>
</main>
```

`{?# name}`은 애플리케이션이 그 define을 제공했을 때 본문을 렌더한다.

```
{?# sidebar}
<aside>{# sidebar}</aside>
{:}
<aside class="empty"></aside>
{/}
```

`sidebar` 블록이 없으면

```
<aside class="empty"></aside>
```

define 항목은 템플릿 대신 완성된 HTML을 담을 수도 있다. 다른 렌더러가 만든 영역을 페이지에 넣는 방법이다.

## 주석

```
a{* hidden *}b
{* whole line *}
c
```

는

```
ab
c
```

를 만든다.

## 태그가 아닌 중괄호

텍스트는 태그를 시작하지 않는 `{`를 그대로 유지하므로 스타일 시트, 스크립트, 컴포넌트 프레임워크를 고칠 필요가 없다.

```
css:  .a { color: red; }
js:   if (x) { return {a: 1}; }
vue:  {{ msg }}
jsx:  {items.map(f)}
tag:  \{= not a tag}
```

는

```
css:  .a { color: red; }
js:   if (x) { return {a: 1}; }
vue:  {{ msg }}
jsx:  {items.map(f)}
tag:  {= not a tag}
```

를 만든다.

실제 태그가 시작될 자리에 텍스트를 두려면 `\{`로 쓴다. 파일은 첫 줄에 `{% delimiter ;;}`처럼 써서 다른 구분자를 고를 수도 있다. 그 뒤로 태그는 `;= title;`로 쓴다.

## 함수

| 묶음 | 함수 |
| --- | --- |
| 출력 | `escape` `raw` `json` `url` `nl2br` |
| 텍스트 | `upper` `lower` `trim` `replace` `split` `truncate` `contains` `starts_with` `ends_with` `length` |
| 컬렉션 | `keys` `values` `first` `last` `reverse` `slice` `sort` `join` `range` `default` |
| 숫자 | `number` `round` `floor` `ceil` `abs` `min` `max` `num` |
| 값 | `str` `type` |
| 시간 | `date` `now` |

[함수 명세](/ko/spec/functions)가 각 함수의 인자와 정확한 결과를 정의한다. `date`는 애플리케이션이 전달한 고정 오프셋을 쓰므로 같은 데이터는 어디서나 같은 출력을 만든다.

애플리케이션은 자체 함수를 등록할 수 있다. 그 함수를 쓰는 템플릿은 그 함수가 등록된 곳에서만 렌더되므로, 템플릿을 렌더하는 모든 곳에 같은 이름을 등록한다.

## 템플릿 렌더

각 구현은 로더로 템플릿을 읽고 출력을 문자열로 반환한다.

```ts
import { AstProgram, Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const engine = new Engine(new AstProgram({ loader: new FsLoader('templates') }));
const html = engine.render('layout', assign, {
  define: { layout: 'page.tpl', content: 'pages/list.tpl' },
  env: { timezone: '+09:00', now: 1789084800 },
});
```

```go
program, _ := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(os.DirFS("templates"))})
engine := template.NewEngine(program)
html, _ := engine.Render("layout", assign, template.RenderOptions{
	Define: map[string]template.DefineInput{"layout": {Template: "page.tpl"}, "content": {Template: "pages/list.tpl"}},
})
```

```php
$program = new Polyspec\Template\AstProgram(new Polyspec\Template\Loader\FilesystemLoader('templates'));
$engine = new Polyspec\Template\Engine($program);
$html = $engine->render('layout', $assign, ['define' => ['layout' => ['template' => 'page.tpl'], 'content' => ['template' => 'pages/list.tpl']]]);
```

```rust
let engine = Engine::new(AstProgram::new(EngineOptions { loader: Some(Box::new(FsLoader::new("templates"))), ..Default::default() }));
let mut options = RenderOptions::default();
options.define.insert("layout".to_string(), DefineInput { template: Some("page.tpl".to_string()), ..Default::default() });
options.define.insert("content".to_string(), DefineInput { template: Some("pages/list.tpl".to_string()), ..Default::default() });
let html = engine.render(RenderTarget::Name("layout"), &assign, &options)?;
```

전체 API는 각 패키지 문서에 있다: [TypeScript](https://github.com/polyspec/template/tree/main/packages/template-ts), [Go](https://github.com/polyspec/template/tree/main/packages/template-go), [Rust](https://github.com/polyspec/template/tree/main/packages/template-rust), [PHP](https://github.com/polyspec/template/tree/main/packages/template-php).

## 브라우저에서 렌더

같은 템플릿을 TypeScript 패키지로 브라우저에서 렌더한다. 서버가 assign 데이터를 JSON으로 임베드하면 브라우저가 그것을 읽어 같은 템플릿 이름을 렌더한다. [브라우저 렌더링](/ko/operations/browser)이 템플릿과 데이터를 전달하는 방법과 컴포넌트 프레임워크를 엔진 옆에 두는 방법을 설명한다.

React를 사용할 때는 서버가 만든 shell을 유지하고 표시 지점으로 지정한 island만 클라이언트가 소유하게 한다. 정적 `react-boundary` showcase에서 템플릿, assign 데이터, 출력, 호스트 소스를 함께 확인할 수 있다. 서버 HTML이 같은 React 컴포넌트 트리에서 나온 경우에만 `hydrateRoot`를 사용하고, 그 외에는 별도의 `createRoot` island로 마운트한다.

## 오류

잘못된 곳이 있으면 렌더를 멈추고 코드와 위치를 보고한다. 다음 템플릿은

```
{= a}
{? b}
```

다음을 보고한다.

```
ERROR E_PARSE_UNCLOSED_BLOCK line 2 col 1
```

[오류 명세](/ko/spec/errors)가 모든 코드를 나열한다. 없는 변수는 오류가 아니고, 알 수 없는 함수, 잘못된 타입, 닫히지 않은 블록은 오류다.

## 이식성 있는 템플릿

- 등록 함수보다 내장 함수를 쓴다. 내장 함수만 쓰는 템플릿은 설정 없이 모든 구현에서 같게 렌더된다.
- 시간대와 현재 시각은 기기에 의존하지 말고 애플리케이션에서 전달한다.
- assign 데이터는 JSON 타입으로 유지한다: 텍스트, 숫자, 참과 거짓, 없음, list, map.
