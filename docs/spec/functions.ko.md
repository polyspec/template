# 함수

[English](functions.md).

이 문서는 내장 함수, 파이프 형식, safe 문자열 규칙, 호스트 함수 등록 계약을 정의한다. 값 변환 규칙(문자열화, 진릿값, to_number, 동등)은 [data-model.ko.md](data-model.ko.md)에 정의되어 있다. 표현식 문법은 [expressions.ko.md](expressions.ko.md)에 정의되어 있다. 오류 코드는 [errors.ko.md](errors.ko.md)에 정의되어 있다.

## 호출과 파이프

- **FUN-1** 함수 호출은 `name(arg, ...)`이다. 파이프 형식 `a | name(b, ...)`은 `name(a, b, ...)`과 같다. 괄호 없는 파이프 `a | name`은 `name(a)`과 같다.
- **FUN-2** 함수 이름은 변수 이름과 별개의 이름 공간이다. `length`라는 변수와 함수 `length`는 충돌하지 않는다.
- **FUN-3** 인자 수는 평가 시점에 검사한다. 필수 인자 수보다 적거나 허용 인자 수보다 많은 호출은 `E_RUNTIME_ARITY`로 실패한다.
- **FUN-4** 내장 함수도 등록된 호스트 함수도 아닌 이름의 호출은 `E_RUNTIME_UNKNOWN_FUNCTION`으로 실패한다.
- **FUN-5** 문자열의 위치와 길이는 유니코드 코드포인트로 센다.
- **FUN-6** 함수가 받지 않는 타입의 인자는 함수 정의가 다른 결과를 명시하지 않는 한 `E_RUNTIME_TYPE`으로 실패한다.

## safe 문자열

- **FUN-7** safe 문자열은 echo 태그가 HTML 이스케이프 없이 쓰는 문자열 값이다. `raw`와 `escape`만 safe 문자열을 반환한다.
- **FUN-8** safe 문자열을 받는 그 외 모든 함수는 그 텍스트를 사용하고 일반 문자열을 반환한다.
- **FUN-9** safe 문자열은 비교, 결합, 문자열화에서 그 텍스트로 동작한다.

## 내장 함수

### 출력

| 함수 | 인자 | 결과 |
| --- | --- | --- |
| `escape(v)` | 임의 | `v`를 문자열화하고 `&` `<` `>` `"` `'`를 `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`로 치환한 safe 문자열 |
| `raw(v)` | 임의 | `v`를 문자열화한 safe 문자열 |
| `json(v)` | 임의 | `v`의 JSON 텍스트. 아래 `json` 참고 |
| `url(s)` | string | 퍼센트 인코딩된 텍스트; 아래 `url` 참고 |
| `nl2br(s)` | string | 모든 `\n` 앞에 `<br>`을 삽입; `\r\n`은 `<br>\n`이 됨; 일반 문자열 반환 |

- **FUN-10** `escape`는 나열된 다섯 가지 치환만 적용한다.
- **FUN-11** `nl2br`는 일반 문자열을 반환한다. 이스케이프 없이 출력하려면 `escape`를 먼저, `raw`를 마지막에 적용한다: `{= text | escape | nl2br | raw}`.

### 문자열

| 함수 | 인자 | 결과 |
| --- | --- | --- |
| `upper(s)` | string | ASCII 문자 `a`–`z`를 `A`–`Z`로 치환; 다른 문자는 그대로 |
| `lower(s)` | string | ASCII 문자 `A`–`Z`를 `a`–`z`로 치환; 다른 문자는 그대로 |
| `trim(s, chars=" \t\r\n")` | string, string | `chars`에 포함된 문자를 양끝에서 제거한 `s` |
| `replace(s, from, to)` | string, string, string | `from`의 모든 리터럴 발생을 `to`로 치환; `from`이 빈 문자열이면 `s` 그대로 |
| `split(s, sep)` | string, string | `sep`으로 나눈 부분 문자열의 list; 빈 `sep`은 `E_RUNTIME_TYPE`으로 실패 |
| `truncate(s, n, suffix="...")` | string, number, string | `s`의 길이가 `n`을 넘으면 앞 `n`개 코드포인트 뒤에 `suffix`를 붙인 값; 아니면 `s` |
| `contains(h, n)` | string 또는 list, 임의 | `n`이 `h`의 부분 문자열이거나 list 원소가 `==`로 `n`과 같으면 `true` |
| `starts_with(s, p)` | string, string | `s`가 `p`로 시작하면 `true` |
| `ends_with(s, p)` | string, string | `s`가 `p`로 끝나면 `true` |

- **FUN-12** `upper`와 `lower`는 ASCII 문자만 바꾼다.
- **FUN-13** `sep`이 나타나지 않는 `split`은 `s` 하나를 담은 list를 반환한다. `split("", ",")`은 `[""]`를 반환한다.

### 컬렉션

| 함수 | 인자 | 결과 |
| --- | --- | --- |
| `length(v)` | 임의 | string의 코드포인트 수, list의 원소 수, map의 항목 수, null은 `0`; 다른 타입은 `E_RUNTIME_TYPE`으로 실패 |
| `keys(m)` | map 또는 list | map 키의 삽입 순서 list; list는 인덱스를 number로 |
| `values(m)` | map 또는 list | map 값의 삽입 순서 list; list는 그대로 |
| `first(v)` | list 또는 string | 첫 원소 또는 첫 코드포인트; 비어 있으면 `null` |
| `last(v)` | list 또는 string | 마지막 원소 또는 마지막 코드포인트; 비어 있으면 `null` |
| `reverse(v)` | list 또는 string | 원소 또는 코드포인트를 역순으로 |
| `slice(v, start, length?)` | list 또는 string, number, number | 부분 list 또는 부분 문자열; 아래 `slice` 참고 |
| `sort(list, key?)` | list, string | 안정 오름차순 정렬; 아래 `sort` 참고 |
| `join(list, sep=",")` | list, string | 원소를 문자열화해 `sep`으로 결합 |
| `range(from, to, step=1)` | number, number, number | `from`부터 `to`까지 양끝 포함 `step` 간격의 list |
| `default(v, d)` | 임의, 임의 | `v`가 falsy면 `d`; 아니면 `v` |

- **FUN-14** `step`이 `0`인 `range`는 `E_RUNTIME_TYPE`으로 실패한다. 음수 `step`은 감소한다. 원소 수가 1,000,000을 넘는 `range`는 `E_RUNTIME_LIMIT`으로 실패한다. `step`이 `to`에 도달하지 못하면 list는 비어 있다.
- **FUN-15** `default`는 진릿값을 검사한다. 표현식의 `??`는 `null`만 검사한다.

### 숫자

| 함수 | 인자 | 결과 |
| --- | --- | --- |
| `number(x, decimals=0, dec=".", thousands=",")` | 임의, number, string, string | 포맷된 십진 텍스트; 아래 `number` 참고 |
| `round(x, d=0)` | 임의, number | `number` 반올림 규칙으로 소수 `d`자리로 반올림한 number |
| `floor(x)` | 임의 | `x`보다 크지 않은 최대 정수 |
| `ceil(x)` | 임의 | `x`보다 작지 않은 최소 정수 |
| `abs(x)` | 임의 | 절댓값 |
| `min(a, b, ...)` | numbers | 가장 작은 인자 |
| `max(a, b, ...)` | numbers | 가장 큰 인자 |
| `num(v)` | 임의 | `to_number(v)` |

- **FUN-16** `number`, `round`, `floor`, `ceil`, `abs`, `num`은 첫 인자를 `to_number`로 변환한다. 변환할 수 없는 값은 `E_RUNTIME_TYPE`으로 실패한다.
- **FUN-17** `min`과 `max`는 최소 한 개의 인자가 필요하고 number만 받는다.

### 값

| 함수 | 인자 | 결과 |
| --- | --- | --- |
| `str(v)` | 임의 | `v`를 문자열화한 일반 문자열 |
| `type(v)` | 임의 | `"null"`, `"bool"`, `"number"`, `"string"`, `"list"`, `"map"` 중 하나 |

- **FUN-18** list나 map의 `str`은 `E_RUNTIME_STRINGIFY`로 실패한다.
- **FUN-19** safe 문자열의 `type`은 `"string"`이다.

### 시간

| 함수 | 인자 | 결과 |
| --- | --- | --- |
| `date(v, fmt)` | number 또는 string 또는 null, string | 포맷된 날짜 텍스트; 아래 `date` 참고 |
| `now()` | 없음 | unix 초 number인 `env.now` |

## number

- **FUN-20** `x`는 `to_number`로 변환한다. `decimals`는 0 이상의 정수다.
- **FUN-21** `x`의 최단 왕복 십진 자릿수를 지수 없는 위치 표기로 전개한다.
- **FUN-22** 위치 표기 자릿수 문자열을 십진 자릿수에 half-away-from-zero 규칙을 적용해 소수 `decimals`자리로 반올림한다. `number(2.675, 2)`는 `2.68`을 반환한다. `number(1.005, 2)`는 `1.01`을 반환한다. `number(-2.5)`는 `-3`을 반환한다.
- **FUN-23** 정수부는 오른쪽부터 세 자리씩 `thousands`로 묶는다. 소수부는 `dec`로 잇는다. `decimals`가 `0`이면 `dec`를 쓰지 않는다.
- **FUN-24** 모든 자릿수가 0인 결과에는 음수 기호가 없다. `number(-0.001, 2)`는 `0.00`을 반환한다.
- **FUN-25** `round(x, d)`는 FUN-20부터 FUN-22를 적용하고 반올림된 값을 number로 반환한다.

## json

- **FUN-26** `json(v)`는 공백 없는 압축 JSON 텍스트를 반환한다. map 키는 삽입 순서로 쓴다. number는 데이터 모델의 숫자→문자열 규칙으로 쓴다.
- **FUN-27** 문자열은 JSON 규칙으로 이스케이프하고, 추가로 `<`는 `\u003c`, `>`는 `\u003e`, `&`는 `\u0026`, U+2028은 `\u2028`, U+2029는 `\u2029`로 쓴다. `/`와 비ASCII 문자는 그대로 쓴다.
- **FUN-28** 결과는 일반 문자열이다. 따라서 echo 태그가 이스케이프하며, 이는 요소 텍스트와 두 따옴표 형태의 속성 값 모두에서 올바르다. script 요소에는 `{= json(v) | raw}`로 JSON 텍스트를 넣는다. FUN-27의 이스케이프가 그 텍스트를 script 요소 안에 유지한다. `json`에 준 safe 문자열은 그 텍스트의 JSON 문자열로 쓴다.
- **FUN-49** JSON의 구조적 따옴표는 이스케이프할 수 없으므로 JSON 텍스트는 이스케이프 없이 큰따옴표 속성 안에서 안전하지 않다. 이것이 FUN-28이 일반 문자열을 반환하는 이유다.

## url

- **FUN-29** `url(s)`는 `s`를 문자열화하고 UTF-8로 인코딩한 뒤 `A`–`Z`, `a`–`z`, `0`–`9`, `-`, `_`, `.`, `~`를 제외한 모든 바이트를 `%`와 대문자 16진수 두 자리로 치환한다.
- **FUN-30** 결과는 일반 문자열이다. echo 태그가 쓸 때 HTML 이스케이프된다.

## slice

- **FUN-31** `slice(v, start, length?)`는 list 또는 string을 받는다. `start`와 `length`는 절단으로 정수로 변환한다.
- **FUN-32** 음수 `start`는 끝에서부터 센다: `start + length(v)`. 조정 후 `0`보다 작은 `start`는 `0`으로 고정한다. 끝을 넘는 `start`는 빈 결과를 반환한다.
- **FUN-33** `length`를 생략하면 결과는 끝까지다. 음수 `length`는 빈 결과를 반환한다. 끝을 넘는 `length`는 끝으로 고정한다.

## sort

- **FUN-34** `sort(list, key?)`는 안정 알고리즘으로 오름차순 정렬한 새 list를 반환한다. 입력 list는 변경하지 않는다.
- **FUN-35** `key`가 없으면 원소를 비교한다. `key`가 있으면 각 원소의 경로 `key`에 있는 값을 비교한다. `key`는 표현식 언어의 조회 규칙으로 해석하는 `"price"`, `"user.name"` 같은 경로 문자열이다.
- **FUN-36** 비교하는 모든 값이 number이거나 모두 string이어야 한다. string은 코드포인트로 비교한다. 타입이 섞이거나 number도 string도 아닌 값이 있으면 `E_RUNTIME_TYPE`으로 실패한다.

## date

- **FUN-37** `v`는 unix 초 number(소수는 0 방향으로 절단)이거나 `YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DDTHH:MM:SS` 중 한 형식의 문자열이며, 각 형식 뒤에 `Z` 또는 `±HH:MM`이 올 수 있다. 오프셋 없는 문자열은 `env.timezone`으로 해석한다. 날짜만 있는 문자열의 시각은 `00:00:00`이다.
- **FUN-38** `v`가 `null`이면 `""`를 반환한다. 다른 타입이나 해석할 수 없는 문자열은 `E_RUNTIME_TYPE`으로 실패한다.
- **FUN-39** 출력은 `env.timezone`으로 계산한다. `env.timezone`은 `Z` 또는 고정 오프셋 `±HH:MM`이다. 이름 있는 시간대는 지원하지 않으며 시간대 데이터베이스를 사용하지 않는다.
- **FUN-40** 포맷 토큰:

| 토큰 | 출력 |
| --- | --- |
| `Y` | 네 자리 연도 |
| `y` | 두 자리 연도 |
| `m` | 월 `01`–`12` |
| `n` | 월 `1`–`12` |
| `d` | 일 `01`–`31` |
| `j` | 일 `1`–`31` |
| `H` | 시 `00`–`23` |
| `G` | 시 `0`–`23` |
| `i` | 분 `00`–`59` |
| `s` | 초 `00`–`59` |
| `D` | `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` |
| `l` | `Monday`부터 `Sunday` |
| `N` | 요일 `1`(월요일)부터 `7`(일요일) |
| `w` | 요일 `0`(일요일)부터 `6`(토요일) |
| `M` | `Jan`부터 `Dec` |
| `F` | `January`부터 `December` |
| `U` | unix 초 |
| `P` | 오프셋 `±HH:MM` |

- **FUN-41** `\` 뒤의 문자는 그 문자를 쓴다. 그 외 문자는 그대로 쓴다.
- **FUN-42** `now()`는 `env.now`를 반환한다. `env.now`는 unix 초 number이며, 호스트가 설정하지 않으면 호스트의 현재 시각을 사용한다. 적합성 픽스처는 항상 `env.now`와 `env.timezone`을 설정한다.

## 호스트 함수

- **FUN-43** 호스트는 `register(name, fn)`으로 함수를 등록한다. `name`은 식별자다. `fn`은 인자 목록을 값으로 받고 값을 반환한다.
- **FUN-44** 내장 함수 이름의 등록은 등록 시점에 실패한다. 같은 이름을 두 번 등록하면 앞의 함수를 교체한다.
- **FUN-45** 반환값은 데이터 모델의 호스트 바인딩 규칙으로 변환한다. 변환할 수 없는 값은 해당 `E_DATA_*` 코드로 실패한다.
- **FUN-46** `fn`이 던진 오류는 템플릿 안 호출 위치와 함께 `E_RUNTIME_HOST_FUNCTION`으로 렌더를 실패시킨다.
- **FUN-47** 템플릿을 렌더하는 모든 호스트는 같은 함수 이름을 등록한다. 한 호스트에만 등록된 이름을 호출하는 템플릿은 다른 호스트에서 `E_RUNTIME_UNKNOWN_FUNCTION`으로 실패한다.
- **FUN-48** 문자열을 반환하는 호스트 함수는 일반 문자열을 반환한다. 호스트는 safe 문자열을 반환할 수 없다. 이스케이프 없이 써야 하면 템플릿이 결과에 `raw`를 적용한다.
