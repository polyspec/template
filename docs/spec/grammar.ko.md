# 태그 문법

[English](/spec/grammar).

이 문서는 모든 태그의 본문과 블록의 구조를 정의한다. 태그 경계는 `lexical.md`가 정의한다. 표현식은 `expressions.md`가 정의한다. 각 태그의 평가는 `runtime.md`가 정의한다. AST 노드는 `ast.md`가 정의한다.

## 1. 템플릿

**GRM-1** 템플릿은 텍스트, 태그, 주석의 열이다.

```ebnf
template   = { text | tag | wrapped | comment } ;
tag        = "{" HWS sigil_body HWS "}" | "{" ":" HWS assign HWS "}" ;
wrapped    = wrap_open HWS "{{" HWS sigil_body HWS "}}" HWS wrap_close
           | wrap_open HWS "{{" ":" HWS assign HWS "}}" HWS wrap_close ;
comment    = "{" HWS "*" { any } "*}" ;
wrap_open  = '"' | "'" | "/*" | "<!--" ;
wrap_close = '"' | "'" | "*/" | "-->" ;
HWS        = { " " | "\t" } ;
```

`any`는 `*}`를 포함하지 않는 임의의 바이트 열이다. 래퍼 태그는 `lexical.md`가 정의한다. 그 본문은 태그 본문과 같은 규칙을 따른다.

## 2. 태그 본문

**GRM-2** 태그 본문은 다음 형태 중 하나다. `expression`과 `postfix`는 `expressions.md`가 정의한다. `IDENT`는 `[A-Za-z_][A-Za-z0-9_]*`다. `STRING`은 `expressions.md`가 정의하는 문자열 리터럴이다.

```ebnf
body       = sigil_body | assign ;
sigil_body = echo | loop | if | elseif | else | close | include | block | ifblock | directive ;
echo       = "=" expression ;
loop       = "@" IDENT HWS "=" expression ;
if         = "?" expression ;
elseif     = ":?" expression ;
else       = ":" ;
close      = "/" ;
include    = "+" path ;
block      = "#" [ IDENT ] [ path ] { scope_item } ;
scope_item = IDENT [ ":" postfix ] ;
ifblock    = "?#" IDENT ;
assign     = IDENT HWS ( "=" expression
                       | ( "+=" | "-=" | "*=" | "/=" | "%=" ) expression
                       | "++" | "--" ) ;
directive  = "%" HWS "delimiter" HWS DELIMS ;
path       = STRING | BARE_PATH ;
BARE_PATH  = { "A".."Z" | "a".."z" | "0".."9" | "_" | "." | "/" | "-" } ;
DELIMS     = DELIM DELIM ;
```

`DELIM`은 `lexical.md`가 구분자로 허용하는 문자 하나다.

**GRM-3** `BARE_PATH`는 공백을 포함하지 않고, GRM-2에 나열된 문자로만 이루어지며, `.` 또는 `/`를 하나 이상 포함한다. 경로 위치의 토큰이 `STRING`도 `BARE_PATH`도 아니면 `E_PARSE_INVALID_PATH`로 거부한다.

```
{+ parts/head.tpl}
{+ ../footer.tpl}
{+ "notes"}
{+ 'a b.tpl'}
{+ notes}
```

마지막 태그는 `notes`가 `.`도 `/`도 포함하지 않으므로 `E_PARSE_INVALID_PATH`로 거부한다.

**GRM-4** 경로는 태그를 포함한 템플릿의 디렉터리를 기준으로 해석한다. `/`로 시작하는 경로는 로더 루트를 기준으로 해석한다. 세그먼트 `.`과 `..`은 정규화한다. 정규화 결과가 로더 루트를 벗어나는 경로는 `E_LOAD_OUTSIDE_ROOT`로 거부한다. 해석은 `runtime.md`가 정의한다.

**GRM-5** 기호 형태에서 기호와 본문 첫 토큰 사이의 공백은 선택이다. 대입 형태에서는 `{` 뒤에 `:`가 오고, 그 뒤의 선택적 수평 공백 다음에 식별자가 온다. 자세한 내용은 `lexical.md`에 정의한다.

## 3. Echo

**GRM-6** echo 태그는 `=` 뒤에 표현식 하나다. 표현식의 값은 `runtime.md`가 정의하는 대로 출력한다.

```
{= title}
{= item.price | number}
{= json(state) | raw}
```

## 4. 루프

**GRM-7** 루프 태그는 `@`, 식별자, `=`, 표현식 하나다. 식별자는 루프 변수다. 예약어(`true`, `false`, `null`, `in`)를 루프 변수로 쓰면 `E_PARSE_RESERVED_NAME`으로 거부한다. 루프 태그는 블록을 연다.

```
{@ item = items}
{@ row = rows | slice(0, 10)}
```

**GRM-8** 루프 블록 안에서 블록 최상위의 `{:}` 태그 최대 하나가 빈 분기를 시작한다. 빈 분기는 `runtime.md`가 정의하는 대로 루프 본문이 0회 실행될 때 평가한다.

```
{@ item = items}
<li>{= item}</li>
{:}
<li>none</li>
{/}
```

## 5. 조건

**GRM-9** if 태그는 `?` 뒤에 표현식 하나다. if 태그는 블록을 연다.

**GRM-10** if 블록 안에서 블록 최상위의 `{:? expression}` 태그 0개 이상이 추가 분기를 시작하고, `{:}` 태그 최대 하나가 else 분기를 시작한다. 태그에는 순서가 있다: 모든 `{:?}` 태그는 `{:}` 태그보다 앞에 온다.

```
{? level == 1}
one
{:? level == 2}
two
{:}
other
{/}
```

## 6. 닫기

**GRM-11** 닫기 태그 `{/}`는 가장 안쪽의 열린 블록을 닫는다. 닫기 태그는 `/` 뒤에 본문이 없다.

## 7. Include

**GRM-12** include 태그는 `+` 뒤에 경로 하나다. 경로의 템플릿은 `runtime.md`가 정의하는 대로 포함하는 템플릿의 스코프로 태그 위치에 렌더한다.

```
{+ parts/head.tpl}
```

## 8. 블록

**GRM-13** 블록 태그는 `#` 뒤에 다음 순서로 온다: 선택적 블록 식별자, 선택적 경로, 0개 이상의 scope 항목. 첫 토큰이 역할을 결정한다: `IDENT`는 블록 식별자다; `STRING` 또는 `BARE_PATH`는 경로다. 첫 토큰이 블록 식별자일 때 두 번째 토큰은 경로일 수 있다. 이후의 모든 토큰은 scope 항목이다.

**GRM-14** scope 항목은 `IDENT` 또는 `IDENT:postfix`다. `IDENT` 형태는 `IDENT:IDENT`와 같다. `postfix`는 `expressions.md`가 정의하는 postfix 표현식이며 공백을 포함하지 않는다. 식별자는 블록 안에서 보이는 이름이고, postfix는 값이다.

**GRM-15** 경로가 둘인 블록 태그, 식별자가 없는 scope 항목, 그 외의 토큰 순서는 `E_PARSE_INVALID_BLOCK_TAG`로 거부한다.

다음 블록 태그는 유효하다:

```
{# contents}
{# contents menus}
{# head parts/head.tpl}
{# head "parts/head.tpl" title}
{# parts/card.tpl item no:item.index_}
{# ../footer.tpl year:date(now(), "Y") links}
```

의미는 순서대로: 등록된 블록 `contents`를 렌더; `menus`를 `menus`에 바인딩하고 등록된 블록 `contents`를 렌더; `head`를 `parts/head.tpl`로 등록하고 렌더; 같은 동작에 `title`을 `title`에 바인딩; `item`을 `item`에, `no`를 `item.index_`에 바인딩하고 `parts/card.tpl`을 렌더; `year`를 호출 결과에, `links`를 `links`에 바인딩하고 `../footer.tpl`을 렌더. 등록과 렌더는 `runtime.md`가 정의한다.

다음 블록 태그는 `E_PARSE_INVALID_BLOCK_TAG`로 거부한다:

```
{# a.tpl b.tpl}
{# :item}
{#}
```

## 9. If-block

**GRM-16** if-block 태그는 `?#` 뒤에 식별자 하나다. if-block 태그는 블록을 연다. if-block 안에서 블록 최상위의 `{:}` 태그 최대 하나가 else 분기를 시작한다. `{:?}` 태그는 `E_PARSE_ELSEIF_NOT_IN_IF`로 거부한다. 블록 본문은 `runtime.md`가 정의하는 대로 그 식별자의 블록이 등록되어 있을 때 평가한다.

```
{?# contents}
<main>{# contents}</main>
{:}
<main class="empty"></main>
{/}
```

## 10. 대입

**GRM-17** 대입 태그는 `:` 뒤에 식별자가 오고, 그 뒤에 `=`와 표현식 하나, 또는 `+=`, `-=`, `*=`, `/=`, `%=` 중 하나와 표현식 하나, 또는 `++`나 `--`가 온다. 예약어를 식별자로 쓰면 `E_PARSE_RESERVED_NAME`으로 거부한다. 각 형태는 다음 대입과 같다:

```
{:n += e}   is   {:n = n + e}
{:n -= e}   is   {:n = n - e}
{:n *= e}   is   {:n = n * e}
{:n /= e}   is   {:n = n / e}
{:n %= e}   is   {:n = n % e}
{:n++}      is   {:n = n + 1}
{:n--}      is   {:n = n - 1}
```

AST는 `ast.md`가 정의하는 대로 전개된 형태만 포함한다.

```
{:total = 0}
{:total += item.price}
{:i++}
```

## 11. 지시문

**GRM-24** 지시문 태그는 `%`, 단어 `delimiter`, 구분자 문자 두 개다. 위치, 효과, 오류는 `lexical.md`가 정의한다. 지시문 태그는 AST에 노드가 없다.

```
{% delimiter ;;}
{% delimiter [] }
```

## 12. 블록 구조

**GRM-18** 루프, if, if-block 태그는 블록을 연다. 태그 `{/}`는 가장 안쪽의 열린 블록을 닫는다. 블록은 중첩한다. 열린 블록이 없을 때의 `{/}` 태그는 `E_PARSE_UNEXPECTED_CLOSE`로 거부한다.

**GRM-19** 소스 끝에서 여전히 열린 블록은 `E_PARSE_UNCLOSED_BLOCK`으로 거부한다. 보고하는 위치는 여는 태그다.

**GRM-20** 블록은 하나의 소스 안에서 균형을 이룬다. 포함된 템플릿은 포함하는 템플릿이 닫는 블록을 열 수 없고, 포함하는 템플릿이 연 블록을 닫을 수 없다.

**GRM-21** 모든 블록 밖의 `{:? expression}` 태그는 `E_PARSE_ELSE_OUTSIDE_BLOCK`으로 거부한다. 가장 안쪽의 열린 블록이 루프 또는 if-block인 `{:? expression}` 태그는 `E_PARSE_ELSEIF_NOT_IN_IF`로 거부한다.

**GRM-22** 모든 블록 밖의 `{:}` 태그는 `E_PARSE_ELSE_OUTSIDE_BLOCK`으로 거부한다. 같은 블록의 두 번째 `{:}` 태그는 `E_PARSE_DUPLICATE_ELSE`로 거부한다. 같은 블록의 `{:}` 태그 뒤에 오는 `{:?}` 태그는 `E_PARSE_ELSEIF_AFTER_ELSE`로 거부한다.

**GRM-23** GRM-2의 어느 형태도 만족하지 않는 태그 본문은 `E_PARSE_UNEXPECTED_TOKEN`으로 거부한다. 보고하는 위치는 일치하지 않는 첫 토큰이다.

다음 소스는 1행에서 `E_PARSE_UNCLOSED_BLOCK`으로 거부한다:

```
{? a}
<p>a</p>
```

다음 소스는 2행에서 `E_PARSE_ELSEIF_NOT_IN_IF`로 거부한다:

```
{@ item = items}
{:? item}
{/}
```
