# 표현식

[English](/spec/expressions).

이 문서는 태그 안에서 사용하는 표현식 언어를 정의한다: 토큰, 문법, 우선순위, 모든 연산자의 평가, 경로 조회, 루프 메타 접근, 진릿값, 동등과 순서. 값 타입, 문자열화, 호스트 바인딩은 [데이터 모델](/ko/spec/data-model)에 정의한다. 함수는 [함수](/ko/spec/functions)에 정의한다. 오류 코드는 [오류](/ko/spec/errors)에 정의한다. 규칙 번호는 `EXP-n`이다.

## 토큰

**EXP-1** 표현식 렉서는 다음 표의 토큰을 생성한다. 공백(스페이스, 탭, 캐리지 리턴, 라인 피드)은 토큰을 구분하며, EXP-5의 인접 규칙을 제외하면 무시된다.

| 토큰 | 형태 | 비고 |
| --- | --- | --- |
| IDENT | `[A-Za-z_][A-Za-z0-9_]*` | `true`, `false`, `null`, `in`은 예약어이며 IDENT가 아니다 |
| NUMBER | `[0-9]+("."[0-9]+)?([eE][+-]?[0-9]+)?` | 선행 `.`, 16진 형태, `_` 구분자 없음 |
| STRING | `'...'` 또는 `"..."` | 두 따옴표는 같은 의미이며 보간은 없다 |
| DOT_IDENT | `.` IDENT | EXP-5 조건에서만 생성 |
| DOT_INDEX | `.` `[0-9]+` | EXP-5 조건에서만 생성 |
| IN | `in` | 비교 연산자 |
| 연산자 | `?? ?: === !== == != <= >= && \|\| ... => ? : \| + - * / % ! < > ( ) [ ] ,` | 최장 일치 |

**EXP-2** 표의 형태와 맞지 않는 NUMBER 토큰은 E_PARSE_INVALID_NUMBER이다. `1.`, `.5`, `1e`, `0x1F`, `1_000`이 여기에 해당한다. NUMBER 토큰의 값은 가장 가까운 IEEE 754 double이며 `1e3`의 값은 1000이다.

**EXP-3** STRING 토큰은 이스케이프 `\\`, `\'`, `\"`, `\n`, `\r`, `\t`, 그리고 16진 네 자리의 `\uXXXX`를 인식한다. UTF-16 서로게이트 쌍을 이루는 연속한 두 `\uXXXX`는 하나의 코드포인트가 된다. `\` 뒤의 다른 문자는 E_PARSE_INVALID_ESCAPE이다. 닫는 따옴표 전에 소스 끝에 도달하는 STRING 토큰은 여는 따옴표 위치에서 E_PARSE_UNTERMINATED_STRING이다. 문자열 뒤에 닫는 구분자가 없으면 태그 본문은 소스 끝까지 이어진다.

**EXP-4** `true`, `false`, `null` 토큰은 리터럴이다. 철자는 대소문자를 구분하며 `True`와 `NULL`은 IDENT 토큰이다.

**EXP-5** DOT_IDENT와 DOT_INDEX는 `.`이 왼쪽으로는 postfix 체인을 끝낼 수 있는 토큰(IDENT, `)`, `]`, DOT_IDENT, DOT_INDEX)에, 오른쪽으로는 식별자 또는 숫자에 공백 없이 바로 붙어 있을 때만 생성된다. 그 외 위치에서 숫자가 뒤따르는 `.`은 E_PARSE_INVALID_NUMBER(EXP-2)이고, 숫자가 뒤따르지 않는 `.`은 E_PARSE_UNEXPECTED_TOKEN이다. `a.0.b`는 IDENT `a`, DOT_INDEX `.0`, DOT_IDENT `.b`로 렉싱된다.

**EXP-6** 다음은 언어에 포함되지 않으며 등장하면 E_PARSE_UNEXPECTED_TOKEN이다: 값에 대한 메서드 호출, `->`, `::`, `\`, `new`, 타입 캐스트, `$`, 비트 연산자 `& ^ ~ << >>`, `{` `}` 맵 리터럴.

## 문법

**EXP-7** 문법은 다음 EBNF이다. 시작 기호는 `expression`이다. 따옴표 안의 터미널은 연산자 토큰이고 대문자 이름은 EXP-1의 토큰이다.

```ebnf
expression     = pipe ;
pipe           = ternary { "|" IDENT [ "(" [ args ] ")" ] } ;
ternary        = coalesce [ "?" ternary ":" ternary | "?:" ternary ] ;
coalesce       = or { "??" or } [ "??" ] ;
or             = and { "||" and } ;
and            = equality { "&&" equality } ;
equality       = comparison [ ( "==" | "!=" | "===" | "!==" ) comparison ] ;
comparison     = additive [ ( "<" | ">" | "<=" | ">=" | IN ) additive ] ;
additive       = multiplicative { ( "+" | "-" ) multiplicative } ;
multiplicative = unary { ( "*" | "/" | "%" ) unary } ;
unary          = ( "!" | "-" ) unary | postfix ;
postfix        = ( call | primary ) { DOT_IDENT [ "(" [ args ] ")" ] | "[" expression "]" } ;
call           = IDENT "(" [ args ] ")" ;
class-call     = IDENT "::" IDENT "(" [ args ] ")" ;
args           = expression { "," expression } [ "," ] ;
primary        = "null" | "true" | "false" | NUMBER | STRING | IDENT
               | "(" expression ")" | bracket ;
bracket        = "[" [ entry { "," entry } [ "," ] ] "]" ;
entry          = expression [ "=>" expression ] | "..." expression ;
```

**EXP-8** 문법이 받아들이지 않는 토큰 열은 어떤 생성 규칙도 이어갈 수 없는 첫 토큰에서 E_PARSE_UNEXPECTED_TOKEN이다.

**EXP-9** 우선순위(낮은 것부터)와 결합 방향:

| 단계 | 연산자 | 결합 |
| --- | --- | --- |
| 1 | `\|` 파이프 | 좌 |
| 2 | `? :`, `?:` | 우 |
| 3 | `??` | 우 |
| 4 | `\|\|` | 좌 |
| 5 | `&&` | 좌 |
| 6 | `==` `!=` `===` `!==` | 없음 |
| 7 | `<` `>` `<=` `>=` `in` | 없음 |
| 8 | `+` `-` | 좌 |
| 9 | `*` `/` `%` | 좌 |
| 10 | 단항 `!` `-` | 우 |
| 11 | postfix `.name` `.0` `[e]`와 `name(...)` | 좌 |

**EXP-10** 결합이 `없음`인 연산자는 괄호 없이 연쇄할 수 없다. `a == b == c`와 `a < b < c`는 두 번째 연산자에서 E_PARSE_UNEXPECTED_TOKEN이다.

**EXP-11** 독립 호출 `f(x)`는 이름으로 함수를 호출한다. 멤버 호출 `a.f(x)`는 assign 인스턴스 `a`에 선언된 메서드를 호출한다. 클래스 호출 `Order::f(x)`는 선언된 논리 클래스 함수를 호출한다. `(f)(x)`와 `f(x)(y)`는 계속 E_PARSE_UNEXPECTED_TOKEN이다. 파서는 `MemberCall`과 `ClassCall`을 생성하며, 실행하려면 해당 객체 메서드나 클래스 함수가 선언되어 있어야 한다.

**EXP-12** 파이프 단계 `left | f(a, b)`는 호출 `f(left, a, b)`와 같다. `left | f`는 `f(left)`와 같다. 파이프는 좌결합이다: `a | f | g(b)`는 `g(f(a), b)`이다. 파서는 호출 노드를 생성하며 파이프 노드는 존재하지 않는다.

**EXP-13** 파이프의 우선순위가 가장 낮다. `a ?? 'n/a' | upper`는 `upper(a ?? 'n/a')`이고 `c ? a : b | number`는 `number(c ? a : b)`이다.

**EXP-14** 오른쪽 피연산자가 없는 말미 `??`는 `?? null`과 같다. `x ??`는 `x ?? null`이다.

**EXP-15** `=>` 항목이 하나 이상 있는 대괄호 리터럴은 map 리터럴이고, `=>` 항목이 없는 대괄호 리터럴은 list 리터럴이다. `[]`는 빈 list이다. map 리터럴에서 키 표현식은 평가된 뒤 데이터 모델에 정의된 대로 문자열화된다. E_RUNTIME_STRINGIFY로 문자열화되는 키는 그 오류를 발생시킨다. 같은 키를 가진 나중 항목은 이전 항목의 값을 대체하고 이전 위치를 유지한다.

**EXP-16** list 리터럴의 spread 항목 `...e`는 `e`가 list로 평가되어야 하며 그 원소를 순서대로 삽입한다. map 리터럴에서는 map이어야 하며 EXP-15에 따라 항목을 순서대로 삽입한다. 그 외 값은 E_RUNTIME_TYPE이다.

## 변수와 조회

**EXP-17** `primary`의 IDENT는 변수 참조다. 현재 스코프에 바인딩되지 않은 변수는 `null`로 평가된다. 스코프 규칙은 [런타임](/ko/spec/runtime)에 정의한다.

**EXP-18** `a.name`, `a.0`, `a[e]`는 모두 `lookup(container, key)`를 평가하며 `container`는 왼쪽 값이다. DOT_IDENT의 키는 식별자 문자열이다. DOT_INDEX의 키는 숫자로서의 자릿수다. `[e]`의 키는 `e`의 값이다.

**EXP-19** `lookup(container, key)`는 다음을 반환한다:

| 컨테이너 | 키 | 결과 |
| --- | --- | --- |
| map | string | 그 키에 저장된 값, 없으면 `null` |
| map | 정수 값을 가진 number | 숫자를 문자열화한 키의 값, 없으면 `null` |
| list | `0 <= i < length`인 정수 값 `i`의 number | 인덱스 `i`의 원소 |
| list | `^(0\|[1-9][0-9]*)$`에 맞고 정수 값이 범위 안인 string | 그 인덱스의 원소 |
| 그 외 모든 조합 | 임의 | `null` |

마지막 행은 `null`, string, bool, number 컨테이너, 음수 인덱스, 범위 밖 인덱스, 소수 숫자를 포함한다. 조회는 오류를 발생시키지 않으며, 어떤 깊이에서든 없는 값은 `null`이다.

## 루프 메타

**EXP-20** postfix 체인이 IDENT와 그 뒤의 DOT_IDENT로 시작하고 그 DOT_IDENT의 식별자가 `index_`, `key_`, `value_`, `last_`, `first_`, `size_` 중 하나이면, 파서는 그 두 토큰에 대해 Var 노드와 Member 노드 대신 LoopMeta 노드 `{loop: IDENT, field}`를 생성한다. 이어지는 접근자는 LoopMeta 노드에 적용된다: `row.value_.name`은 object가 LoopMeta 노드인 Member 노드다. 체인 `row.x.index_`와 `row['index_']`는 일반 조회다.

**EXP-21** LoopMeta 노드는 변수 이름이 `loop`와 같은 가장 안쪽 루프에 대해 평가된다. 필드는 다음과 같다:

| 필드 | 값 |
| --- | --- |
| `index_` | 현재 원소의 위치, 0부터 시작 |
| `key_` | number인 list 인덱스, 또는 string인 map 키 |
| `value_` | 현재 원소 |
| `first_` | 첫 원소이면 `true`, 아니면 `false` |
| `last_` | 마지막 원소이면 `true`, 아니면 `false` |
| `size_` | 반복 대상의 원소 수 |

**EXP-22** 변수 이름이 `loop`인 루프에 둘러싸이지 않은 채 평가되는 LoopMeta 노드는 E_RUNTIME_UNKNOWN_LOOP이다.

## 연산자

**EXP-23** `to_number(v)`는 산술을 위해 값을 변환한다: `null`은 0; `true`는 1, `false`는 0; number는 그대로; string은 ASCII 공백(스페이스, 탭, 캐리지 리턴, 라인 피드)을 양끝에서 제거한 뒤 나머지가 `^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$`에 맞으면 가장 가까운 double로 변환하고 아니면 E_RUNTIME_TYPE; list와 map은 E_RUNTIME_TYPE이다.

**EXP-24** `+`: list나 map 피연산자는 E_RUNTIME_STRINGIFY이다. 그렇지 않고 한쪽 피연산자라도 string이면 결과는 데이터 모델에 정의된 `stringify(left)`와 `stringify(right)`의 결합이다. 어느 쪽도 string이 아니면 결과는 `to_number(left)`와 `to_number(right)`의 수치 합이다.

**EXP-25** `-`와 `*`: 두 피연산자의 `to_number`에 대한 수치 차와 곱이다.

**EXP-26** `/`: 두 피연산자의 `to_number`에 대한 수치 몫이다. 0인 제수는 E_RUNTIME_DIV_ZERO이다.

**EXP-27** `%`: 두 피연산자를 `to_number`로 변환하며 정수 값이어야 하고 아니면 E_RUNTIME_TYPE이다. 결과는 절단 나눗셈의 나머지이며 피제수의 부호를 가진다. 0인 제수는 E_RUNTIME_DIV_ZERO이다.

**EXP-28** 단항 `-`는 `to_number(operand)`의 부호를 반전한다. 단항 `!`는 피연산자가 falsy이면 `true`, 아니면 `false`를 반환한다.

**EXP-29** 유한하지 않은 산술 결과는 E_RUNTIME_TYPE이다.

**EXP-30** `&&`는 왼쪽 피연산자를 평가한다. falsy이면 결과는 `false`이고 오른쪽은 평가하지 않는다. 아니면 결과는 오른쪽 피연산자의 진릿값이다. `||`는 왼쪽 피연산자를 평가한다. truthy이면 결과는 `true`이고 오른쪽은 평가하지 않는다. 아니면 결과는 오른쪽 피연산자의 진릿값이다. 두 연산자 모두 boolean을 반환한다.

**EXP-31** `a ?? b`는 `a`가 `null`이 아니면 `a`를, 아니면 `b`를 반환한다. `b`는 필요할 때만 평가한다. `a ?: b`는 `a`가 truthy이면 `a`를, 아니면 `b`를 반환한다. `c ? a : b`는 `c`가 truthy이면 `a`를, 아니면 `b`를 반환한다. 선택된 분기만 평가한다.

**EXP-32** `left in right`: `right`가 list이면 어떤 원소가 `element == left`를 만족할 때 `true`이다. `right`가 map이면 `stringify(left)`가 map의 키일 때 `true`이다. `right`가 string이면 `stringify(left)`가 그 부분 문자열일 때 `true`이다. 그 외 `right`는 E_RUNTIME_TYPE이다.

## 진릿값

**EXP-33** falsy 값은 `null`, `false`, 숫자 0(-0 포함), 빈 string, 빈 list, 빈 map이다. 그 외 모든 값은 truthy이다. 문자열 `"0"`과 공백만 있는 문자열은 truthy이다.

## 동등과 순서

**EXP-34** 두 피연산자의 타입이 같은 `a == b`: 두 number는 수치로 비교한다. 두 string은 코드포인트 열로 비교한다. 두 boolean과 두 `null`은 동일성으로 비교한다. 두 list는 길이가 같고 같은 인덱스의 모든 원소 쌍이 `==`를 만족할 때 같다. 두 map은 키 집합이 같고 같은 키의 모든 값이 `==`를 만족할 때 같으며 항목 순서와 무관하다.

**EXP-35** number와 string의 `a == b`: string이 EXP-23의 변환 문법을 만족하면 수치로 비교하고, 아니면 결과는 `false`이다. 그 외 서로 다른 타입의 모든 쌍은 `false`이다. `null`은 `null`과만 같다.

**EXP-36** `a != b`는 `a == b`의 부정이다.

**EXP-37** `a === b`는 두 피연산자의 타입이 같고 EXP-34가 성립할 때만 `true`이다. number와 string은 엄격 동등이 될 수 없다. `a !== b`는 `a === b`의 부정이다.

**EXP-38** `<`, `>`, `<=`, `>=`는 두 number를 수치로, 두 string을 코드포인트 열로 비교한다. 그 외 타입 쌍은 E_RUNTIME_COMPARE이다.

## 예시

데이터: `{"a": 2, "s": "3", "t": "x", "items": [10, 20], "m": {"k": 1, "2": "two"}}`

| 표현식 | 결과 |
| --- | --- |
| `a + 1` | `3` |
| `a + s` | `"23"` |
| `s + 1` | `"31"` |
| `a * s` | `6` |
| `a + t` | `"2x"` |
| `a * t` | E_RUNTIME_TYPE |
| `a + items` | E_RUNTIME_STRINGIFY |
| `7 % 3` | `1` |
| `-7 % 3` | `-1` |
| `a / 0` | E_RUNTIME_DIV_ZERO |
| `items.1` | `20` |
| `items.5` | `null` |
| `items['1']` | `20` |
| `m.2` | `"two"` |
| `missing.deep.path` | `null` |
| `a == s` | `false` |
| `a == 2` | `true` |
| `s == 3` | `true` |
| `s === 3` | `false` |
| `null == ''` | `false` |
| `'10' < '9'` | `true` |
| `10 < '9'` | E_RUNTIME_COMPARE |
| `a && s` | `true` |
| `t ?? 'd'` | `"x"` |
| `missing ??` | `null` |
| `'' ?: 'd'` | `"d"` |
| `'0' ? 1 : 2` | `1` |
| `1 in items` | `false` |
| `10 in items` | `true` |
| `'k' in m` | `true` |
| `2 in m` | `true` |
| `[1, ...items]` | `[1, 10, 20]` |
| `['x' => 1, 'x' => 2]` | `{"x": 2}` |
| `a ?? 0 \| number(2)` | `"2.00"` |
| `a == 1 == true` | E_PARSE_UNEXPECTED_TOKEN |
| `a.f()` | E_PARSE_UNEXPECTED_TOKEN |
