# AST

[English](ast.md).

AST는 템플릿 파일 하나를 파싱한 결과다. 모든 구현은 같은 소스에 대해 같은 AST를 생성한다. JSON Schema는 [`schema/ast.schema.json`](../../schema/ast.schema.json)에 있다.

## 구조

**AST-1** 루트는 `type`, `name`(파서에 준 템플릿 이름), `body`(문장 노드 목록)를 가진 `Template` 노드다. `Template`에는 `span`이 없다.

**AST-2** `Template` 이외의 모든 노드는 `type`과 `span`을 가진다. `span`은 `[start, end)`다. `start`는 소스에서 노드의 첫 바이트의 UTF-8 바이트 오프셋이고, `end`는 마지막 바이트 다음의 바이트 오프셋이다. 오프셋은 BOM 제거 후 파일의 첫 바이트를 0으로 센다.

**AST-3** 문장 노드:

| 노드 | 필드 | Span |
| --- | --- | --- |
| `Text` | `value` | 값에 기여하는 첫 소스 바이트부터 마지막 소스 바이트까지 |
| `Echo` | `expr` | `{`부터 `}`까지의 태그 |
| `If` | `branches`(`{test, body, span}` 목록), `else`(노드 목록 또는 `null`) | 여는 태그부터 닫는 태그의 끝까지 |
| `For` | `name`, `iter`, `body`, `empty`(노드 목록 또는 `null`) | 여는 태그부터 닫는 태그의 끝까지 |
| `Set` | `name`, `expr` | 태그 |
| `Include` | `path` | 태그 |
| `Block` | `id`(문자열 또는 `null`), `path`(문자열 또는 `null`), `scope`(`{name, expr}` 목록) | 태그 |
| `IfBlock` | `id`, `body`, `else`(노드 목록 또는 `null`) | 여는 태그부터 닫는 태그의 끝까지 |

래퍼 태그로 쓴 태그의 span은 래퍼 열기에서 래퍼 닫기의 끝까지다. `If.branches`의 각 항목은 여는 태그(`{? ...}` 또는 `{:? ...}`)의 `span`을 가진다. `else`는 블록에 `{:}` 태그가 없으면 `null`이고, 있으면 빈 목록을 포함한 목록이다.

**AST-4** 표현식 노드:

| 노드 | 필드 | 값 규칙 |
| --- | --- | --- |
| `Literal` | `kind`, `value` | `kind`는 `null`, `bool`, `number`, `string` 중 하나; `value`는 `null`, 불리언, JSON 숫자, 또는 해석된 문자열 |
| `Var` | `name` | |
| `LoopMeta` | `loop`, `field` | `field`는 `index_`, `key_`, `value_`, `last_`, `first_`, `size_` 중 하나 |
| `Member` | `object`, `key` | `key`는 문자열; `a.0`의 key는 `"0"` |
| `Index` | `object`, `index` | `index`는 표현식 |
| `Call` | `name`, `args` | `args`는 표현식 목록 |
| `Unary` | `op`, `operand` | `op`는 `!` 또는 `-` |
| `Binary` | `op`, `left`, `right` | `op`는 `+ - * / % == != === !== < > <= >= && \|\| ?? in` 중 하나 |
| `Ternary` | `test`, `then`, `else` | `?:`에서는 `then`이 `null` |
| `List` | `items` | 각 항목은 표현식 또는 `Spread` |
| `Map` | `entries` | 각 항목은 표현식 key와 value를 가진 `{key, value}`, 또는 `Spread` |
| `Spread` | `expr` | |

표현식 노드의 span은 표현식 텍스트의 소스 범위이며, 첫 바이트부터 마지막 바이트 다음까지이고 주변 공백을 포함하지 않는다.

## 변환

**AST-5** 파서는 다음 형태에 대해 다음 노드를 생성한다:

| 소스 | 노드 |
| --- | --- |
| `a \| f(b, c)` | args `[a, b, c]`를 가진 `Call` `f`; span은 `a`의 시작부터 `)`의 끝까지 |
| `a \| f` | args `[a]`를 가진 `Call` `f` |
| `x += e` (`-= *= /= %=` 포함) | `Binary` `+` (`Var` `x`, `e`)를 가진 `Set` `x` |
| `x++`, `x--` | `Binary` `+` 또는 `-` (`Var` `x`, `Literal` number `1`)를 가진 `Set` `x` |
| 표현식 끝의 `e ??` | `Binary` `??` (`e`, `Literal` `null`) |
| `a ?: b` | `test` `a`, `then` `null`, `else` `b`를 가진 `Ternary` |
| `-1` | `Unary` `-` (`Literal` number `1`) |
| `(e)` | `e`의 노드. 괄호는 노드를 만들지 않고 span에 포함되지 않는다 |

말미 `??`에 대해 생성되는 `Literal` `null`은 `??` 토큰 끝의 빈 span을 가진다. `Binary` 노드는 왼쪽 피연산자부터 `??`의 끝까지다.
| `name`이 식별자이고 필드가 루프 메타 필드인 `name.index_` | `LoopMeta` |

**AST-6** 주석은 노드를 생성하지 않는다. standalone 줄 제거는 `Text` 노드를 만들기 전에 적용하므로 `Text` 값은 제거된 줄을 포함하지 않는다. 주석이나 제거된 줄로만 분리된 텍스트는 하나의 `Text` 노드다. 다른 노드로 분리된 텍스트는 별개의 `Text` 노드다.

## 직렬화

**AST-7** AST는 JSON으로 직렬화한다. 객체 키 순서는 의미가 없고 비교는 구조적이다. `span`은 `Template` 이외의 모든 노드에 존재한다. 숫자 리터럴은 JSON 숫자로 직렬화하므로 `1e3`은 `1000`으로, `1.50`은 `1.5`로 직렬화한다. 문자열 리터럴은 해석된 문자열로 직렬화한다. `null` 필드는 생략하지 않고 JSON `null`로 쓴다.

**AST-8** 직렬화된 모든 AST는 `schema/ast.schema.json` 검증을 통과한다. `scripts/check-schema.mjs`가 스키마와 `tests/cases/`의 모든 `expected.ast.json`을 검증한다.

## 예제

템플릿 이름 `x.tpl`, 소스 `<b>{= product.price | number}</b>`:

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
