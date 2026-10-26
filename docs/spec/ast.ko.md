<!-- doc-id: docs-spec-ast -->
<!-- source-sha256: bb1117e15d350bd677234fd0530648b79d67cea98564a240b874014712973881 -->
# AST

[English](/spec/ast).

AST는 템플릿 파일 하나를 파싱한 결과다. 모든 구현은 같은 소스에 대해 같은 AST를 생성한다. JSON Schema는 [`contracts/schema/ast.schema.json`](https://github.com/polyspec/template/blob/main/contracts/schema/ast.schema.json)에 있다.

## 구조

- **AST-1** 루트는 `type`, `name`(파서에 준 템플릿 이름), `body`(문장 노드 목록), `comments`(`Comment` 노드 목록, AST-9)를 가진 `Template` 노드다. `Template`에는 `span`이 없다.

- **AST-2** `Template` 이외의 모든 노드는 `type`과 `span`을 가진다. `span`은 `[start, end)`다. `start`는 소스에서 노드의 첫 바이트의 UTF-8 바이트 오프셋이고, `end`는 마지막 바이트 다음의 바이트 오프셋이다. 오프셋은 BOM 제거 후 파일의 첫 바이트를 0으로 센다.

- **AST-3** 문장 노드:

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

- **AST-4** 표현식 노드:

연산자와 loop metadata 리터럴 집합은 공개 SDK 데이터 계약이다. TypeScript는 문자열 union으로 이름을 붙이며 Rust는 공개 `UnaryOp`, `BinaryOp`, `LoopMetaField` enum을 사용하고 스키마 문자열로 직렬화한다. Go는 AST 노드 타입의 문자열 필드를 사용하고 PHP·PHP 확장·Python은 AST map 필드를 사용한다. 모든 공개 AST decoder는 이 필드들을 같은 스키마로 검증하고 정규 리터럴을 모두 보존한다. Rust의 `BinaryOp::as_str`은 같은 정규 연산자 텍스트를 반환한다.

| 노드 | 필드 | 값 규칙 |
| --- | --- | --- |
| `Literal` | `kind`, `value` | `kind`는 `null`, `bool`, `number`, `string` 중 하나; `value`는 `null`, 불리언, JSON 숫자, 또는 해석된 문자열 |
| `Var` | `name` | |
| `LoopMeta` | `loop`, `field` | `field`는 `index_`, `key_`, `value_`, `last_`, `first_`, `size_` 중 하나 |
| `Member` | `object`, `key` | `key`는 문자열; `a.0`의 key는 `"0"` |
| `MemberCall` | `object`, `method`, `args` | assign 인스턴스에 선언된 메서드를 호출한다 |
| `ClassCall` | `className`, `method`, `args` | 선언된 논리 클래스 함수를 호출한다 |
| `Index` | `object`, `index` | `index`는 표현식 |
| `Call` | `name`, `args` | `args`는 표현식 목록 |
| `Unary` | `op`, `operand` | `op`는 `!` 또는 `-` |
| `Binary` | `op`, `left`, `right` | `op`는 `+ - * / % == != === !== < > <= >= && \|\| ?? in` 중 하나 |
| `Ternary` | `test`, `then`, `else` | `?:`에서는 `then`이 `null` |
| `List` | `items` | 각 항목은 표현식 또는 `Spread` |
| `Map` | `entries` | 각 항목은 표현식 key와 value를 가진 `{key, value}`, 또는 `Spread` |
| `Spread` | `expr` | |

표현식 노드의 span은 표현식 텍스트의 소스 범위이며, 첫 바이트부터 마지막 바이트 다음까지이고 주변 공백을 포함하지 않는다.

- **AST-9** `Template.comments`는 파일의 모든 주석(LEX-10)을 소스 순서로 나열하며, block 본문 안의 주석과 wrapped 주석도 포함한다. `Comment` 노드는 `type`, `value`, `span`을 가진다. `value`는 기호 `*`와 종결자의 `*` 사이의 소스 텍스트를 바꾸지 않은 것이다. `{* note *}`의 값은 `" note "`, `{**}`의 값은 `""`이며, 여러 줄 주석은 줄 종결자를 유지한다. `span`은 태그의 span(AST-3)이다. 여는 구분자 또는 wrapped 주석의 wrapper opener부터 닫는 구분자의 끝 또는 wrapper closer의 끝까지다. 주석이 없는 템플릿은 빈 목록을 가진다. 이유: 주석은 출력과 문장 노드를 만들지 않으므로, 템플릿의 모든 주석을 읽는 도구는 소스를 다시 스캔하지 않고 parser에서 주석을 읽는다.

## 변환

- **AST-5** 파서는 다음 형태에 대해 다음 노드를 생성한다:

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

- **AST-6** 주석은 문장 노드를 생성하지 않고 `Template.comments`에 들어간다(AST-9). standalone 줄 제거는 `Text` 노드를 만들기 전에 적용하므로 `Text` 값은 제거된 줄을 포함하지 않는다. 주석이나 제거된 줄로만 분리된 텍스트는 하나의 `Text` 노드다. 다른 노드로 분리된 텍스트는 별개의 `Text` 노드다.

## 직렬화

- **AST-7** AST는 JSON으로 직렬화한다. 객체 키 순서는 의미가 없고 비교는 구조적이다. `span`은 `Template` 이외의 모든 노드에 존재한다. 숫자 리터럴은 JSON 숫자로 직렬화하므로 `1e3`은 `1000`으로, `1.50`은 `1.5`로 직렬화한다. 문자열 리터럴은 해석된 문자열로 직렬화한다. `null` 필드는 생략하지 않고 JSON `null`로 쓴다.

- **AST-8** 직렬화된 모든 AST는 `contracts/schema/ast.schema.json` 검증을 통과한다. `scripts/check-schema.mts`가 스키마와 `tests/cases/`의 모든 `expected.ast.json`을 검증한다.

- **AST-10** AST를 렌더링하는 모든 런타임은 AST JSON(AST-7)을 자기 `parse`가 반환하는 AST로 읽는 decode를 공개한다: TypeScript는 패키지 entry와 render 전용 entry의 `decodeTemplate`, Go는 `ast.DecodeTemplate`, Rust와 Python은 `decode_template`, PHP는 `AstProgram::decodeTemplate`이다. TypeScript, Go, Rust는 자기 AST 타입을 반환하고, PHP와 PHP 확장은 배열을, Python은 dict를 파서가 만드는 대로 반환한다: 숫자 리터럴은 float이고 Python에서 span은 tuple이다. decode는 JSON을 자기 생태계의 JSON Schema 검증기로 `contracts/schema/ast.schema.json`에 대해 검증한다: ajv, santhosh-tekuri/jsonschema, crate jsonschema, opis/json-schema, PyPI 패키지 jsonschema다. 스키마가 거부한 JSON은 경로가 잘못된 노드의 JSON Pointer(RFC 6901)인 오류로 실패한다: 검증기 오류들의 instance 위치 중 가장 깊은 것이며, 그 깊이에 여럿이면 code point 순서로 가장 작은 것이다. 스키마는 노드의 스키마를 `if`/`then`으로 그 `type`에 따라 고르므로 오류는 그 노드 자신의 값을 말하며, 모든 런타임은 `tests/fixtures/ast-decode/invalid.json`의 각 잘못된 AST에 같은 pointer를 말한다. JSON이 아닌 텍스트는 그 언어의 JSON 오류로 실패한다. Rust는 스키마가 받아들이지만 자기 타입이 담을 수 없는 값, 예를 들어 `usize`를 넘는 span offset에서도 그 값을 담은 노드의 pointer로 실패한다. 스키마는 한 파일이다: TypeScript의 빌드는 `contracts/schema/ast.schema.json`을 번들하고, Go(`ast/ast.schema.json`, `embed`), Rust(`src/ast.schema.json`, `include_str!`), Python(package data), PHP(`resources/ast.schema.json`)와 PHP 확장(`src/pt_ast_schema.h`, C 문자열)은 패키지의 테스트가 그 파일과 바이트 단위로 비교하는 사본을 가진다. PHP 확장도 PHP 패키지와 같이 decode한다: 확장의 `AstProgram::decodeTemplate`은 스키마가 쓰는 키워드의 검증기를 확장의 C로 작성한 검증기로 검증하고, opis/json-schema가 주는 것과 같은 pointer와 이유를 말하므로, 확장이 있든 없든 실패는 같은 오류다. 이유: 파싱된 템플릿을 AST JSON으로 저장하는 호스트(RT-41), 예를 들어 그것을 브라우저로 보내는 서버는 그것을 cast하지 않고 검사된 AST로 다시 읽는다.

## 예제

템플릿 이름 `x.tpl`, 소스 `<b>{= product.price | number}</b>`:

```json
{
  "type": "Template",
  "name": "x.tpl",
  "comments": [],
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

공개 shape와 필드는 canonical schema를 따른다. TypeScript interface·Go struct·Rust struct 또는 enum variant가 각 네이티브 표현을 공개한다. PHP 배열과 Python dictionary는 AST-10의 공개 decoder를 통해 같은 필드를 공개한다. API 선언은 독립적인 symbol이 있는 네이티브 property를 식별하고, 암묵적인 enum tag는 variant에, 배열·dictionary 필드는 decoder 계약에 속한다. 등록된 클래스가 없는 class call을 포함해 decoder 왕복 검사가 모든 schema shape와 필드를 다룬다.
