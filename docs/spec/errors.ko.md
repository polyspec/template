<!-- doc-id: docs-spec-errors -->
<!-- source-sha256: ddceffe4e9ccf11af73a057d0bb75287075fb53485522a3a55708f89f448324e -->
# 오류

[English](/spec/errors).

## 오류 객체

- **ERR-1** 오류는 `code`, `template`, `line`, `col`, `offset`, `end`, `message` 필드를 가진 객체다. `code`는 이 문서에 나열된 코드 중 하나이며 오류의 kind로, 소문자 snake_case로 쓴다: 모든 polyspec 라이브러리의 kind가 같은 형식이므로 여러 라이브러리의 오류를 다루는 host는 한 kind 형식으로 오류를 구별한다. TypeScript, Go, PHP, PHP extension, Python의 legacy 구현은 없어질 때까지 코드를 `E_`와 대문자 kind로 적는다(`data_depth`는 `E_DATA_DEPTH`). `template`은 오류가 위치한 템플릿의 이름이다. `message`는 영어 자유 텍스트다.

SDK는 네이티브 오류 값과 일반 데이터 변환을 통해 이 일곱 필드를 제공한다. TypeScript는 `ErrorObject`와 `TemplateError.toObject`, Go는 `errs.Error`의 공개 필드와 `JSON`, Rust는 `TemplateError` 필드와 직렬화 구현을 사용한다. PHP와 PHP 확장은 `TemplateError.toArray`를 사용하며 속성 이름은 `errorCode`, `errorLine`, `errorCol`이고 메시지는 네이티브 예외에서 읽는다. Python은 `TemplateError` 속성과 `to_object`를 사용한다. 네이티브 생성자나 구조체 리터럴은 같은 값을 만든다. 위치 factory는 바이트 span과 줄 인덱스를 받고, 위치 없는 factory 또는 위치에 0을 넣는 TypeScript 생성자는 위치 필드 네 개에 모두 0을 유지한다.

- **ERR-2** `line`은 1부터 시작하며 오류 위치 앞의 `\n` 바이트 수를 센다. `col`은 그 줄의 시작부터 오류 위치까지의 1부터 시작하는 바이트 오프셋이다. `offset`과 `end`는 오류가 가리키는 토큰 또는 노드의 바이트 범위 `[offset, end)`다. `offset`이 오류 위치다.

- **ERR-3** 적합성 검사는 `code`, `template`, `line`, `col`을 비교한다. `offset`, `end`, `message`는 비교하지 않는다.

- **ERR-4** 실행 모드는 없다. 모든 오류는 파싱 또는 렌더링을 중단한다. 오류가 발생한 렌더는 출력을 생성하지 않는다.

- **ERR-5** 렌더링 시작 전 assign 데이터, template define 데이터 또는 환경을 바인딩하는 동안 발생한 오류는 `template`이 진입 템플릿 이름이고 `line` 0, `col` 0, `offset` 0, `end` 0이다. 렌더링 중 값을 바인딩하는 동안 발생한 오류는 그 값을 만든 표현식을 가리킨다. 호스트 함수, 논리 class 함수, instance method의 결과이면 호출을, native object의 member이면 lookup 표현식을 가리킨다(VAL-19).

- **ERR-14** render 밖에서 실행되는 `bind`와 `merge`(VAL-22)가 내는 오류는 `template`이 빈 문자열이고 `line`, `col`, `offset`, `end`가 0이다. code는 실패한 검사의 data_* code이거나 internal(ERR-13)이며, 바인딩이 호출한 호스트 코드의 오류는 바뀌지 않고 호출자에게 도달한다(VAL-13, FUN-46). 오류는 구현의 ERR-1 오류 객체이고, `render`가 내는 것과 같은 type이다. ERR-13이 호스트에 그대로 전달하는 예외는 `bind`에서도 그대로 나간다.

- **ERR-6** 로더가 제공하지 않는 진입 템플릿의 오류는 `code`가 `load_not_found`이고 `template`이 요청한 이름이며 `line` 0, `col` 0이다. 로딩에 실패한 진입 템플릿의 오류(`load_failed`)도 `template`, `line`, `col`이 같다.

## 코드

ERR-7에서 ERR-12와 ERR-15의 code table이 error code의 catalog입니다. `make error-codes`가 이 table에서 각 implementation의 code 목록을 쓰고, `make error-codes-check`가 각 목록이 table과 같은지 검사합니다.

- **ERR-7** 렉시컬 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `lex_invalid_utf8` | 소스가 유효한 UTF-8이 아니다. | 첫 번째 잘못된 바이트. |

- **ERR-8** 파싱 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `parse_unterminated_tag` | 태그에 파일 끝 전까지 닫는 `}`가 없다. | 태그의 `{`. |
| `parse_unterminated_comment` | 주석에 파일 끝 전까지 `*}`가 없다. | 주석의 `{*`. |
| `parse_unterminated_string` | 문자열 리터럴에 태그 끝 전까지 닫는 따옴표가 없다. | 여는 따옴표. |
| `parse_unexpected_token` | 토큰이 그 위치에서 문법상 허용되지 않는다. 빈 표현식을 포함한다. | 그 토큰, 또는 표현식이 비어 있으면 `}`. |
| `parse_invalid_number` | 숫자 리터럴이 숫자 토큰과 일치하지 않는다. | 리터럴. |
| `parse_invalid_escape` | 문자열 리터럴의 백슬래시 뒤에 이스케이프 집합 밖의 문자가 온다. | 백슬래시. |
| `parse_unexpected_close` | 열린 블록이 없는데 `{/}`가 나타난다. | 태그. |
| `parse_unclosed_block` | 블록이 열린 채 파일이 끝난다. | 가장 안쪽 열린 블록의 여는 태그. |
| `parse_else_outside_block` | 열린 블록이 없는데 `{:}` 또는 `{:? ...}`가 나타난다. | 태그. |
| `parse_duplicate_else` | 같은 블록에 두 번째 `{:}`가 나타난다. | 두 번째 `{:}`. |
| `parse_elseif_after_else` | 같은 블록에서 `{:}` 뒤에 `{:? ...}`가 나타난다. | 태그. |
| `parse_elseif_not_in_if` | 루프 블록 또는 if-block 바로 안에 `{:? ...}`가 나타난다. | 태그. |
| `parse_reserved_name` | 대입 대상 또는 루프 변수가 예약어다. | 이름. |
| `parse_invalid_path` | include 또는 block 경로가 경로 토큰이 아니다. | 경로. |
| `parse_invalid_block_tag` | block 태그의 토큰이 block 태그 문법과 일치하지 않는다. | 일치하지 않는 첫 토큰. |
| `parse_invalid_wrapper` | 래퍼 태그의 `}}` 뒤에 래퍼 열기에 대응하는 래퍼 닫기가 오지 않는다. | 래퍼 열기. |
| `parse_invalid_directive` | 구분자 지시문이 파일의 첫 태그가 아니거나, 구분자가 아닌 문자를 지정하거나, 다른 형태다. | 태그. |

- **ERR-9** 로드 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `load_not_found` | 로더에 해석된 이름의 템플릿이 없다. | include 또는 block 태그; 진입 템플릿은 ERR-6. |
| `load_cycle` | include 또는 block이 같은 체인에서 이미 렌더링 중인 템플릿을 렌더한다. | include 또는 block 태그. |
| `load_outside_root` | 해석된 경로가 로더 루트를 벗어난다. | include 또는 block 태그. |
| `load_failed` | 로더가 해석된 이름에 대해 실패를 보고한다(RT-9). TypeScript나 PHP 로더가 예외를 던지거나, Go나 Rust 로더가 오류를 반환하거나, 파일시스템 로더가 존재하는 일반 파일을 읽지 못한 경우이거나, 로더 결과에 소스 텍스트와 AST가 모두 없거나 버전이 없는 경우다(RT-9). | include 또는 block 태그; 진입 템플릿은 ERR-6. |

- **ERR-10** 데이터 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `data_number_range` | 유한한 숫자의 크기가 2^53 − 1보다 크다(VAL-2). | ERR-5, ERR-14. |
| `data_number_not_finite` | 숫자가 NaN이거나 무한이다. | ERR-5, ERR-14. |
| `data_invalid_utf8` | 문자열 또는 map 키가 유효한 유니코드 텍스트가 아니다(VAL-12~VAL-17). | ERR-5, ERR-14. |
| `data_unsupported_type` | 값의 타입에 바인딩이 없다. | ERR-5, ERR-14. |
| `data_depth` | list와 map이 바인딩 깊이 제한보다 깊게 중첩된다. 순환하는 호스트 구조를 포함한다(VAL-20). | ERR-5, ERR-14. |
| `data_invalid_json` | assign 데이터, 템플릿 정의 또는 환경의 JSON 텍스트가 하나의 JSON 문서가 아니다(VAL-12). | ERR-5. |

- **ERR-11** 런타임 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `runtime_type` | 피연산자 또는 인자의 타입을 연산이 받지 않는다. | 실패한 표현식 노드의 시작(이항 또는 단항 표현식, 호출, spread), 또는 잘못된 타입의 반복 대상에 대한 루프 태그. |
| `runtime_compare` | 순서 비교의 피연산자에 순서가 없다. | 비교 표현식의 시작. |
| `runtime_div_zero` | `/` 또는 `%`의 오른쪽 피연산자가 0이다. | 나눗셈 표현식의 시작. |
| `runtime_stringify` | list, map 또는 native object(VAL-19)를 문자열로 변환한다. | echo 표현식, 연산자 표현식 또는 호출의 시작. |
| `runtime_unknown_function` | 호출이 내장도 등록도 되지 않은 함수를 이름으로 지정한다. | 호출. |
| `runtime_arity` | 호출의 인자 수가 함수의 범위 밖이다. | 호출. |
| `runtime_host_function` | legacy 구현이 엔진이 호출한 호스트 코드의 오류를 보고한다(FUN-46, VAL-19). Rust 코어는 그런 오류를 바뀌지 않고 호출자에게 전하며 이 코드를 내지 않는다. | 호출 또는 lookup 표현식. 렌더링 시작 전 바인딩 중에 실행된 호스트 코드는 ERR-5. `bind`에서 실행된 호스트 코드는 ERR-14. |
| `runtime_unknown_loop` | 루프 메타가 표현식을 감싸지 않는 루프를 이름으로 지정한다. | 루프 메타. |
| `runtime_block_undefined` | `{# id}`가 템플릿 define 레지스트리에 없는 id를 지정한다. | 태그. |
| `runtime_block_redefined` | `{# id path}`가 다른 경로로 등록된 id를 지정한다. | 태그. |
| `runtime_depth` | include와 block의 중첩 깊이가 제한을 넘는다. | include 또는 block 태그. |
| `runtime_limit` | 반복 횟수, 출력 크기, 표현식 깊이, range 크기 또는 list·map literal이 만드는 값의 깊이(VAL-20)가 제한을 넘는다. | 루프 태그, echo, 표현식, 호출 또는 literal. |

- **ERR-15** 인자·format·AST 오류. 행이 위치를 정하지 않으면 각각 위치 없는 ERR-1의 오류이며 `template`은 연산이 받은 이름이다. 이유: 라이브러리의 모든 실패는 kind를 가진 한 오류 타입으로 host에 도달하므로(ERR-1) host는 인자 오류, 유지된 format, 잘못된 AST를 연산마다의 두 번째 오류 타입이 아니라 kind로 구별한다.

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `argument_delimiters` | `parse`, `analyze`, `format`이나 engine의 구분자 옵션이 구분자 쌍이 아니다(LEX-21). | 없음. |
| `argument_function_name` | `register`나 engine 옵션의 host 함수 이름이 식별자가 아니거나 내장 함수 이름이다(RT-5, FUN-44). | 없음. |
| `argument_source_range` | 구현의 공개 `Source`의 바이트 범위가 뒤집혔거나 소스 밖에 닿는다. | 없음. |
| `argument_indent` | `format`의 들여쓰기 단위가 공백의 연속이나 탭 하나가 아니다(FMT-9). | 없음. |
| `format_invariant` | `format`이 돌려줄 텍스트가 소스의 AST로 파싱되지 않는다(FMT-1). | 처음 바뀐 바이트. |
| `format_html` | 소스의 HTML 요소가 짝이 맞지 않아 `format`이 그에 따라 줄을 들여쓸 수 없다(FMT-12). | 짝이 맞지 않는 태그. |
| `ast_invalid` | `decode_template`이 읽는 텍스트가 JSON이 아니거나 그 값이 canonical schema의 AST가 아니다. 메시지가 첫 잘못된 노드의 JSON Pointer를 적는다(AST-10). | 없음. |

- **ERR-12** 내부 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `internal` | 이 명세가 정의하지 않은 방식으로 구현이 실패했다. 엔진이 실행하는 Rust 또는 Go 코드의 panic, 또는 TypeScript와 PHP에서 언어 런타임이 프로그래밍 결함에 대해 발생시킨 오류다. | ERR-5. `bind`와 `merge`에서는 ERR-14. `parse`에서는 `parse`에 전달한 템플릿 이름. |

- **ERR-13** 어떤 구현도 호스트 프로세스를 종료시키지 않으며, panic이나 언어 런타임 오류가 구현의 공개 `parse`, `prepare`, `render`, `bind`, `merge` operation 밖으로 나가지 않는다. Generated program과 PHP 확장의 operation도 같다. 이런 실패는 모두 호스트에 `internal`로 보고한다. 언어 런타임 오류는 JavaScript 엔진이 발생시키는 `Error`의 내장 하위 클래스(`TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `EvalError`, `URIError`)와 PHP `Error` 계층의 클래스다. 엔진이 호출하는 호스트 코드(등록된 함수, 논리 class 함수, instance method, member accessor, `jsonSerialize()`)가 자기 언어의 오류 방식, 즉 TypeScript와 PHP에서는 던진 예외, Go와 Rust에서는 반환한 오류로 실패를 보고하면 바뀌지 않고 호출자에게 도달하며(FUN-46), 호스트 로더의 오류도 같다(RT-9). Go나 Rust의 그런 호스트 코드가 일으킨 panic은 내부 오류다. 그 밖의 예외는 바뀌지 않고 호스트에 전달된다. 예를 들어 파싱이나 렌더링을 시작하기 전에 API가 발생시키는 인자 오류, 즉 잘못된 delimiter 옵션이나 generated program의 선언 타입과 맞지 않는 요청이다. `assign`이나 정의 `data`가 generated program의 선언 타입과 맞지 않거나 program이 선언하지 않은 정의를 담은 요청은 ERR-1 오류가 아니라 그 언어의 인자 오류로 실패한다. TypeScript에서는 `TemplateError`도 언어 런타임 오류도 아닌 `Error`, Go에서는 `*errs.Error`가 아닌 `error`, Rust에서는 Rust `Program`의 하나뿐인 오류 타입인 `argument_*` kind의 `TemplateError`(ERR-15), PHP에서는 `\InvalidArgumentException`이고, Python에서는 `ValueError`다. 이는 generated program의 `prepare`가 언어 런타임 오류를 `internal`로 보고하는 `render`의 경계 앞에서 발생시킨다. 인자 오류의 message는 모든 target에서 같은 문장이다. 값은 요청 안의 경로로 부른다: `assign.<field>`, 또는 정의 data는 `define.<id>.data.<field>`이고, 뒤에 record의 field는 `.<field>`, map의 항목은 `.<key>`, list의 item은 `[<index>]`가 붙는다. 값이 없거나 null이고 그 type이 optional이 아니면 `<path> is required`, 그 밖에는 `<path> is not <expected>`로 보고하며, `<expected>`는 `a string`, `a number`, `a boolean`, `a list`, `an object` 중 하나다. object가 아닌 `define` 옵션은 그런 값을 요청에 담을 수 있는 모든 target에서 `define is not an object`로, 정의 항목은 `define.<id> is not declared`, `define.<id> has an invalid template`, `define.<id> has an invalid html entry`, `define.<id>.data is not an object`로 보고한다. 구분자 쌍이 아닌 구분자 옵션도 같은 인자 오류다. Go에서 `Parse`와 `NewAstProgram`은 `*errs.Error`가 아닌 `error`를 돌려준다. Rust에서 `AstProgram::new`와 `parse`는 kind `argument_delimiters`의 `TemplateError`를 돌려주고, PHP extension은 PHP package처럼 `\InvalidArgumentException`을 던진다. 잘못된 UTF-8처럼 binding한 값 자체의 데이터 오류는 `data_*` 오류로 남는다.

## 예제

```json
{
  "code": "parse_unclosed_block",
  "template": "product/list.tpl",
  "line": 12,
  "col": 1,
  "offset": 318,
  "end": 341,
  "message": "block opened by {@ product = products} is not closed"
}
```
