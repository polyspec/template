# 적합성

[English](/spec/conformance).

적합성은 모든 구현이 하나의 계약을 가진 명령줄 인터페이스로 렌더하는 픽스처 케이스와, 모든 구현이 자기 테스트에서 로드하는 표현식 픽스처로 검증한다.

## 픽스처 케이스

**CNF-1** 케이스는 디렉터리 `tests/cases/<group>/<name>/`다. `<group>`과 `<name>`은 소문자, 숫자, `-`로 이루어진다.

**CNF-2** 케이스 디렉터리의 파일:

| 파일 | 필수 | 내용 |
| --- | --- | --- |
| `input.tpl` | 예 | 진입 템플릿. 템플릿 이름은 `input.tpl`이다. |
| 그 외 `.tpl` 파일 | 아니오 | include와 block 태그가 참조하는 템플릿. 로더 루트는 케이스 디렉터리다. |
| `data.json` | 아니오 | assign 데이터. 기본값 `{}`. |
| `define.json` | 아니오 | 템플릿 define. 기본값 `{}`. 각 값은 문자열 경로, 선택 `"data"` 객체를 가진 `{"template": "path"}` 또는 `{"html": "string"}`이다. 경로는 케이스 디렉터리 기준이다. |
| `env.json` | 아니오 | 환경. 기본값 `{"timezone": "Z", "now": 0}`. |
| `options.json` | 아니오 | 엔진 옵션. 기본값 `{}`. `{"delimiters": ";;"}`는 구분자를 선택한다. |
| `case.json` | 예 | `{"rules": ["LEX-3"], "stage": 1}`. `rules`는 케이스가 다루는 명세 규칙을 나열한다. `stage`는 렉시컬·문법·표현식 케이스가 1, 함수·데이터 모델·공백 케이스가 2, include·block·래퍼·구분자·오류 케이스가 3이다. |
| `expected.ast.json` | 예. 단 `expected.error.json`이 `input.tpl`의 렉시컬 또는 파싱 오류를 지정하면 제외 | `input.tpl`의 AST. include와 block은 전개하지 않는다. |
| `expected.html` | 둘 중 하나 | 정확한 렌더 출력. |
| `expected.error.json` | 둘 중 하나 | 기대 오류의 `{"code", "template", "line", "col"}`. |

**CNF-3** `scripts/check-rules.mjs`는 `docs/spec/*.md`에 정의된 모든 규칙 식별자와 `case.json` 파일에 나열된 모든 식별자를 수집한다. 어떤 문서도 정의하지 않은 규칙을 `case.json`이 지정하면 실패하고, 어떤 케이스도 다루지 않는 규칙을 보고한다. `make check`가 이를 실행한다.

## 명령줄 계약

**CNF-4** 모든 구현은 두 하위 명령을 가진 명령을 제공한다.

| 명령 | 출력 | 종료 상태 |
| --- | --- | --- |
| `parse FILE [--root DIR] [--delimiters OC]` | stdout에 AST JSON. | 0 |
| `render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]` | stdout에 렌더된 HTML. | 0 |
| 두 하위 명령 모두, 템플릿 오류 | stderr에 오류 JSON. | 2 |
| 두 하위 명령 모두, 사용 오류 | stderr에 메시지. | 1 |

`--root`의 기본값은 `FILE`의 디렉터리다. 파서에 전달하고 오류에 사용하는 템플릿 이름은 루트 기준 `FILE`의 상대 경로다. `--data`, `--define`, `--env`는 CNF-2의 내용을 가진 JSON 파일을 지정한다. `--delimiters`는 엔진 옵션 `delimiters`의 두 문자 값이다. 러너는 `options.json`의 값을 전달한다. 출력은 UTF-8이다. 명령은 끝에 개행을 추가하지 않는다.

**CNF-5** 구현별 명령:

| 구현 | 명령 |
| --- | --- |
| ts | `node packages/template-ts/bin/template.mjs` |
| go | `packages/template-go/template` |
| rust | `packages/template-rust/target/release/template` |
| php | `php packages/template-php/bin/template.php` |
| php-ext | `php -d extension=packages/template-php-ext/target/release/libpolyspec_template.so packages/template-php-ext/bin/template-ext.php` |

## 비교

**CNF-6** AST 비교는 두 JSON 문서를 파싱해 재귀적으로 비교한다. 객체 키 순서는 의미가 없다. 숫자는 값으로 비교한다.

**CNF-7** HTML 비교는 stdout의 바이트와 `expected.html`의 바이트를 비교한다.

**CNF-8** 오류 비교는 stderr JSON의 `code`, `template`, `line`, `col`을 `expected.error.json`과 비교한다. `expected.error.json`이 있는 케이스는 종료 상태가 2일 때만 통과한다.

**CNF-9** `parse` 결과가 `expected.ast.json`과 같고 `render` 결과가 CNF-7 또는 CNF-8을 만족할 때 케이스가 그 구현에서 통과한다.

## 러너

**CNF-10** `tests/runner/conformance.mjs`는 케이스를 열거하고, 선택된 모든 구현을 실행하고, 케이스와 구현마다 한 행을 출력하고, 비교가 하나라도 실패하면 상태 1로 종료한다.

| 옵션 | 효과 |
| --- | --- |
| `--langs a,b` | 나열된 구현을 실행한다. 기본값: 명령이 존재하는 모든 구현. |
| `--case group/name` | 케이스 하나를 실행한다. |
| `--list` | 실행하지 않고 케이스 id와 건수를 출력한다. |
| `--update ast\|html\|error` | 지정한 종류의 기대 파일을 `ts` 구현의 결과로 쓴다. `ts`가 선택된 구현에 포함되어야 한다. |

**CNF-11** `tests/runner/parity.mjs`는 선택된 모든 구현을 모든 케이스에 실행하고 구현들의 출력을 서로 비교한다. 기대 파일을 읽지 않는다. 출력이 다른 케이스를 보고하고 하나라도 다르면 상태 1로 종료한다.

## 표현식 픽스처

**CNF-12** `tests/fixtures/expr/cases.json`은 표현식 케이스의 목록이다. 모든 구현은 자기 테스트 스위트에서 이 파일을 로드한다.

```json
{
  "name": "coalesce-default",
  "expr": "a.b ?? 'x'",
  "tokens": [
    { "type": "IDENT", "value": "a" },
    { "type": "DOT_IDENT", "value": ".b" },
    { "type": "COALESCE", "value": "??" },
    { "type": "STRING", "value": "'x'" },
    { "type": "EOF", "value": "" }
  ],
  "ast": {
    "type": "Binary", "op": "??", "span": [0, 10],
    "left": { "type": "Member", "key": "b", "span": [0, 3], "object": { "type": "Var", "name": "a", "span": [0, 1] } },
    "right": { "type": "Literal", "kind": "string", "value": "x", "span": [7, 10] }
  },
  "cases": [
    { "data": { "a": { "b": 1 } }, "value": 1 },
    { "data": { "a": null }, "value": "x" }
  ]
}
```

케이스는 `name`(고유), `expr`(태그 없는 표현식 소스), `tokens`, `ast`, `cases`(`{data, value}` 목록)를 가지거나, 파싱되지 않는 소스에 대해 `name`, `expr`, `error`(오류 코드)를 가진다. span은 `expr`의 시작부터 바이트를 센다.

**CNF-13** 토큰 타입:

| 타입 | 소스 |
| --- | --- |
| `IDENT` | 식별자 |
| `NUMBER` | 숫자 리터럴 |
| `STRING` | 따옴표를 포함한 문자열 리터럴 |
| `DOT_IDENT` | `.` 뒤에 식별자 |
| `DOT_INDEX` | `.` 뒤에 숫자 |
| `LPAREN` `RPAREN` | `(` `)` |
| `LBRACKET` `RBRACKET` | `[` `]` |
| `COMMA` | `,` |
| `PIPE` | `\|` |
| `QUESTION` `COLON` | `?` `:` |
| `ELVIS` | `?:` |
| `COALESCE` | `??` |
| `ARROW` | `=>` |
| `SPREAD` | `...` |
| `PLUS` `MINUS` `STAR` `SLASH` `PERCENT` | `+` `-` `*` `/` `%` |
| `BANG` | `!` |
| `EQ` `NE` `SEQ` `SNE` | `==` `!=` `===` `!==` |
| `LT` `GT` `LE` `GE` | `<` `>` `<=` `>=` |
| `AND` `OR` | `&&` `\|\|` |
| `IN` | `in` |
| `NULL` `TRUE` `FALSE` | `null` `true` `false` |
| `EOF` | 입력의 끝, value `""` |

`value`는 토큰의 소스 텍스트다. 공백은 토큰을 생성하지 않는다. 스트림은 `EOF`로 끝난다.

**CNF-14** 각 표현식 케이스에 대해 구현은 세 결과를 검사한다: 토큰 스트림이 `tokens`와 같고, 파싱된 AST가 `ast`와 같고, `cases`의 각 항목에 대해 `data`를 루트 데이터로 평가한 표현식의 값이 `value`와 같다. 값은 JSON으로 비교한다. safe 문자열은 일반 문자열로 비교한다. `error`가 있는 케이스는 파싱이 그 코드를 발생시키는지 검사한다.
