<!-- doc-id: docs-spec-data-model -->
<!-- source-sha256: 228ded7f9fb3b4821df474beb57a512174ca47ca05cd2eddd166ee711e8ca0e8 -->
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

**VAL-2** number 타입은 하나다. 정수는 소수 부분이 없는 number이다. 호스트 바인딩은 유한하고 크기가 2^53 − 1(9007199254740991) 이하인 숫자만 받아들인다. 이 규칙은 숫자 값에만 의존하며 호스트 타입이나 JSON 리터럴의 표기에 의존하지 않는다. 정수 타입의 호스트 값, 부동소수점 호스트 값, JSON 정수 리터럴, 소수부나 지수를 가진 JSON 리터럴을 똑같이 검사한다. NaN이거나 무한인 값은 E_DATA_NUMBER_NOT_FINITE이다(VAL-3). 크기가 2^53 − 1보다 큰 유한한 값은 E_DATA_NUMBER_RANGE이다. 그런 크기의 부동소수점 수는 모두 정수이므로 `1e19`, `2^53`, `9007199254740992.0`은 모두 E_DATA_NUMBER_RANGE이다. JSON 리터럴은 먼저 가장 가까운 double로 변환한다. 가장 가까운 double이 무한인 리터럴, 예를 들어 `1e400`은 E_DATA_NUMBER_NOT_FINITE이다. 정수 타입의 호스트 값은 정확한 값으로 비교한다. 템플릿 산술이 만드는 숫자는 호스트 바인딩이 아니며 VAL-3만 적용된다. 바인딩 범위 안의 정수 산술은 정확하다.

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

**VAL-11** 호스트 바인딩은 호스트 언어의 값을 템플릿 값으로 변환한다. 바인딩은 assign 데이터, 템플릿 define 데이터, 호스트가 계산한 scope 인자, 호스트 함수·논리 class 함수·instance method의 반환값, 템플릿이 읽는 native object member의 값에 적용된다(VAL-19). VAL-12부터 VAL-16과 VAL-23의 변환 표는 허용되는 입력의 전체 집합이며 그 외 입력은 E_DATA_UNSUPPORTED_TYPE이다. VAL-17부터 VAL-21은 모든 호스트에 적용된다. bound map(VAL-22)은 바인딩을 거쳤으므로 `render`가 `assign`이나 정의 data로 받을 때 다시 binding하지 않는다(RT-61).

**VAL-12** JSON 텍스트는 assign 데이터의 기준 형태다. 모든 구현은 JSON 텍스트를 받아 같은 값을 생성한다. 각 구현은 문서 순서를 보존하고 VAL-2의 숫자 규칙과 VAL-20의 깊이 제한을 적용하는 파서로 JSON 텍스트를 파싱한다. TypeScript 구현은 이 파서를 패키지에 제공하며 assign 데이터에 `JSON.parse`를 사용하지 않는다.

| JSON | 값 |
| --- | --- |
| `null` | null |
| `true`, `false` | bool |
| 숫자 | VAL-2에 따른 number |
| 문자열 | string. 유효한 UTF-8이 아닌 텍스트는 E_DATA_INVALID_UTF8. high-low surrogate 쌍에 속하지 않는 surrogate 코드포인트(U+D800~U+DFFF)를 만드는 `\u` escape는 E_DATA_INVALID_UTF8 |
| 배열 | 문서 순서의 list |
| 객체 | 문서 순서의 map. 키는 문자열 행을 따른다. 중복 키는 이전 값을 대체하고 이전 위치를 유지 |

VAL-20의 제한보다 깊게 중첩된 배열과 객체는 E_DATA_DEPTH이다. 파서는 제한을 넘는 첫 배열 또는 객체에서 나머지 텍스트를 읽기 전에 실패한다.

하나의 JSON 문서가 아닌 텍스트는 E_DATA_INVALID_JSON이다. 문법 오류, 빈 텍스트, 문서 뒤에 공백이 아닌 내용이 있는 텍스트가 이에 해당한다. 파서는 문서 순서에서 첫 위반을 보고하므로 문법 오류보다 앞에 있는 깊이 오류나 숫자 오류는 그 오류 코드로 보고된다. 이 규칙은 구현이 데이터로 받는 모든 JSON 텍스트, 즉 assign 데이터, 템플릿 정의와 환경에 적용되며 명령줄 인터페이스의 파일(CNF-4)과 PHP 확장의 JSON 메서드도 포함한다. 이유: JSON 텍스트는 데이터의 기준 형태이므로 잘못된 문서는 같은 입력의 데이터 오류다. 따라서 모든 구현은 구현마다 다른 예외가 아니라 ERR-5의 데이터 오류 객체로 이를 보고한다.

**VAL-13** TypeScript와 JavaScript.

| 입력 | 값 |
| --- | --- |
| `null`, `undefined` | null |
| `boolean` | bool |
| `number` | VAL-2에 따른 number |
| `bigint` | VAL-2에 따른 number |
| `string` | string. 올바른 형식의 UTF-16이 아닌 문자열, 즉 high-low 쌍 밖의 surrogate code unit을 포함한 문자열은 E_DATA_INVALID_UTF8 |
| `Array` | list |
| string 키의 `Map` | 삽입 순서의 map. 키는 `string` 행을 따른다 |
| prototype이 `Object.prototype` 또는 `null`인 일반 객체 | 플랫폼의 프로퍼티 열거 순서의 map. 키는 `string` 행을 따른다. 정수 형태의 키는 오름차순으로 먼저 열거되므로, 그런 키를 가진 JSON 객체는 파싱된 객체가 아니라 JSON 텍스트에서 바인딩해야 한다 |
| `Date`, 함수, symbol, string이 아닌 키를 가진 `Map` | E_DATA_UNSUPPORTED_TYPE |
| bound map(VAL-22) | E_DATA_UNSUPPORTED_TYPE. `assign`과 정의 `data`일 때는 예외다(VAL-22). |
| 클래스 인스턴스 | object(VAL-19). 원본 인스턴스를 유지한다 |

**VAL-14** PHP.

| 입력 | 값 |
| --- | --- |
| `null` | null |
| `bool` | bool |
| `int` | VAL-2에 따른 number |
| `float` | VAL-2에 따른 number |
| `string` | string. 유효한 UTF-8이 아닌 값은 E_DATA_INVALID_UTF8 |
| `array_is_list()`가 true인 `array` | list |
| 그 외 `array` | map. 각 키를 string으로 변환. 정수 키 `1`은 키 `"1"`이 된다. 유효한 UTF-8이 아닌 string 키는 E_DATA_INVALID_UTF8 |
| bound map(VAL-22) | E_DATA_UNSUPPORTED_TYPE. `assign`과 정의 `data`일 때는 예외다(VAL-22). |
| `JsonSerializable`을 구현한 객체 | `jsonSerialize()`가 반환한 값의 바인딩. `jsonSerialize()`가 던진 예외는 그 예외의 message를 가진 E_RUNTIME_HOST_FUNCTION |
| 그 외 `stdClass` 또는 `stdClass` 하위 클래스의 인스턴스 | `get_mangled_object_vars()` 순서의 public 프로퍼티 map. 유효한 UTF-8이 아닌 프로퍼티 이름은 E_DATA_INVALID_UTF8 |
| `Closure` | E_DATA_UNSUPPORTED_TYPE |
| 그 외 객체 | object(VAL-19). 원본 인스턴스를 유지한다 |
| 열린 또는 닫힌 리소스 | E_DATA_UNSUPPORTED_TYPE |

행은 이 순서로 적용하므로 `JsonSerializable`을 구현한 `stdClass` 하위 클래스는 `jsonSerialize()`의 값을 바인딩한다. 객체의 public 프로퍼티는 `get_mangled_object_vars()`의 항목 중 이름이 mangle되지 않은 항목, 즉 초기화된 선언 public 프로퍼티와 동적 프로퍼티다. 결과는 호스트가 `render`를 호출한 class scope에 의존하지 않는다.

**VAL-15** Go.

| 입력 | 값 |
| --- | --- |
| `nil` | null |
| `bool` | bool |
| `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64` | VAL-2에 따른 number |
| `float32`, `float64` | VAL-2에 따른 number |
| `string` | string. 유효한 UTF-8이 아닌 값은 E_DATA_INVALID_UTF8 |
| 슬라이스, 배열 | list |
| 패키지가 제공하는 삽입 순서 map 타입 | 삽입 순서의 map. 키는 `string` 행을 따른다 |
| `map[string]T` | 키를 바이트 순으로 정렬한 map. 키는 `string` 행을 따른다 |
| bound map(VAL-22) | E_DATA_UNSUPPORTED_TYPE. `assign`과 정의 `data`일 때는 예외다(VAL-22). nil이 아닌 bound map pointer는 어느 위치에서든 E_DATA_UNSUPPORTED_TYPE이고, nil pointer는 null이다. |
| 구조체 값, 구조체 포인터 | object(VAL-19). 원본 값을 유지한다 |
| 그 밖의 kind를 가리키는 포인터 | 가리키는 값의 바인딩. `nil`은 null. 이런 역참조 한 번은 VAL-20의 한 단계로 세므로, 자기 자신으로 돌아오는 포인터는 E_DATA_DEPTH로 실패한다 |
| 함수, 채널과 그 밖의 모든 kind | E_DATA_UNSUPPORTED_TYPE |

**VAL-16** Rust.

| 입력 | 값 |
| --- | --- |
| `serde_json::Value::Null` | null |
| `serde_json::Value::Bool` | bool |
| `serde_json::Value::Number` | VAL-2에 따른 number |
| `serde_json::Value::String` | string |
| `serde_json::Value::Array` | list |
| `serde_json::Value::Object` | 삽입 순서의 map. `serde_json`의 `preserve_order` 기능이 필요하다 |
| 호스트가 만들어 `render_values`에 전달한 `Value`, 또는 호스트 함수·논리 class 함수·`TemplateObject`가 반환한 `Value` | VAL-2, VAL-3, VAL-20 검사를 거친 같은 값 |
| `Value::Object` | object(VAL-19). `TemplateObject`를 유지한다 |

bound map(VAL-22)은 별도 type이고 위 입력 어느 것도 그것을 담을 수 없다. 그래서 `render`는 bound map을 `assign`과 정의 `data`로만 받는다.

**VAL-23** Python.

| 입력 | 값 |
| --- | --- |
| `None` | null |
| `bool` | bool |
| `int` | VAL-2에 따른 number. 안전한 범위 밖의 정수는 E_DATA_NUMBER_RANGE |
| `float` | VAL-2에 따른 number |
| `str` | string. 짝이 없는 surrogate 코드 포인트를 포함한 값은 E_DATA_INVALID_UTF8 |
| `list`, `tuple` | list |
| `dict` | 삽입 순서의 map. 키는 `str` 행을 따르며, `str`이 아닌 키는 E_DATA_UNSUPPORTED_TYPE |
| bound map(VAL-22) | `assign`과 정의 `data`(VAL-22)를 제외하면 E_DATA_UNSUPPORTED_TYPE |
| 인터프리터 자신이 정의하지 않은 class의 인스턴스, 즉 type이 모듈 `builtins`에 속하지 않는 값 | object(VAL-19). 원본 인스턴스를 유지한다 |
| 함수, method, class, 모듈, 그리고 `set`, `bytes`, `complex`, `range`, generator처럼 `builtins`에 속한 type의 그 밖의 모든 인스턴스 | E_DATA_UNSUPPORTED_TYPE |

**VAL-17** 모든 호스트에서 map 키는 string이다. string이 아닌 키를 가진 호스트 map은 위 표가 변환을 정의한 경우에만 변환되며 그 외에는 E_DATA_UNSUPPORTED_TYPE이다. 키는 string 값과 같이 검사한다. 유효한 UTF-8이 아닌 키, TypeScript에서는 올바른 형식의 UTF-16이 아닌 키는 E_DATA_INVALID_UTF8이다.

**VAL-18** 바인딩은 할당된 native object 참조를 복사하지 않고 유지한다. 템플릿이 호스트 함수, 논리 class 함수 또는 instance method에 인자로 넘긴 native object는 직접 넘기든 list나 map 인자 안에 넣어 넘기든 원본 호스트 객체로 도착한다. 같은 PHP 객체, 같은 JavaScript 인스턴스, 같은 Go 값, 같은 Python 객체이며, Rust에서는 같은 `TemplateObject`이고 호스트는 `Value::downcast_object`로 이를 되찾는다. 그 밖의 인자 값의 형태는 VAL-21이 정의한다. 리소스 핸들과 함수는 PHP closure를 포함해 템플릿 값이 아니며 바인딩은 이를 E_DATA_UNSUPPORTED_TYPE으로 거부한다. 렌더링은 값을 읽기만 하며 호스트 데이터에 쓰지 않는다.

**VAL-19** Native object는 템플릿의 불투명한 값이다. Truthy이며 stringify·반복·spread할 수 없고 JSON으로 쓸 수 없다(FUN-26).

- string 키의 lookup(`o.name`, `o['name']`, EXP-18)은 원본 인스턴스의 public field 또는 property를 읽고 그 값을 바인딩한다(VAL-11). public field나 property가 아닌 이름은 `null`을 반환하며 string이 아닌 모든 키도 같다. 바인딩할 수 없는 field 값은 그 `E_DATA_*` 코드로 실패하고, 오류를 발생시킨 accessor는 E_RUNTIME_HOST_FUNCTION으로 실패한다. 두 오류 모두 lookup 표현식을 가리킨다(ERR-5).
- Member call `o.name(args)`은 원본 인스턴스의 public method를 인자와 함께 호출하고(VAL-18) 결과를 바인딩한다. public method가 아닌 이름은 E_RUNTIME_UNKNOWN_FUNCTION이며, private 또는 protected method와 PHP `__call` 같은 동적 dispatch hook만 처리하는 이름도 포함한다. 인자를 거부하거나 오류를 발생시킨 method는 E_RUNTIME_HOST_FUNCTION이다. 바인딩할 수 없는 결과는 그 `E_DATA_*` 코드로 호출 위치에서 실패한다.
- 가시성은 선언의 속성이다. `render`를 호출하는 코드에 의존하지 않는다. 객체의 class 안에서 `render`를 호출해도 템플릿은 같은 member를 본다.

| 호스트 | public field 또는 property | public method |
| --- | --- | --- |
| TypeScript | 인스턴스의 own property, 또는 `Object.prototype` 아래 prototype chain에 있는 accessor property(getter) | `Object.prototype` 아래 prototype chain에 있는 함수 값 data property. `constructor`는 제외 |
| PHP | `get_mangled_object_vars()`의 항목 중 이름이 mangle되지 않은 항목. `__get`은 참조하지 않는다 | class 또는 조상이 public으로 선언한 method. static 여부는 무관. `__call`은 참조하지 않는다 |
| Go | 이름이 대소문자 무시로 키와 같거나 `json` tag 이름이 키와 같은 export된 구조체 field | 값의 method set에서 이름이 키이거나 키를 snake case에서 camel case로 바꾼 이름인 export된 method |
| Rust | `TemplateObject::member`가 반환한 값 | `TemplateObject::call` |
| Python | 이름이 `_`로 시작하지 않고 값이 callable이 아닌 attribute. callable attribute는 field가 아니며 `null`로 읽힌다 | 이름이 `_`로 시작하지 않는 callable attribute |

**VAL-20** list 또는 map의 깊이는 원소 또는 값의 가장 큰 깊이에 1을 더한 값이다. 빈 list나 map의 깊이는 1이다. 그 밖의 값의 깊이는 0이며, member를 템플릿이 읽을 때에만 바인딩하는 native object도 0이다. 어떤 템플릿 값도 깊이가 64보다 크지 않다.

- 깊이가 64보다 큰 값을 바인딩하면 E_DATA_DEPTH로 실패한다. 바인딩은 65번째 단계에서 멈추고 값의 더 깊은 부분을 읽지 않는다. 자기 자신을 포함하는 JavaScript 객체, Go map이나 슬라이스, PHP 객체나 배열 같은 순환 호스트 구조는 유한한 깊이가 없으므로 별도의 순환 검사 없이 같은 제한에 의해 E_DATA_DEPTH로 실패한다. PHP에서는 `jsonSerialize()` 호출 한 번도 한 단계로 센다. 따라서 `jsonSerialize()`가 객체 자신을 반환하는 객체는 E_DATA_DEPTH로 실패한다.
- 값의 깊이가 64보다 커지는 list 또는 map literal은 그 literal 위치에서 E_RUNTIME_LIMIT로 실패한다. list와 map literal은 피연산자보다 깊은 값을 만드는 유일한 템플릿 연산이다. 함수는 인자보다 깊지 않은 값을 반환하며 호스트 함수의 결과는 바인딩한다.

## 호스트 인자

**VAL-21** 호스트 함수, 논리 class 함수와 instance method는 모든 인자를 다음 형태의 호스트 값으로 받는다. 형태는 AST program과 모든 generated program에서 같으며, 모든 깊이의 list 원소와 map 값에도 적용된다.

| 템플릿 값 | TypeScript | PHP | Go | Rust | Python |
| --- | --- | --- | --- | --- | --- |
| null | `null` | `null` | `nil` | `Value::Null` | `None` |
| bool | `boolean` | `bool` | `bool` | `Value::Bool` | `bool` |
| number | `number` | `float` | `float64` | `Value::Number` | `float` |
| string, safe string | `string` | `string` | `string` | `Value::Str` | `str` |
| list | `Array` | `array_is_list()`가 참인 `array` | `value.List` (`[]any`) | `Value::List` | `list` |
| map | 문자열 키의 `Map`, 항목 순서 | 항목 순서대로 항목을 담은 `array` | `*value.OrderedMap`, 항목 순서 | `Value::Map`, 항목 순서 | `dict`, 항목 순서 |
| native object | 원본 인스턴스 | 원본 객체 | 원본 값 | 같은 `TemplateObject` | 원본 인스턴스 |

- safe 문자열은 일반 문자열로 도착한다. safe 표시는 렌더 안에서만 존재한다(VAL-6, VAL-7). 결과를 escape 없이 출력해야 하는 호스트 함수는 텍스트를 반환하고 템플릿이 `raw`를 적용한다(FUN-48).
- list와 map은 호스트가 소유하는 새 호스트 값으로 도착한다. 호스트가 받은 list나 map을 바꿔도 어떤 템플릿 값도 바뀌지 않는다. 렌더 안에서 같은 템플릿 값을 나중에 읽으면 호출 전의 값을 반환한다. native object는 복사하지 않는다(VAL-18).
- PHP에서 map은 배열로 도착하므로 PHP 배열의 키 변환이 적용된다. PHP 정수 범위 안의 정수를 나타내는 10진 텍스트이고 `+` 부호와 선행 0이 없으며 `-0`이 아닌 키는 정수 키가 된다. PHP 배열은 빈 map과 빈 list를 구별하지 못하고, 키가 차례대로 `"0"`부터 `"n-1"`인 map과 list도 구별하지 못한다. 그런 map은 그 배열로 도착하며 그 배열을 다시 바인딩하면(VAL-14) list가 된다. PHP AST program과 PHP 확장은 같은 배열을 만든다.
- 이유: 모든 호스트가 자기 언어의 일반 값, 즉 자기 바인딩 표(VAL-13~VAL-16, VAL-23)가 받는 값을 받는다. 따라서 호스트 코드는 인자를 읽기 위해 구현 클래스가 필요 없고 인자를 변환 없이 반환할 수 있다. safe 문자열 wrapper나 PHP 클래스 `MapValue` 같은 내부 표현은 호스트 코드에 도달하지 않으며 두 PHP 구현은 같은 값을 넘긴다.


## Bound data

**VAL-22** 호스트는 `bind`로 data를 한 번 binding하고, bound map으로 여러 번 렌더한다. 모든 구현은 bound map type과 연산 두 개를 제공한다. 언어별 이름은 [`packages/template-compiler/interface.json`](https://github.com/polyspec/template/blob/main/packages/template-compiler/interface.json)에 둔다(RT-67). 구현은 package 하나다. TypeScript package는 browser entry `@polyspec/template/render`를 포함한 모든 entry point와 module format이 한 구현이다(`supportLevels`의 `typescript`와 `javascript-esm`). Go module, Rust crate, PHP package, PHP extension, Python package도 각각 한 구현이다. 한 구현의 모든 entry point와 module format은 서로가 만든 bound map을 받는다.

- `bind(value)`는 호스트 바인딩(VAL-13~VAL-16, VAL-23)이 map으로 바꾸는 모든 호스트 값과 `render`가 빈 map으로 쓰는 값(RT-4)을 받는다. JSON text는 받지 않는다. 호스트는 JSON text를 package의 JSON parser(VAL-12)로 parse한 결과를 `bind`에 준다. `bind`는 호스트 바인딩(VAL-11~VAL-20)을 적용하고 bound map을 돌려준다. `render`가 빈 map으로 쓰는 값은 빈 bound map을 돌려준다. 같은 구현의 bound map은 바꾸지 않고 그대로 돌려준다. 바뀌지 않고 이미 검사했기 때문이다. 바인딩이 map으로 바꾸지 않는 그 밖의 값은 E_DATA_UNSUPPORTED_TYPE으로 실패한다. 실패는 ERR-14의 오류다. 각 구현이 bound map을 `render`와 `prepare`에 넘기는 연산이나 parameter type은 `packages/template-compiler/interface.json`에 적는다. 예를 들어 Rust의 `prepare_bound`와 `render_bound`, PHP extension의 `render`다. PHP extension의 `render_json`처럼 JSON text를 받는 연산은 bound map을 받지 않는다.
- `merge(first, second)`는 RT-26의 우선순위로 `first`와 `second`의 항목을 가진 bound map을 돌려준다. `second`의 항목은 같은 key의 `first` 항목을 바꾸고 `first`의 위치를 유지한다. `second`의 나머지 항목은 그 뒤에 순서대로 붙는다. 값을 다시 읽지 않는다.

TypeScript, PHP, PHP extension에서는 `bind`와 `merge`의 parameter가 모든 값을 받으므로 연산 안에서 검사한다. 같은 구현의 bound map이 아닌 `merge`의 인자는 E_DATA_UNSUPPORTED_TYPE으로 실패한다. Go와 Rust에서는 `merge`의 parameter type이 bound map type이므로 compiler가 다른 값을 거부한다.

`render`와 `prepare`는 bound map을 `assign`(RT-4)과 템플릿 정의의 `data`(RT-24)로 받고, 다시 binding하지 않는다(RT-61). 그 밖의 위치에 있는 bound map, 즉 `bind`, `render`, `prepare`에 준 list, map, object 안의 bound map과 호스트 코드의 결과(VAL-11)인 bound map은 호스트 바인딩이 E_DATA_UNSUPPORTED_TYPE으로 실패시킨다. 다른 구현이 만든 bound map, 예를 들어 PHP 구현에 준 PHP extension의 bound map은 어느 위치에서든 E_DATA_UNSUPPORTED_TYPE으로 실패한다. bound map은 native object(VAL-19)가 되지 않는다. 이유: bound map은 `render`가 map 전체로 쓰는 위치에서만 받으므로, bound map의 depth를 그것을 만난 level과 합치는 binding 규칙이 필요 없다(VAL-20). 그리고 각각 VAL-20을 만족하는 두 map의 `merge`도 VAL-20을 만족한다.

host interface, 즉 `bind`, `merge`, `prepare`, `render`와 host function의 인자(VAL-21)로는 호스트가 다른 방법으로 비어 있지 않은 bound map을 만들 수 없고, bound map이나 그 안의 list와 map을 바꿀 수 없다. 그래서 bound map은 바인딩이 검사한 값만 가진다. bound map type은 `bind`, `merge`, 그리고 `packages/template-compiler/interface.json`이 generated program을 위해 선언한 연산 외의 public 연산을 갖지 않는다. 구현이 다른 연산을 export하면 compiler interface check(RT-67)가 실패한다. 언어마다 다음 방법을 쓴다.

| 구현 | bound map type |
| --- | --- |
| TypeScript와 JavaScript | 상태를 private `#` field에 둔 class. package가 부르지 않은 constructor 호출은 실패하므로 JavaScript의 `new`와 subclass가 실패한다. package는 `#field in value`로 bound map을 식별하므로, class의 prototype만 상속한 object는 class 인스턴스(VAL-19)다 |
| PHP | private constructor와 private `__clone()`, 실패하는 `__unserialize()`를 가진 `final` class |
| PHP extension | PHP 코드가 instance로 만들거나 clone하거나 unserialize할 수 없는 extension의 final class |
| Go | `bind`와 `merge`가 값으로 돌려주는, unexported field를 가진 struct. zero value는 빈 bound map이고 검사하지 않은 값을 갖지 않는다. 그 nil pointer는 null이다(RT-4) |
| Rust | private field를 가진 struct |

reflection, `unsafe` 코드, class scope에 bind한 closure, runtime이 generated program을 위해 export하는 연산(RuntimeBindings, RenderFrame, RenderScope, render context, RT-67)은 host interface가 아니다. 그것으로 bound map을 바꾸는 호스트는 이 명세의 범위 밖이다. 이유: generated program은 runtime package 밖에 있고, 이 export된 연산으로 bound map을 읽는다.

Go bound map은 동시에 실행되는 render가 읽을 수 있다. Rust bound map은 `Send`가 아니다. template 값이 list와 map을 `Rc`로 공유하기 때문이다. 그래서 Rust 호스트는 data를 렌더하는 thread에서 binding한다.

bound map 안의 native object는 참조로 남고(VAL-18), 템플릿이 member를 읽을 때 binding된다(VAL-19). 호스트는 bound map이 없을 때처럼 그 object를 바꿀 수 있다.

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
