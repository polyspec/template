<!-- doc-id: docs-spec-conformance -->
<!-- source-sha256: db7cd75982d835f47603dcb54ba9438f9e325716e0d4034e519e9577c966d24b -->
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
| `expected.tokens.json` | `expected.ast.json`이 있을 때 | `input.tpl`의 토큰(FMT-1, FMT-2). `[start, end, type]`의 JSON 배열. |
| `expected.format.json` | `expected.ast.json`이 있을 때 | `{"indent": R, "keep": R}`. `input.tpl`을 기본 옵션(`indent`, 공백 두 개, `templateBlocks` `indent`)과 `indent: null`(`keep`)로 포맷한 결과다([포맷](/ko/spec/formatting)). `R`은 `{"text": "<포맷한 텍스트>"}` 또는 `{"error": {"reason", "code", "line", "col"}}`이다(FMT-14). |

**CNF-15** `scripts/check-schema.mts`는 모든 케이스 디렉터리에서 `expected.ast.json`이 있는지 검사한다. 케이스에 `expected.ast.json`이 없고 그 `expected.error.json`이 `template`이 `input.tpl`인 `E_LEX_*` 또는 `E_PARSE_*` 코드를 지정하지 않으면 실패하고, `expected.error.json`이 그런 오류를 지정하는데 `expected.ast.json`이 있어도 실패한다. `expected.ast.json`이 있는 케이스에 `expected.tokens.json`이나 `expected.format.json`이 없을 때, 그것이 없는 케이스에 있을 때, 또는 CNF-2의 내용을 갖지 않을 때도 실패한다. `make schema-check`와 `make docs-check`가 이를 실행하므로 파일이 없으면 `make check`가 실패한다. 이유: CNF-9는 입력이 파싱되는 모든 케이스의 파싱, 토큰, 포맷 결과를 비교하며, 파일이 없는 케이스는 그렇지 않으면 그 비교 없이 통과한다.

**CNF-16** `tests/fixtures/filesystem/cases.json`은 파일시스템 로더(RT-10)의 filesystem 케이스를 나열한다. checkout은 symbolic link와 hard link를 담지 않으므로 케이스 디렉터리는 이 케이스를 담을 수 없다. 각 케이스는 `name`, `rules`, `files`(template 이름에서 그 텍스트로의 map, `input.tpl` 포함), 선택적 `symbolicLinks`와 `hardLinks`(이름에서 대상 이름으로의 map), 그리고 `html` 또는 `error`(`{code, template, line, col}`)를 가진 `expected`를 가진다. `tests/runner/conformance.mts`는 각 케이스의 tree를 시스템 임시 디렉터리의 한 디렉터리에 쓰고, 선택된 모든 구현의 `render --root <directory> input.tpl`을 케이스 `filesystem/<name>`으로 실행해 결과를 CNF-7과 CNF-8로 비교한다. `--case filesystem`이 이 케이스들을 선택한다.

**CNF-3** `scripts/check-rules.mts`는 `docs/spec/*.md`에 정의된 모든 규칙 식별자와 `case.json` 파일에 나열된 모든 식별자를 수집한다. 어떤 문서도 정의하지 않은 규칙을 `case.json`이 지정하면 실패하고, 어떤 케이스도 다루지 않는 규칙을 보고한다. `make check`가 이를 실행한다.

## 명령줄 계약

**CNF-4** 모든 구현은 네 하위 명령을 가진 명령을 제공한다.

| 명령 | 출력 | 종료 상태 |
| --- | --- | --- |
| `parse [--root DIR] [--delimiters OC] FILE` | stdout에 AST JSON. | 0 |
| `render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE` | stdout에 렌더된 HTML. | 0 |
| `tokens [--root DIR] [--delimiters OC] FILE` | stdout에 FMT-1과 FMT-2의 토큰을 `[start, end, type]`의 JSON 배열로. | 0 |
| `format [--indent none\|tab\|N] [--delimiters OC] FILE` | stdout에 포맷한 텍스트. 바뀌는 것이 없으면 소스. | 0 |
| `parse`, `render`, `tokens`, 템플릿 오류 | stderr에 오류 JSON. | 2 |
| `format`, 포맷 오류 | stderr에 FMT-14의 JSON `{"reason", "code", "line", "col", "message"}`. | 2 |
| 모든 하위 명령, 사용 오류 | stderr에 메시지. | 1 |

러너는 하이픈으로 시작하는 값(구분자 쌍 `-!`)이 옵션으로 읽히지 않도록 각 옵션을 `--name=value` 한 인자로 넘기고, POSIX 유틸리티 문법 지침(지침 9와 10)의 순서대로 옵션을 `FILE`보다 앞에 넘긴다. 몇몇 표준 파서는 첫 피연산자에서 멈추기 때문이다. 구현은 자기 언어의 표준 파서(예: TypeScript는 node:util의 `parseArgs`, Go `flag`, Rust `clap`, Python `argparse`, PHP `symfony/console`)로 파싱하고, 다른 순서에서는 그 파서의 동작을 따른다. `--root`의 기본값은 `FILE`의 디렉터리다. 파서에 전달하고 오류에 사용하는 템플릿 이름은 루트 기준 `FILE`의 상대 경로다. `--data`, `--define`, `--env`는 CNF-2의 내용을 가진 JSON 파일을 지정한다. 읽을 수 없는 파일은 사용 오류다. 내용이 하나의 JSON 문서가 아닌 파일은 ERR-5의 위치를 가진 템플릿 오류 `E_DATA_INVALID_JSON`이다(VAL-12). 이 파일의 다른 데이터 오류도 같은 위치에서 해당 `E_DATA_*` 코드를 가진 템플릿 오류다. `--delimiters`는 엔진 옵션 `delimiters`의 두 문자 값이다. 러너는 `options.json`의 값을 전달한다. `--indent`는 FMT-9의 들여쓰기 단위다. `N`은 공백 수(1~8, 기본값 2), `tab`은 탭, `none`은 `indent: null`이다. `format`은 `templateBlocks` `indent`를 쓴다. 출력은 UTF-8이다. 명령은 끝에 개행을 추가하지 않는다.

**CNF-5** 구현별 명령:

| 구현 | 명령 |
| --- | --- |
| ts | `node packages/ts/bin/template.mjs`; `format`: `node packages/language/bin/template-language.mjs` |
| go | `packages/go/template` |
| rust | `packages/rust/target/release/template` |
| php | `php vendor/bin/template.php` |
| php-ext | `php -d extension=var/build/polyspec_template.so vendor/bin/template-ext.php` |
| python | `var/python/venv/bin/python -m polyspec.template.cli`(`make python-package`가 `packages/python`을 `var/python/venv`에 설치한다) |

TypeScript의 포매터는 `@polyspec/template`에 의존하는 패키지 `@polyspec/template-language`이므로, 그 명령 `template-language`가 `format`을 제공하고 명령 `template`이 나머지 하위 명령을 제공한다.

## 비교

**CNF-6** AST 비교는 두 JSON 문서를 파싱해 재귀적으로 비교한다. 객체 키 순서는 의미가 없다. 숫자는 값으로 비교한다.

**CNF-7** HTML 비교는 stdout의 바이트와 `expected.html`의 바이트를 비교한다.

**CNF-8** 오류 비교는 stderr JSON의 `code`, `template`, `line`, `col`을 `expected.error.json`과 비교한다. `expected.error.json`이 있는 케이스는 종료 상태가 2일 때만 통과한다.

**CNF-17** 토큰 비교는 `tokens`의 stdout을 파싱하고, 종료 상태가 0이며 배열이 `expected.tokens.json`과 원소마다 같기를 요구한다.

**CNF-18** 포맷 비교는 `format`을 기본 옵션으로 한 번, `--indent none`으로 한 번 실행하고, 각각을 `expected.format.json`의 `indent` 또는 `keep` 항목과 비교한다. `text`이면 종료 상태가 0이고 stdout의 바이트가 텍스트와 같아야 한다. `error`이면 종료 상태가 2이고 stderr JSON의 `reason`, `code`, `line`, `col`이 기대 필드와 같아야 한다. `message`는 비교하지 않는다.

**CNF-9** `render` 결과가 CNF-7 또는 CNF-8을 만족하고, `expected.ast.json`이 있는 케이스에서는 `parse` 결과가 그것과 같고 `tokens`와 `format` 결과가 CNF-17과 CNF-18을 만족할 때 케이스가 그 구현에서 통과한다. 하위 명령 하나라도 없는 구현은 그 케이스에서 실패한다.

## 러너

**CNF-10** `tests/runner/conformance.mts`는 케이스를 열거하고, 선택된 모든 구현을 실행하고, 한 구현에서 케이스가 끝날 때마다 `<case> [<lang>] pass|fail (<ms> ms)`을 출력하고, 마지막 케이스 뒤에 케이스와 구현마다 한 행인 요약 표를 출력하고, 비교가 하나라도 실패하면 상태 1로 종료한다.

| 옵션 | 효과 |
| --- | --- |
| `--langs a,b` | 나열된 구현을 실행한다. 기본값: 명령이 존재하는 모든 구현. |
| `--case group/name` | 케이스 하나를 실행한다. |
| `--list` | 실행하지 않고 케이스 id와 건수를 출력한다. |
| `--update ast\|html\|error\|tokens\|format` | 지정한 종류의 기대 파일을 `ts` 구현의 결과로 쓴다. `tokens`와 `format`은 `expected.ast.json`이 있는 케이스의 파일을 쓴다. `ts`가 선택된 구현에 포함되어야 한다. |

**CNF-11** `config/parity.json`은 구현과 공유 suite를 선언한다: `tests/cases`의 적합성 케이스(unit `conformance`, native test가 AST와 렌더 결과를 비교한다), 그 케이스의 토큰(unit `tokens`, CNF-17), 그 포맷 결과(unit `formatting`, CNF-18), `tests/fixtures/expr/cases.json`의 표현식 vector다. kit의 `make parity-check`는 suite를 bind하는 각 구현의 native test를 실행하고, suite의 모든 케이스가 profile의 모든 구현에서 통과하지 않으면 실패한다. exclusion은 그것이 적은 task가 지울 때까지 실패한다. 각 native test는 각 케이스를 그 runner의 이름으로 보고한다: Go는 subtest `TestX/<case>`, cargo는 test `<symbol>::<case>`, vitest는 top-level test `<case>`, PHPUnit은 binding method의 data set `"<case>"`, unittest는 test `<case>`다. PHP extension은 표현식 lexer와 evaluator를 노출하지 않으므로, 표현식 vector의 test는 각 표현식을 echo tag `{=<expr>}`로 parse하고 `{= json(<expr>) | raw}`로 평가하며, token vector는 비교하지 않는다. 구현의 다른 모든 test 파일은 `config/parity.json`의 feature unit, 곧 profile의 각 구현에 native test 하나를 두는 unit의 test다. 모든 구현보다 좁은 profile은 그 차이를 영구적으로 만드는 spec 규칙을 적는다.

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
| `DOUBLE_COLON` | `::` |
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
