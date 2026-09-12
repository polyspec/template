# 오류

[English](errors.md).

## 오류 객체

**ERR-1** 오류는 `code`, `template`, `line`, `col`, `offset`, `end`, `message` 필드를 가진 객체다. `code`는 이 문서에 나열된 코드 중 하나다. `template`은 오류가 위치한 템플릿의 이름이다. `message`는 영어 자유 텍스트다.

**ERR-2** `line`은 1부터 시작하며 오류 위치 앞의 `\n` 바이트 수를 센다. `col`은 그 줄의 시작부터 오류 위치까지의 1부터 시작하는 바이트 오프셋이다. `offset`과 `end`는 오류가 가리키는 토큰 또는 노드의 바이트 범위 `[offset, end)`다. `offset`이 오류 위치다.

**ERR-3** 적합성 검사는 `code`, `template`, `line`, `col`을 비교한다. `offset`, `end`, `message`는 비교하지 않는다.

**ERR-4** 실행 모드는 없다. 모든 오류는 파싱 또는 렌더링을 중단한다. 오류가 발생한 렌더는 출력을 생성하지 않는다.

**ERR-5** 렌더링 시작 전 assign 데이터를 바인딩하는 동안 발생한 오류는 `template`이 진입 템플릿 이름이고 `line` 0, `col` 0, `offset` 0, `end` 0이다. 호스트 함수의 결과를 바인딩하는 동안 발생한 오류는 호출을 가리킨다.

**ERR-6** 로더가 제공하지 않는 진입 템플릿의 오류는 `code`가 `E_LOAD_NOT_FOUND`이고 `template`이 요청한 이름이며 `line` 0, `col` 0이다.

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

**ERR-10** 데이터 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_DATA_NUMBER_RANGE` | 정수가 안전 정수 범위 밖이다. | ERR-5. |
| `E_DATA_NUMBER_NOT_FINITE` | 숫자가 NaN이거나 무한이다. | ERR-5. |
| `E_DATA_INVALID_UTF8` | 문자열이 유효한 UTF-8이 아니다. | ERR-5. |
| `E_DATA_UNSUPPORTED_TYPE` | 값의 타입에 바인딩이 없다. | ERR-5. |

**ERR-11** 런타임 오류:

| 코드 | 조건 | 위치 |
| --- | --- | --- |
| `E_RUNTIME_TYPE` | 피연산자 또는 인자의 타입을 연산이 받지 않는다. | 실패한 표현식 노드의 시작(이항 또는 단항 표현식, 호출, spread), 또는 잘못된 타입의 반복 대상에 대한 루프 태그. |
| `E_RUNTIME_COMPARE` | 순서 비교의 피연산자에 순서가 없다. | 비교 표현식의 시작. |
| `E_RUNTIME_DIV_ZERO` | `/` 또는 `%`의 오른쪽 피연산자가 0이다. | 나눗셈 표현식의 시작. |
| `E_RUNTIME_STRINGIFY` | list 또는 map을 문자열로 변환한다. | echo 표현식, 연산자 표현식 또는 호출의 시작. |
| `E_RUNTIME_UNKNOWN_FUNCTION` | 호출이 내장도 등록도 되지 않은 함수를 이름으로 지정한다. | 호출. |
| `E_RUNTIME_ARITY` | 호출의 인자 수가 함수의 범위 밖이다. | 호출. |
| `E_RUNTIME_HOST_FUNCTION` | 등록된 함수가 오류를 발생시켰다. | 호출. |
| `E_RUNTIME_UNKNOWN_LOOP` | 루프 메타가 표현식을 감싸지 않는 루프를 이름으로 지정한다. | 루프 메타. |
| `E_RUNTIME_BLOCK_UNDEFINED` | `{# id}`가 템플릿 define 레지스트리에 없는 id를 지정한다. | 태그. |
| `E_RUNTIME_BLOCK_REDEFINED` | `{# id path}`가 다른 경로로 등록된 id를 지정한다. | 태그. |
| `E_RUNTIME_DEPTH` | include와 block의 중첩 깊이가 제한을 넘는다. | include 또는 block 태그. |
| `E_RUNTIME_LIMIT` | 반복 횟수, 출력 크기, 표현식 깊이 또는 range 크기가 제한을 넘는다. | 루프 태그, echo, 표현식 또는 호출. |

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
