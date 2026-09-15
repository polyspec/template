# 데이터 모델

[English](/spec/data-model).

이 문서는 템플릿이 다루는 값 타입, safe 문자열, 값을 출력 텍스트로 변환하는 규칙, 호스트 언어 값을 템플릿 값으로 변환하는 규칙을 정의한다. 연산자는 [표현식](/ko/spec/expressions)에 정의한다. 오류 코드는 [오류](/ko/spec/errors)에 정의한다. 규칙 번호는 `VAL-n`이다.

## 값 타입

**VAL-1** 값은 다음 타입 중 정확히 하나를 가진다.

| 타입 | 내용 |
| --- | --- |
| null | 단일 값 `null` |
| bool | `true` 또는 `false` |
| number | IEEE 754 배정밀도 부동소수점 수 |
| string | 유니코드 코드포인트 열 |
| list | 값의 순서 있는 열 |
| map | 항목의 순서 있는 열. 각 항목은 string 키와 값을 가지며 키는 유일하다 |

**VAL-2** number 타입은 하나다. 정수는 소수 부분이 없는 number이다. JSON 텍스트의 정수 리터럴과 정수 타입의 호스트 값은 호스트 바인딩으로 엔진에 들어올 때 크기가 2^53 − 1 이하여야 하며, 더 큰 정수는 E_DATA_NUMBER_RANGE이다. 부동소수점 호스트 값과 소수부 또는 지수를 가진 JSON 숫자는 유한하면 받아들인다. 이 범위 안의 정수 산술은 정확하다.

**VAL-3** NaN, +Infinity, -Infinity 값은 존재하지 않는다. 호스트 바인딩은 이를 E_DATA_NUMBER_NOT_FINITE로 거부한다. 유한하지 않은 산술 결과는 표현식에 정의된 대로 E_RUNTIME_TYPE이다.

**VAL-4** map은 모든 구현에서 항목의 삽입 순서를 유지한다. 반복, `keys`, `values`, `json`은 그 순서를 따른다.

**VAL-5** string은 유니코드 코드포인트 단위로 길이를 재고, 인덱싱하고, 자른다. 두 string은 코드포인트 열을 원소별로 비교해 순서를 정한다. 더 긴 string의 접두사인 더 짧은 string이 앞선다.

## safe 문자열

**VAL-6** safe 문자열은 safe 표시를 가진 string이다. 함수 `raw`와 `escape`는 safe 문자열을 반환한다. echo 태그는 safe 문자열을 이스케이프하지 않고 쓴다. 그 외 모든 위치에서 safe 문자열은 string으로 동작한다: 함수, 연산자, `==`, `in`은 그 텍스트를 읽고 표시를 무시하며, string을 반환하는 함수는 일반 string을 반환한다.

**VAL-7** 호스트 바인딩은 safe 문자열을 생성하지 않는다. string을 반환하는 호스트 함수는 [함수](/ko/spec/functions)에 정의된 대로 일반 string을 반환한다.

## 문자열화

**VAL-8** `stringify(v)`는 값을 텍스트로 변환한다. echo 태그, 한쪽 피연산자가 string인 `+` 연산자, `in` 연산자, map 리터럴 키, 함수 `str`와 `join`이 사용한다.

| 타입 | 결과 |
| --- | --- |
| null | 빈 문자열 |
| bool | `true` 또는 `false` |
| number | VAL-9에 정의된 텍스트 |
| string | 그 string 자체 |
| list, map | E_RUNTIME_STRINGIFY |

**VAL-9** number `x`는 다음과 같이 텍스트로 변환한다.

1. `x`가 0 또는 -0이면 결과는 `0`이다.
2. `x`가 음수이면 결과는 `-` 뒤에 `-x`의 변환을 붙인 것이다.
3. `k >= 1`, `10^(k-1) <= s < 10^k`, `s × 10^(n-k)`가 `x`와 같고, `k`가 그러한 최소값인 정수 `s`, `k`, `n`을 취한다. `s`는 `x`로 되돌아오는 최단 자릿수 문자열이다. 같은 `k`를 가진 `s`가 여럿이면 `x`에 가장 가까운 것을 택하고, 같으면 짝수를 택한다.
4. `k <= n <= 21`이면 결과는 `s`의 `k`자리 뒤에 `n - k`개의 0을 붙인 것이다.
5. 그 외에 `0 < n <= 21`이면 결과는 `s`의 처음 `n`자리, `.`, 나머지 `k - n`자리다.
6. 그 외에 `-6 < n <= 0`이면 결과는 `0.`, `-n`개의 0, `s`의 `k`자리다.
7. 그 외에는 `e`를 `n - 1`로 둔다. `k`가 1이면 결과는 `s`의 한 자리, `e`, 부호 `+` 또는 `-`, `|e|`의 십진 자릿수다. `k`가 1보다 크면 결과는 `s`의 첫 자리, `.`, 나머지 자리, `e`, 부호, `|e|`의 십진 자릿수다.

| 숫자 | 텍스트 |
| --- | --- |
| `1` | `1` |
| `1.0` | `1` |
| `-0` | `0` |
| `0.5` | `0.5` |
| `1234.5` | `1234.5` |
| `0.1 + 0.2` | `0.30000000000000004` |
| `1e21` | `1e+21` |
| `123456789012345680000` | `123456789012345680000` |
| `0.000001` | `0.000001` |
| `1e-7` | `1e-7` |
| `1.5e-7` | `1.5e-7` |
| `2^53 - 1` | `9007199254740991` |

**VAL-10** 각 구현은 플랫폼의 최단 왕복 변환으로 자릿수 `s`와 지수 `n`을 얻은 뒤 VAL-9의 4단계부터 7단계를 적용한다.

| 구현 | 자릿수 출처 |
| --- | --- |
| TypeScript | `String(x)`가 완전한 결과를 생성한다 |
| Go | `strconv.FormatFloat(x, 'e', -1, 64)`가 자릿수와 지수를 준다 |
| Rust | `format!("{:e}", x)`가 자릿수와 지수를 준다 |
| PHP | `serialize_precision`을 `-1`로 둔 `json_encode($x)` 또는 `var_export($x, true)`가 자릿수와 지수를 준다 |

## 호스트 바인딩

**VAL-11** 호스트 바인딩은 렌더 전에 호스트 언어의 값을 템플릿 값으로 변환한다. 바인딩은 assign 데이터, 템플릿 define 데이터, 호스트가 계산한 scope 인자, 호스트 함수의 반환값에 적용된다. VAL-12부터 VAL-16의 변환 표는 허용되는 입력의 전체 집합이며 그 외 입력은 E_DATA_UNSUPPORTED_TYPE이다.

**VAL-12** JSON 텍스트는 assign 데이터의 기준 형태다. 모든 구현은 JSON 텍스트를 받아 같은 값을 생성한다. 각 구현은 문서 순서를 보존하고 안전 범위 밖의 정수를 검출하는 파서로 JSON 텍스트를 파싱한다. TypeScript 구현은 이 파서를 패키지에 제공하며 assign 데이터에 `JSON.parse`를 사용하지 않는다.

| JSON | 값 |
| --- | --- |
| `null` | null |
| `true`, `false` | bool |
| 숫자 | number. ±(2^53 − 1) 밖의 정수 리터럴은 E_DATA_NUMBER_RANGE. 유한한 double에 들어가지 않는 리터럴은 E_DATA_NUMBER_NOT_FINITE |
| 문자열 | string. 유효한 UTF-8이 아닌 텍스트는 E_DATA_INVALID_UTF8 |
| 배열 | 문서 순서의 list |
| 객체 | 문서 순서의 map. 중복 키는 이전 값을 대체하고 이전 위치를 유지 |

**VAL-13** TypeScript와 JavaScript.

| 입력 | 값 |
| --- | --- |
| `null`, `undefined` | null |
| `boolean` | bool |
| `number` | number. 유한하지 않은 값은 E_DATA_NUMBER_NOT_FINITE |
| `bigint` | ±(2^53 − 1) 안이면 number, 아니면 E_DATA_NUMBER_RANGE |
| `string` | string |
| `Array` | list |
| string 키의 `Map` | 삽입 순서의 map |
| 일반 객체 | 플랫폼의 프로퍼티 열거 순서의 map. 정수 형태의 키는 오름차순으로 먼저 열거되므로, 그런 키를 가진 JSON 객체는 파싱된 객체가 아니라 JSON 텍스트에서 바인딩해야 한다 |
| `Date`, 함수, symbol, string이 아닌 키를 가진 `Map` | E_DATA_UNSUPPORTED_TYPE |
| 클래스 인스턴스 | object. 원본 인스턴스를 유지하고 public member만 노출 |

**VAL-14** PHP.

| 입력 | 값 |
| --- | --- |
| `null` | null |
| `bool` | bool |
| `int` | number. ±(2^53 − 1) 밖의 값은 E_DATA_NUMBER_RANGE |
| `float` | number. 유한하지 않은 값은 E_DATA_NUMBER_NOT_FINITE |
| `string` | string. 유효한 UTF-8이 아닌 값은 E_DATA_INVALID_UTF8 |
| `array_is_list()`가 true인 `array` | list |
| 그 외 `array` | map. 각 키를 string으로 변환. 정수 키 `1`은 키 `"1"`이 된다 |
| `stdClass`, `JsonSerializable`을 구현한 객체 | 객체 프로퍼티 또는 `jsonSerialize()`로부터의 map |
| 그 외 객체 | object. 원본 인스턴스를 유지하고 public property와 method만 노출 |
| 리소스 | E_DATA_UNSUPPORTED_TYPE |

**VAL-15** Go.

| 입력 | 값 |
| --- | --- |
| `nil` | null |
| `bool` | bool |
| `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64` | number. ±(2^53 − 1) 밖의 값은 E_DATA_NUMBER_RANGE |
| `float32`, `float64` | number. 유한하지 않은 값은 E_DATA_NUMBER_NOT_FINITE |
| `string` | string. 유효한 UTF-8이 아닌 값은 E_DATA_INVALID_UTF8 |
| 슬라이스 | list |
| 패키지가 제공하는 삽입 순서 map 타입 | 삽입 순서의 map |
| `map[string]T` | 키를 바이트 순으로 정렬한 map |
| 구조체 값 또는 포인터 | object. 원본 값을 유지하고 export된 field와 method를 노출 |
| 그 외 | E_DATA_UNSUPPORTED_TYPE |

**VAL-16** Rust.

| 입력 | 값 |
| --- | --- |
| `serde_json::Value::Null` | null |
| `serde_json::Value::Bool` | bool |
| `serde_json::Value::Number` | number. ±(2^53 − 1) 밖의 `i64` 또는 `u64`는 E_DATA_NUMBER_RANGE. 유한하지 않은 `f64`는 E_DATA_NUMBER_NOT_FINITE |
| `serde_json::Value::String` | string |
| `serde_json::Value::Array` | list |
| `serde_json::Value::Object` | 삽입 순서의 map. `serde_json`의 `preserve_order` 기능이 필요하다 |

**VAL-17** 모든 호스트에서 map 키는 string이다. string이 아닌 키를 가진 호스트 map은 위 표가 변환을 정의한 경우에만 변환되며 그 외에는 E_DATA_UNSUPPORTED_TYPE이다.

**VAL-18** 바인딩은 호스트의 의미를 복사하지 않는다. 객체 참조, 리소스 핸들, 함수는 값에 저장되지 않는다. 렌더링은 값을 읽기만 하며 호스트 데이터에 쓰지 않는다.

**VAL-19** Native object는 template의 불투명한 값이다. Member lookup은 public field/property를 읽고 member call은 원본 인스턴스의 public method를 호출한다. 없는 method는 E_RUNTIME_UNKNOWN_FUNCTION이다. Native object는 truthy이며 stringify·반복·spread할 수 없다.

## 예시

| 입력(JSON) | 값의 `stringify` |
| --- | --- |
| `null` | `` (빈 문자열) |
| `true` | `true` |
| `12.50` | `12.5` |
| `1e2` | `100` |
| `"a"` | `a` |
| `[1]` | E_RUNTIME_STRINGIFY |
| `{"a": 1}` | E_RUNTIME_STRINGIFY |
