# 오류

[English](/spec/errors).

## 오류 객체

**ERR-1** 오류는 `code`, `template`, `line`, `col`, `offset`, `end`, `message` 필드를 가진 객체다. `code`는 이 문서에 나열된 코드 중 하나다. `template`은 오류가 위치한 템플릿의 이름이다. `message`는 영어 자유 텍스트다.

**ERR-2** `line`은 1부터 시작하며 오류 위치 앞의 `\n` 바이트 수를 센다. `col`은 그 줄의 시작부터 오류 위치까지의 1부터 시작하는 바이트 오프셋이다. `offset`과 `end`는 오류가 가리키는 토큰 또는 노드의 바이트 범위 `[offset, end)`다. `offset`이 오류 위치다.

**ERR-3** 적합성 검사는 `code`, `template`, `line`, `col`을 비교한다. `offset`, `end`, `message`는 비교하지 않는다.

**ERR-4** 실행 모드는 없다. 모든 오류는 파싱 또는 렌더링을 중단한다. 오류가 발생한 렌더는 출력을 생성하지 않는다.

**ERR-5** 렌더링 시작 전 assign 데이터, template define 데이터 또는 환경을 바인딩하는 동안 발생한 오류는 `template`이 진입 템플릿 이름이고 `line` 0, `col` 0, `offset` 0, `end` 0이다. 렌더링 중 값을 바인딩하는 동안 발생한 오류는 그 값을 만든 표현식을 가리킨다. 호스트 함수, 논리 class 함수, instance method의 결과이면 호출을, native object의 member이면 lookup 표현식을 가리킨다(VAL-19).

**ERR-14** render 밖에서 실행되는 `bind`와 `merge`(VAL-22)가 내는 오류는 `template`이 빈 문자열이고 `line`, `col`, `offset`, `end`가 0이다. code는 실패한 검사의 E_DATA_* code이거나, 바인딩이 호출한 호스트 코드가 오류를 보고하면 E_RUNTIME_HOST_FUNCTION(VAL-14)이거나, E_INTERNAL(ERR-13)이다. 오류는 구현의 ERR-1 오류 객체이고, `render`가 내는 것과 같은 type이다. ERR-13이 호스트에 그대로 전달하는 예외는 `bind`에서도 그대로 나간다.

**ERR-6** 로더가 제공하지 않는 진입 템플릿의 오류는 `code`가 `E_LOAD_NOT_FOUND`이고 `template`이 요청한 이름이며 `line` 0, `col` 0이다. 로딩에 실패한 진입 템플릿의 오류(`E_LOAD_FAILED`)도 `template`, `line`, `col`이 같다.

## 코드

**ERR-7** 렉시컬 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_LEX_INVALID_UTF8` | 소스가 유효한 UTF-8이 아니다. | 첫 번째 잘못된 바이트. |

**ERR-8** 파싱 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_PARSE_UNTERMINATED_TAG` | 태그에 파일 끝 전까지 닫는 `}`가 없다. | 태그의 `{`. |
| `E_PARSE_UNTERMINATED_COMMENT` | 주석에 파일 끝 전까지 `*}`가 없다. | 주석의 `{*`. |
| `E_PARSE_UNTERMINATED_STRING` | 문자열 리터럴에 태그 끝 전까지 닫는 따옴표가 없다. | 여는 따옴표. |
| `E_PARSE_UNEXPECTED_TOKEN` | 토큰이 그 위치에서 문법상 허용되지 않는다. 빈 표현식을 포함한다. | 그 토큰, 또는 표현식이 비어 있으면 `}`. |
| `E_PARSE_INVALID_NUMBER` | 숫자 리터럴이 숫자 토큰과 일치하지 않는다. | 리터럴. |
| `E_PARSE_INVALID_ESCAPE` | 문자열 리터럴의 백슬래시 뒤에 이스케이프 집합 밖의 문자가 온다. | 백슬래시. |
| `E_PARSE_UNEXPECTED_CLOSE` | 열린 블록이 없는데 `{/}`가 나타난다. | 태그. |
| `E_PARSE_UNCLOSED_BLOCK` | 블록이 열린 채 파일이 끝난다. | 가장 안쪽 열린 블록의 여는 태그. |
| `E_PARSE_ELSE_OUTSIDE_BLOCK` | 열린 블록이 없는데 `{:}` 또는 `{:? ...}`가 나타난다. | 태그. |
| `E_PARSE_DUPLICATE_ELSE` | 같은 블록에 두 번째 `{:}`가 나타난다. | 두 번째 `{:}`. |
| `E_PARSE_ELSEIF_AFTER_ELSE` | 같은 블록에서 `{:}` 뒤에 `{:? ...}`가 나타난다. | 태그. |
| `E_PARSE_ELSEIF_NOT_IN_IF` | 루프 블록 또는 if-block 바로 안에 `{:? ...}`가 나타난다. | 태그. |
| `E_PARSE_RESERVED_NAME` | 대입 대상 또는 루프 변수가 예약어다. | 이름. |
| `E_PARSE_INVALID_PATH` | include 또는 block 경로가 경로 토큰이 아니다. | 경로. |
| `E_PARSE_INVALID_BLOCK_TAG` | block 태그의 토큰이 block 태그 문법과 일치하지 않는다. | 일치하지 않는 첫 토큰. |
| `E_PARSE_INVALID_WRAPPER` | 래퍼 태그의 `}}` 뒤에 래퍼 열기에 대응하는 래퍼 닫기가 오지 않는다. | 래퍼 열기. |
| `E_PARSE_INVALID_DIRECTIVE` | 구분자 지시문이 파일의 첫 태그가 아니거나, 구분자가 아닌 문자를 지정하거나, 다른 형태다. | 태그. |

**ERR-9** 로드 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_LOAD_NOT_FOUND` | 로더에 해석된 이름의 템플릿이 없다. | include 또는 block 태그; 진입 템플릿은 ERR-6. |
| `E_LOAD_CYCLE` | include 또는 block이 같은 체인에서 이미 렌더링 중인 템플릿을 렌더한다. | include 또는 block 태그. |
| `E_LOAD_OUTSIDE_ROOT` | 해석된 경로가 로더 루트를 벗어난다. | include 또는 block 태그. |
| `E_LOAD_FAILED` | 로더가 해석된 이름에 대해 실패를 보고한다(RT-9). TypeScript나 PHP 로더가 예외를 던지거나, Go나 Rust 로더가 오류를 반환하거나, 파일시스템 로더가 존재하는 일반 파일을 읽지 못한 경우다(RT-10). | include 또는 block 태그; 진입 템플릿은 ERR-6. |

**ERR-10** 데이터 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_DATA_NUMBER_RANGE` | 유한한 숫자의 크기가 2^53 − 1보다 크다(VAL-2). | ERR-5, ERR-14. |
| `E_DATA_NUMBER_NOT_FINITE` | 숫자가 NaN이거나 무한이다. | ERR-5, ERR-14. |
| `E_DATA_INVALID_UTF8` | 문자열 또는 map 키가 유효한 유니코드 텍스트가 아니다(VAL-12~VAL-17). | ERR-5, ERR-14. |
| `E_DATA_UNSUPPORTED_TYPE` | 값의 타입에 바인딩이 없다. | ERR-5, ERR-14. |
| `E_DATA_DEPTH` | list와 map이 바인딩 깊이 제한보다 깊게 중첩된다. 순환하는 호스트 구조를 포함한다(VAL-20). | ERR-5, ERR-14. |
| `E_DATA_INVALID_JSON` | assign 데이터, 템플릿 정의 또는 환경의 JSON 텍스트가 하나의 JSON 문서가 아니다(VAL-12). | ERR-5. |

**ERR-11** 런타임 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_RUNTIME_TYPE` | 피연산자 또는 인자의 타입을 연산이 받지 않는다. | 실패한 표현식 노드의 시작(이항 또는 단항 표현식, 호출, spread), 또는 잘못된 타입의 반복 대상에 대한 루프 태그. |
| `E_RUNTIME_COMPARE` | 순서 비교의 피연산자에 순서가 없다. | 비교 표현식의 시작. |
| `E_RUNTIME_DIV_ZERO` | `/` 또는 `%`의 오른쪽 피연산자가 0이다. | 나눗셈 표현식의 시작. |
| `E_RUNTIME_STRINGIFY` | list 또는 map을 문자열로 변환한다. | echo 표현식, 연산자 표현식 또는 호출의 시작. |
| `E_RUNTIME_UNKNOWN_FUNCTION` | 호출이 내장도 등록도 되지 않은 함수를 이름으로 지정한다. | 호출. |
| `E_RUNTIME_ARITY` | 호출의 인자 수가 함수의 범위 밖이다. | 호출. |
| `E_RUNTIME_HOST_FUNCTION` | 엔진이 호출한 호스트 코드가 오류를 보고했다(FUN-46, VAL-14, VAL-19). 등록된 함수, 논리 class 함수, instance method, member accessor 또는 `jsonSerialize()`다. | 호출 또는 lookup 표현식. 렌더링 시작 전 바인딩 중에 실행된 호스트 코드는 ERR-5. `bind`에서 실행된 호스트 코드는 ERR-14. |
| `E_RUNTIME_UNKNOWN_LOOP` | 루프 메타가 표현식을 감싸지 않는 루프를 이름으로 지정한다. | 루프 메타. |
| `E_RUNTIME_BLOCK_UNDEFINED` | `{# id}`가 템플릿 define 레지스트리에 없는 id를 지정한다. | 태그. |
| `E_RUNTIME_BLOCK_REDEFINED` | `{# id path}`가 다른 경로로 등록된 id를 지정한다. | 태그. |
| `E_RUNTIME_DEPTH` | include와 block의 중첩 깊이가 제한을 넘는다. | include 또는 block 태그. |
| `E_RUNTIME_LIMIT` | 반복 횟수, 출력 크기, 표현식 깊이, range 크기 또는 list·map literal이 만드는 값의 깊이(VAL-20)가 제한을 넘는다. | 루프 태그, echo, 표현식, 호출 또는 literal. |

**ERR-12** 내부 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_INTERNAL` | 이 명세가 정의하지 않은 방식으로 구현이 실패했다. 엔진이 실행하는 Rust 또는 Go 코드의 panic, 또는 TypeScript와 PHP에서 언어 런타임이 프로그래밍 결함에 대해 발생시킨 오류다. | ERR-5. `bind`와 `merge`에서는 ERR-14. `parse`에서는 `parse`에 전달한 템플릿 이름. |

**ERR-13** 어떤 구현도 호스트 프로세스를 종료시키지 않으며, panic이나 언어 런타임 오류가 구현의 공개 `parse`, `prepare`, `render`, `bind`, `merge` operation 밖으로 나가지 않는다. Generated program과 PHP 확장의 operation도 같다. 이런 실패는 모두 호스트에 `E_INTERNAL`로 보고한다. 언어 런타임 오류는 JavaScript 엔진이 발생시키는 `Error`의 내장 하위 클래스(`TypeError`, `RangeError`, `ReferenceError`, `SyntaxError`, `EvalError`, `URIError`)와 PHP `Error` 계층의 클래스다. 엔진이 호출하는 호스트 코드(등록된 함수, 논리 class 함수, instance method, member accessor, `jsonSerialize()`)가 자기 언어의 오류 방식, 즉 TypeScript와 PHP에서는 던진 예외, Go와 Rust에서는 반환한 오류로 실패를 보고하면 이 경계에 도달하기 전에 `E_RUNTIME_HOST_FUNCTION`이 된다. 같은 방식으로 실패를 보고하는 로더는 `E_LOAD_FAILED`로 실패한다(RT-9). Go나 Rust의 그런 호스트 코드가 일으킨 panic은 내부 오류다. 그 밖의 예외는 바뀌지 않고 호스트에 전달된다. 예를 들어 파싱이나 렌더링을 시작하기 전에 API가 발생시키는 인자 오류, 즉 잘못된 delimiter 옵션이나 generated program의 선언 타입과 맞지 않는 요청이다. `assign`이나 정의 `data`가 generated program의 선언 타입과 맞지 않거나 program이 선언하지 않은 정의를 담은 요청은 ERR-1 오류가 아니라 그 언어의 인자 오류로 실패한다. TypeScript에서는 `TemplateError`도 언어 런타임 오류도 아닌 `Error`, Go에서는 `*errs.Error`가 아닌 `error`, Rust에서는 Rust `Program`의 `prepare`와 `render`가 ERR-1 오류인 `RequestError::Template`와 함께 돌려주는 `RequestError::Argument`, PHP에서는 `\InvalidArgumentException`이다. 구분자 쌍이 아닌 구분자 옵션도 같은 인자 오류다. Rust에서 `AstProgram::new`는 `ArgumentError`를, `parse`는 `RequestError::Argument`를 돌려주고, PHP extension은 PHP package처럼 `\InvalidArgumentException`을 던진다. 잘못된 UTF-8처럼 binding한 값 자체의 데이터 오류는 `E_DATA_*` 오류로 남는다.

## 예제

```json
{
  "code": "E_PARSE_UNCLOSED_BLOCK",
  "template": "product/list.tpl",
  "line": 12,
  "col": 1,
  "offset": 318,
  "end": 341,
  "message": "block opened by {@ product = products} is not closed"
}
```
