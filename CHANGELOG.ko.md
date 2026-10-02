# 변경 기록

- 포매터가 HTML 요소와 템플릿 블록의 중첩에 따라 줄을 들여쓰게 했다. `indent` 옵션이 단위를 정하고(기본값 공백 두 개, `null`은 들여쓰기 유지), `templateBlocks: 'flat'`이면 템플릿 블록은 단계를 더하지 않는다. `<pre>`, `<textarea>`, `<script>`, `<style>`, 주석, 태그 안의 줄은 들여쓰기를 유지하고, 짝이 맞지 않는 HTML 구조는 `reason: 'html'` 오류를 돌려준다. 안전 불변식은 줄 앞 공백과 탭을 제외하고 AST를 비교하며, 불변식 테스트는 저장소의 모든 템플릿을 들여쓰기 없이 한 번, 들여쓰기로 한 번 검사한다. `template-fmt`는 `--indent N|tab|keep`와 `--template-blocks indent|flat`를 받고, VS Code 확장은 편집기의 들여쓰기 단위와 설정 `polyspec-template.format.templateBlocks`를 쓴다.
- 템플릿의 모든 주석을 `Template.comments`에 나열했다(AST-9). 주석은 노드를 만들지 않았으므로, 도구는 parser에서 템플릿의 텍스트는 읽을 수 있었지만 주석은 읽을 수 없었다. 각 `Comment` 노드는 기호 `*`와 종결자 사이의 소스 텍스트를 `value`로, wrapper를 포함한 태그의 span을 `span`으로 가지며, block 본문 안의 주석도 소스 순서로 나열한다. TypeScript, Go, Rust, PHP parser와 PHP 확장이 목록을 만들고, Go와 Rust AST decoder는 이 필드를 요구하며, AST schema가 이를 정의하고, TypeScript와 Rust package는 `Comment` 타입을 export한다. 모든 expected AST가 이 필드를 가지며, 새 case `text/comment-list`와 `delimiters/comment-custom`이 값, span, wrapped 주석과 빈 주석, loop 본문의 주석, 사용자 구분자를 고정한다.
- `runtime-interface-check`와 `compiler-interface-check`가 실행하는 PHP 의존성을 설치하게 했다. 새 체크아웃에서는 `vendor/bin/phpunit`이 없어 `make check`가 그곳에서 실패했다. 실행 체크리스트에 2026-10-02의 완료 기준 증거를 기록했다.
- 색 테마와 관계없이 VS Code에서 템플릿 태그가 눈에 띄게 했다. 문법은 구분자와 기호에 HTML이 `<`와 `>`에 쓰는 `punctuation.definition.tag` 대신 `keyword.control` 스코프를, 블록 이름에 `entity.name.type`을 붙인다. 확장은 파서의 태그 범위로 주석을 뺀 모든 태그에 배경을 칠한다. 어두운 테마에서는 `#16351c`, 밝은 테마에서는 `#e3f6dd`인 진한 초록이며, 편집기 배경과 밝기가 다르면서 모든 문법 색을 읽을 수 있게 유지한다. 이를 위해 `templateStructure()`가 모든 태그 범위를 돌려준다.
- 타입이 있는 generated Go 값의 변환을 런타임으로 옮겼다. `value.Convert`는 `value.Source`의 template 값을 반환하고, generated record와 타입 있는 map이 이를 구현한다. generated Go 소스는 더 이상 `reflect`를 import하지 않는다. `typed-generator-compile-check`가 이를 금지한다. slice 안의 record, nil record, native object를 값 테스트로 고정했다.
- PHP 설치 프로젝트에서 namespace가 붙은 generated class를 생성하게 했다. 필수 PHP namespace 때문에 namespace 없는 클래스에 접근할 수 없었다.
- 브라우저 테스트 케이스의 정의와 환경을 명령줄 프로그램과 같이 template JSON 파서로 읽어, 잘못된 JSON 환경 케이스가 브라우저에서 `E_DATA_INVALID_JSON`을 보고하게 했다.
- `typed-generator-compile-check`의 Rust와 PHP 실행기가 현재 호스트 형식으로 정의를 넘기게 했다. Rust 실행기는 `defines_from_json`으로 정의를 읽고, PHP 실행기는 각 항목을 배열로 넘기며 namespace가 붙은 generated class를 생성한다.
- 현재 generated 소스로 `examples/site/index.html`을 다시 만들었다. 저장된 성능 측정 결과는 바꾸지 않았다. 부하 평균 20~30에서 새로 잰 값은 코드의 성능을 나타내지 않기 때문이다.
- `typed-generator-compile-check`, `install-check`, `test-browser`, `showcase-check`를 `make check`에 추가했다. 위의 결함들은 `make check`를 통과하고 릴리스 매트릭스에서 실패했다.

- 네 AST runtime에서 native assign object binding과 논리 class function 호출을 구현했다. 공통 runtime contract, Red/Green 테스트, generated backend 호출 생성을 추가했다.
- TypeScript, Go, Rust, PHP에서 216개 전체 generated conformance matrix를 통과시키고 네 언어 generated native object/class-call 실행 검사를 추가했다.
- 네 언어 generated backend에서 출력, member 누락, class function 누락, 인자 실패와 throw 오류를 native 호출 matrix로 완료했다.

- Composer lockfile을 선언된 최저 PHP 8.2 기준으로 해석하고, 오래되거나 platform이 어긋난 lock을 거부하는 정책 검사를 추가했다.
- generated-program 컴파일 게이트가 선언된 PHP 런타임 의존성을 직접 설치하도록 해 깨끗한 checkout에서도 독립 showcase와 문서 배포 검사가 실행되게 했다.
- 모든 한국어 문서 쌍을 한국어 탐색 메뉴와 `ko-KR` HTML 메타데이터를 가진 `/ko/` locale로 발행하고, locale 경로와 해석되지 않은 테마 보간을 검사하는 정적 사이트 회귀 게이트를 추가했다.
- Pages 구성, artifact 업로드, 배포 action을 현재 안정 major로 갱신했다.
- Go 패키지에 외부 모듈과 checksum 파일이 없으므로 CI의 Go 의존성 캐시를 끄고 잘못된 루트 모듈 탐색을 제거했다.
- 정적 Pages 발행을 전체 CI matrix 뒤로 옮기고 병렬 문서 workflow와 중복 문서·showcase 검사를 제거했다.

[English](CHANGELOG.md).

## 미발행

- 호스트 인자의 형태를 명세하고(VAL-21) 모든 구현을 이에 맞췄다. 호스트 함수, 논리 class 함수와 instance method는 자기 언어의 일반 값을 받는다. safe 문자열은 문자열, list는 새 list, map은 새 순서 보존 map(TypeScript `Map`, Go `*value.OrderedMap`, Rust `Value::Map`, 항목 순서의 PHP 배열), number는 PHP `float`, native object는 원본 객체다. PHP AST 런타임은 `MapValue`와 `SafeString` 객체를, PHP 확장은 배열과 문자열을 넘겼다. TypeScript, Go, Rust는 safe 문자열을 넘겼고, TypeScript와 Go는 템플릿 자신의 list와 map을 넘겨 호스트 함수가 템플릿이 나중에 읽는 값을 바꿀 수 있었다. Go는 nil을 받는 method 파라미터의 `null` 인자를 거부했고, PHP 확장은 map 키 `-0`을 정수 키 `0`으로 바꿨다.
- native object의 동등성을 명세했다(EXP-39). 두 native object는 같은 호스트 객체일 때 같고, native object의 순서 비교는 `E_RUNTIME_COMPARE`이다. TypeScript는 wrapper를 비교해 두 번 바인딩한 같은 인스턴스가 다르다고 했고, Go와 Rust는 같다고 보고하지 않았으며, PHP AST 런타임은 `E_INTERNAL`로 실패했고, PHP 확장은 PHP 객체를 바인딩할 때마다 새로 감쌌다. Rust native object의 동일성은 `TemplateObject::identity`가 보고하며 확장은 PHP 객체를 보고한다.
- 오류 코드 `E_LOAD_FAILED`(RT-9, RT-10, ERR-6, ERR-9)와 `E_DATA_INVALID_JSON`(VAL-12, ERR-10, CNF-4)을 추가했다. TypeScript와 PHP의 로더 예외는 바뀌지 않고 `render` 밖으로 나갔고, 존재하지만 읽을 수 없는 파일을 파일시스템 로더가 Go, Rust, PHP에서는 없는 파일로, TypeScript에서는 예외로 보고했다. Go `Loader.Load`는 이제 `(LoadResult, bool, error)`를, Rust `Loader::load`는 `Result<Option<Loaded>, String>`을 반환한다. 하나의 JSON 문서가 아닌 JSON 텍스트는 Go와 Rust 명령줄 프로그램에서 사용 오류, PHP 명령줄 프로그램에서 잡히지 않은 예외, PHP 확장에서 `E_DATA_UNSUPPORTED_TYPE`이었고, Go와 Rust는 앞선 문법 오류보다 뒤의 숫자나 깊이 오류를 보고했다. TypeScript와 PHP에서 `JsonSyntaxError`를 제거했다.
- 두 태그 시작에 대해 명세를 파서에 맞췄다. 모든 파서, 포매터, VS Code 문법이 이미 받던 대로 `{ :x = 1}`은 대입이고(LEX-6, GRM-1, GRM-5) `{@item = items}`는 loop 태그다(LEX-5). 새 적합성 케이스가 두 형태와 `{@media ...}` 텍스트를 고정한다.
- 호스트 값 fixture가 드러낸 generated backend 결함 두 개를 고쳤다. TypeScript backend는 값의 타입이 서로 다른 map literal을 컴파일하지 못했고, Go backend는 list literal 안의 list와 map 값을 함수에 null로 넘겼다(케이스 `expr/mixed-literal-values`). Rust backend는 빈 list literal에 쓰이지 않는 mutable 바인딩을 더 이상 생성하지 않는다.
- typed generated program이 runtime 연산에 canonical 값을 넘기게 했다(docs/spec/compiler.md). typed record는 typed list나 map 안에 있어도 함수 인자, 연산자 피연산자, echo에 선언된 필드의 map으로 도달한다. TypeScript와 PHP backend는 record 타입을 그대로 넘겨 record를 함수에 넘기는 렌더가 `E_INTERNAL`로 실패했고, Go backend는 record를 native object로 넘겼다. `make generated-native-check`는 새 fixture `tests/fixtures/typed-values`를 typed manifest로 모든 backend에서 컴파일하고 출력을 AST program과 비교한다.
- CNF-15의 AST 존재 검사를 mutation 테스트와 함께 `scripts/check-schema.mjs`에 추가해, `expected.ast.json`이 없는 케이스가 `make docs-check`와 `make check`를 실패시키게 했다.
- PHP 확장과 Rust showcase adapter를 rustfmt로 정리하고, adapter가 포함하는 generated 모듈에만 dead code를 허용했다. `make lint`는 확장과 adapter의 형식을 검사하고 adapter를 경고를 오류로 처리해 컴파일하며, `make test-ext`는 확장에 경고를 오류로 처리하는 clippy를 실행한다.
- 검증: `make check`가 통과했다(종료 상태 0). 다섯 구현에서 244개 케이스에 대한 AST 적합성 검사 1220개, TypeScript, Go, Rust, PHP 각각의 generated 케이스 244개, delimiter matrix 검사 3624개, generated native 호출·호스트 값·typed 값 검사, TypeScript 748개, PHP 608개, 확장 293개 테스트와 Go, Rust 스위트를 포함한다. `make dependency-audit`와 `make dependency-policy-check`가 통과했다. 새 언어 테스트는 모두 이전 코드에서 실패했다.
- eslint를 10.11.0, typescript-eslint를 8.71.0, `@types/node`를 26.6.3으로 올리고, `npm audit`가 보고한 권고를 고친 brace-expansion 5.0.12와 fast-uri 3.1.8로 올렸다. typescript-eslint 8.71.0이 `>=4.8.4 <6.1.0`을 받으므로 TypeScript는 6.0.3에 남고, esbuild는 `config/dependency-policy.json`에 기록한 대로 0.27.2에 남는다.
- `make conformance`, `make delimiter-matrix`, `make parity`가 모든 구현을 먼저 빌드하도록 했다. 이 타깃들은 Go와 Rust 명령줄 프로그램과 PHP 확장을 마지막 빌드 그대로 실행했기 때문에, 소스를 바꾼 뒤에도 오래된 바이너리를 검사했다. 실패 29건은 모두 오래된 빌드 때문이었고, 반대로 오래된 빌드가 실패를 감출 수도 있었다.
- 포매터 패키지 `@polyspec/template-format`을 추가했다. `format()`과 명령 `template-fmt`을 제공한다. 포매터는 `docs/operations/editor-tools.md`의 스타일로 태그 안의 공백을 정규화하고, 태그 밖의 텍스트, 주석, 지시문, 여러 줄 태그를 유지하며, 포맷한 AST가 span을 제외하고 소스 AST와 같을 때만 결과를 돌려준다. 명령은 파일과 디렉터리를 출력하거나 다시 쓰거나(`--write`) 검사하고(`--check`, 종료 상태 1), 표준 입력을 읽으며, 파싱되지 않는 파일을 위치와 함께 보고하고 종료 상태 2로 끝난다.
- `.tpl` 파일을 위한 VS Code 확장 `polyspec-template`을 추가했다. HTML을 포함하고 텍스트, 속성 값, CSS, JavaScript, HTML 주석에 템플릿 태그를 주입하는 TextMate 문법은 태그 종류마다, 표현식 토큰마다 scope를 준다. 언어 설정은 `{* *}` 주석과 구분자 괄호를 정의하고, 문서 포맷과 범위 포맷은 `@polyspec/template-format`을 호출한다. `.vsix`는 VS Code 1.138 이후의 Node.js 24 런타임용으로 포매터와 파서를 번들한다. VS Code는 Restricted Mode에서 이 선언이 없는 확장을 문법까지 비활성화하므로 확장은 신뢰하지 않은 작업 공간과 가상 작업 공간 지원을 선언한다. 통합 테스트는 `.vsix`를 VS Code 1.138.0에 설치하고 workspace trust를 켠 상태로 신뢰하지 않은 폴더를 열어 언어, 활성화, `_workbench.captureSyntaxTokens`로 속성 값 안의 태그 scope, `vscode.executeFormatDocumentProvider`로 포맷을 검사한다. `capabilities`를 지운 두 번째 실행은 VS Code가 확장을 비활성화하는지 요구한다.
- VS Code 확장에 파싱 진단과 태그 구조를 추가했다. `@polyspec/template-format`의 `templateStructure()`는 문자열 위치를 가진 파싱 오류, 또는 파서의 태그 범위에서 얻은 블록 구성을 돌려주며, 테스트는 모든 적합성 사례에서 구성을 AST span과 대조한다. 확장은 파싱 오류를 오류 코드와 함께 파서 위치에 게시하고, 한 구성의 태그를 강조하고, 여러 줄 구성을 접고, Go to Matching Template Tag(macOS `Cmd+Alt+\`, Windows와 Linux `Ctrl+Alt+\`)를 제공한다. 템플릿 분기를 가로지르는 HTML 요소 균형은 검사하지 않는다.
- Makefile 타겟 `build-format`, `test-format`, `format-check`, `format-external-check`, `install-cli`, `build-vscode`, `test-vscode`, `test-vscode-integration`, `vscode-package`, `vscode-install`을 추가하고, `test-format`, `format-check`, `test-vscode`, `test-vscode-integration`을 `make check`에 넣고, `template-format`과 `template-vscode`를 `contracts/features.json`에 등록했다. 컴파일러 digest에 `package-lock.json`이 포함되는 JavaScript generated artifact manifest를 갱신했다.
- 검증: `make check` 통과. 포매터, 불변식, 구조, CLI 테스트 583개, 문법 테스트 파일 5개, 확장 단위 테스트 12개, VS Code 1.138.0 통합 실행(신뢰하지 않은 작업 공간에서 설치한 확장으로 검사 12개 중 12개, `capabilities`를 지운 확장으로 검사 2개 중 2개)을 포함한다. `make format-external-check`가 파일 10개의 외부 템플릿 트리에서 통과했다.
- 내부 오류 `E_INTERNAL`을 추가했다(ERR-12, ERR-13). PHP 확장의 method handler는 PHP로 unwind할 수 없으므로 모든 Rust panic이 PHP 프로세스를 중단시켰다. 예를 들어 `date('2024-01-01T12:34:5é', 'Y')`와 유효한 UTF-8이 아닌 배열 키다. 이제 네 런타임, generated program, 확장의 모든 method에서 공개 parse, prepare, render 연산은 panic과 언어 런타임 오류를 `E_INTERNAL`로 보고한다. 자기 언어의 오류 방식으로 실패를 보고한 호스트 callback은 그대로 `E_RUNTIME_HOST_FUNCTION`이다.
- Rust 날짜 파서를 고쳤다. 시간 필드를 바이트로 잘라서 멀티바이트 문자가 그 안에서 끝나면 panic이 났다(케이스 `functions/date-multibyte-time-error`). Rust crate와 확장에서 텍스트를 바이트 인덱스로 자르는 곳을 모두 찾았으며, 문자를 가를 수 있는 다른 곳은 없었다. 날짜 offset 파서도 검사하는 slice를 쓴다.
- 호스트 바인딩의 숫자 규칙을 값에만 의존하게 했다(VAL-2). 크기가 2^53 − 1보다 큰 유한한 숫자는 정수, 실수, JSON 정수 리터럴, 지수가 있는 JSON 리터럴 어느 것이든 `E_DATA_NUMBER_RANGE`이다. `bind`, `parseJson`과 Go, Rust, PHP, 확장의 대응 함수가 같은 규칙을 적용한다. 케이스 `functions/json-escaping`은 `1e21`을 데이터 대신 템플릿 리터럴에서 읽는다.
- Map 키에 유효한 유니코드 텍스트를 요구했다(VAL-12~VAL-17). 유효한 UTF-8이 아닌 배열 키, 프로퍼티 이름, Go map 키, define id, 짝이 없는 surrogate를 가진 JavaScript 문자열과 키, surrogate를 짝 없이 남기는 JSON `\u` escape는 `E_DATA_INVALID_UTF8`이다. 템플릿 문자열 리터럴의 짝 없는 surrogate escape는 모든 파서에서 U+FFFD가 된다(EXP-3). TypeScript 파서는 surrogate를 그대로 두었다.
- 모든 템플릿 값에 중첩 깊이 제한 64를 두었다(VAL-20, `E_DATA_DEPTH`). 바인딩과 JSON 파싱은 65번째 단계에서 멈추므로 순환하는 호스트 구조와 매우 깊은 데이터가 더 이상 스택을 넘치게 하거나 메모리를 소진하지 않는다. 제한을 넘는 list 또는 map literal은 `E_RUNTIME_LIMIT`이다.
- Native object 접근을 정의하고 모든 구현을 맞췄다(VAL-18, VAL-19, EXP-19). 가시성은 호출자의 class scope가 아니라 선언에서 정해지고, `__get`과 `__call`은 참조하지 않으며, `o['name']`은 `o.name`과 같은 field를 읽는다. 바인딩할 수 없는 field나 결과는 그 표현식 위치에서 데이터 코드로 실패하고, 호스트 함수, class 함수, method에 넘긴 native object는 원본 호스트 객체로 도착한다(Rust는 `Value::downcast_object`). Closure와 리소스는 거부하고, `stdClass` 하위 클래스는 `instanceof`로 map이 되며, `JsonSerializable`을 먼저 적용하고, 호스트 코드의 예외 message를 보존한다. `TemplateObject::member`는 `Result`를 반환하고 Rust 호스트 함수는 `HostError`를 반환한다.
- Generated program을 정확하고 서로 분리되게 했다. 모든 backend가 정확한 문자열 literal을 기록하므로 제어 문자와 `$`가 AST program과 같이 출력된다(케이스 `text/control-characters`). PHP backend는 namespace를 요구하며(`--php-namespace`, `phpNamespace`) generated PHP program 두 개를 한 프로세스에서 load할 수 있다. Go와 Rust generated program에서 native object가 include, block 인자, define 데이터에 도달한다. Generated Rust는 JSON 없이 값을 변환한다. Loop나 branch에서 다른 type으로 assign한 local은 병합한 type을 가진다. Generated TypeScript, Go, PHP는 바인딩 실패를 template 오류로 보고한다.
- 검증: `make check`가 통과했다. 네 AST 런타임, 확장, 네 generated mode의 적합성 케이스 235개, generated native-call 검사, 확장 테스트를 포함한다. 새 언어별 테스트는 모두 이전 코드에서 실패했다. 새 확장 테스트는 PHP 프로세스를 중단시키거나 실패했고, 새 PHP 런타임 테스트는 숫자, 키, closure, 리소스, 깊이, message에서 실패했다.
- PHP 확장의 PHP 값 바인딩을 완성했다(VAL-14, RT-60). 확장은 PHP에서 빈 맵을 표현하는 유일한 방법인 빈 `stdClass`를 포함해 모든 PHP 객체를 거부했고, `registerClass`가 없었다. 이제 `stdClass`는 맵으로, `JsonSerializable` 객체는 그 값으로 바인딩하고, 그 밖의 객체는 공개 속성과 메서드가 보이는 인스턴스로 유지하며, 논리 클래스 함수를 등록한다. 렌더는 값을 JSON을 거치지 않고 엔진에 넘기므로 객체가 인스턴스를 유지한다.
- Rust 구현의 HTML 이스케이프를 수정했다. PHP 확장도 이 구현을 쓴다. 참조로 바꿀 첫 문자를 만난 뒤부터 텍스트를 바이트 단위로 복사했기 때문에 첫 다중 바이트 문자에서 panic했고, `<제목>` 같은 텍스트가 Rust CLI와 PHP 프로세스를 중단시켰다. 이제 바꾼 문자 사이의 텍스트를 통째로 복사한다. 적합성 사례 `echo/html-escape-multibyte`가 모든 언어에서 이 실패를 재현한다.
- 매니페스트가 선언한 언어 테스트 매트릭스를 추가해 TypeScript, Go, Rust, PHP의 AST와 generated mode가 같은 의미 범위를 검사하도록 강제했다. 언어 지원·테스트 경로·compiler mode 누락을 찾는 mutation 검사를 추가하고 기본 검사에 매트릭스를 포함했다.
- 구현된 멤버 호출과 논리 클래스 호출 문법에 맞게 표현식과 가이드 문서를 수정했다. 메서드 호출을 사용할 수 없거나 generated native 호출이 partial이라는 잘못된 설명을 제거했다.
- 함수 계약에 `object.method(args...)`와 `Class::function(args...)` 문법을 추가하고 native 인스턴스 binding·실행을 위한 Wave 8을 열었다. parser와 AST는 이 노드를 지원하지만 런타임 실행은 partial 상태다.
- `MemberCall`과 `ClassCall` 노드를 추가하고 TypeScript·Go·Rust·PHP 표현식 파서가 `object.method(args...)`와 `Class::function(args...)`를 같은 형태로 생성하게 했다. 실제 객체 바인딩과 실행은 다음 구현 단계까지 partial 상태다.
- 37개 canonical 함수의 인자 범위, 네 언어 AST·생성 레지스트리 일치와 225개 기존 호출 형태의 분류를 담은 기계 판독 함수 계약을 추가했다. 컴파일러 IR이 0개 인자 함수와 가변 인자 함수의 호출 개수를 lowering 단계에서 검사하도록 수정했다.

### 2026-09-11

- 개발 규칙, 최상위 문서, Makefile, 문서 검사기, 실행 체크리스트를 가진 저장소를 생성했다.
- 검증: `make docs-check` 통과. 아직 패키지가 없어 `make check`는 실행하지 않았다.
- 명세를 추가했다: 렉시컬 규칙, 태그 문법, 표현식, 데이터 모델, 함수, 런타임, JSON Schema를 포함한 AST, 오류, 적합성, 완전한 예제. 문서를 함께 검토했다: 루프 메타 노드 뒤에 접근자를 허용하고, 루프나 if-block 안의 `{:?}`는 `E_PARSE_ELSEIF_NOT_IN_IF`를 보고하며, 래퍼 태그(`"{{= x}}"`, `/* {{= x}} */`, `<!-- {{# id}} -->`)와 구분자 설정(엔진 옵션과 `{% delimiter ;;}` 지시문)을 추가했고, 태그 종료를 문법이 닫는 구분자를 받아들이는지로 정의했다.
- 적합성 러너, 일치 러너, 언어 드라이버, 스키마 검사기를 추가했다.
- 검증: `make docs-check`가 문서 쌍 19개로 통과. `node scripts/check-schema.mjs`가 픽스처 0건으로 통과.
- TypeScript 구현 `@polyspec/template`을 추가했다: 소스, 표현식 렉서와 파서, standalone 줄·래퍼 태그·구분자 지시문을 가진 템플릿 파서, 순서 보존 JSON 파서를 가진 값 모델, 내장 함수, 블록 레지스트리와 제한을 가진 렌더러, 메모리·파일시스템 로더, 렌더 전용 진입점, CLI, 단위 테스트, 브라우저 테스트. 나머지 `expected.ast.json` 파일을 TypeScript 파서로 생성하고 스키마로 검증했다.
- 태그 시작 규칙을 좁혔다: `/`는 닫는 구분자 앞에서만, `@`는 `name =` 앞에서만 태그를 시작한다. `{/* */}`, `{/re/}`, `{ @media }`는 텍스트다. 연산자 오류의 위치를 실패한 표현식의 시작으로 정의하고, list나 map 피연산자를 가진 `+`를 `E_RUNTIME_STRINGIFY`로 하고, 정수 범위 검사를 정수 리터럴과 정수 타입 호스트 값으로 한정했다.
- 같은 모듈 분할, 단위 테스트, 적합성·표현식 픽스처 테스트, CLI를 가진 Go 구현 `github.com/polyspec/template`과 Rust 크레이트 `polyspec-template`을 추가했다. Rust AST 출력에서 정수 값의 숫자 리터럴을 JSON 정수로 직렬화한다. GNU Make 3.81이 직접 실행하는 명령에 내보낸 PATH를 적용하지 않으므로 Makefile에서 `cargo`를 `CARGO` 변수로 바꿨다.
- 같은 모듈 분할, 단위 테스트, 적합성·표현식 픽스처 테스트, CLI를 가진 PHP 구현 `polyspec/template`을 추가했다. `vendor/bin/phpunit`이 테스트 506개 통과. `node tests/runner/conformance.mjs --langs ts,php`가 418건 중 418건 통과. `node tests/runner/parity.mjs --langs ts,php`가 분기 없음을 보고.
- 구현 4개 검증: `node tests/runner/conformance.mjs`가 케이스 209건에 대해 836건 중 836건 통과. `node tests/runner/parity.mjs`가 ts, go, rust, php 사이에 분기 없음을 보고.
- 검증: `npm test -w @polyspec/template -- --run`이 테스트 471개 통과. `node tests/runner/conformance.mjs --langs ts`가 케이스 209건 중 209건 통과. `make test-browser` 통과. `npm run lint`와 `npm run typecheck -w @polyspec/template` 통과. `make docs-check`가 문서 쌍 21개로 통과.
- Rust 구현을 최적화했다: 복제한 값이 list와 map 저장소를 공유하게 하고, HTML 이스케이프에서 변경되지 않는 텍스트를 빌려 쓰고, 바인딩한 map을 미리 할당하고, 함수 환경을 빌려 쓰고, AST 연산자를 타입으로 사용한다. 공유 값을 사용하도록 PHP 확장 변환을 갱신했다.
- 검증: `make doc-coverage` 통과. `make check`가 lint, 네 패키지 단위 테스트, 5개 구현의 210개 케이스에 대한 적합성 1050건 중 1050건을 통과했다. `make test-ext`가 PHP 확장을 빌드하고 적합성 210건 중 210건과 확장 테스트 235개를 통과했다. `make bench BENCH_ITERS=3000 BENCH_WARMUP=300`가 출력 동일성 검사를 통과하고 벤치마크 결과를 기록했다.
- 렌더 API에서 대입한 변수와 템플릿 define을 분리했다. 호스트 레지스트리, 픽스처 파일, CLI 옵션의 이름을 `blocks`에서 `define`으로 바꾸고, 문자열 템플릿 경로를 받고, `layout` 같은 target ID가 템플릿 define을 통해 해석되게 했다. 모든 구현, 브라우저·벤치마크 드라이버, 픽스처, 문서를 갱신했다.
- 검증: `npm test -w @polyspec/template -- --run`이 테스트 650개 통과했다. `vendor/bin/phpunit`이 테스트 510개 통과했다. `node tests/runner/conformance.mjs --langs ts,go,rust,php`가 211개 케이스 844건 중 844건 통과했다. `make test-browser` 통과. `make test-ext`가 적합성 211건 중 211건과 확장 테스트 236개를 통과했다. `make docs-check`가 문서 쌍 29개로 통과했다.
- 컨트롤러 형태의 레이아웃 페이지, define 데이터와 scope 우선순위, 미리 렌더한 HTML 슬롯, 비어 있는 define 분기의 네 가지 페이지 시나리오을 가진 실행 가능한 예제 사이트를 추가했다. 사이트는 ts, go, rust, php, php-ext의 렌더 HTML, 언어 간 해시, 반복 렌더 검사, 시나리오별 처리량을 기록한다.
- 검증: `make showcase`가 구현과 시나리오 20개 조합을 모두 비교하고 벤치마크 측정값 20개를 기록했다. `make showcase-check`가 브라우저 증명을 통과했다.
### 2026-09-12

- Rust generated template 전체에 하나의 가변 render scope를 전달했다. Include는 호출자와 assign을 공유하고 block은 격리된 scope를 만들며 loop 변수는 이전 binding을 복원하고 typed template 경계는 공통 runtime 값 모델로 값을 변환한다.
- PHP generated template 전체에도 하나의 가변 render scope를 전달하고 같은 include 공유, block 격리, loop binding 복원 규칙을 적용했다.
- PHP generated 전체 적합성 검사를 추가했다. Canonical case 211개가 모두 예상 진단 또는 정확한 HTML로 compile·render되며 source block 등록, 중첩 loop metadata, spread 오류, 일반 텍스트의 달러 기호가 공통 runtime 규칙을 사용한다.
- Go generated 전체 적합성 검사를 추가했다. Canonical case 211개가 모두 예상 진단 또는 정확한 HTML로 compile·render되며 generated definition 등록, include scope 공유, 중첩 loop metadata, 동적 spread, 잘못된 UTF-8 입력이 공통 runtime 규칙을 사용한다. 네 backend의 generated loop는 반복 불변값인 size와 마지막 index를 반복 전에 한 번 계산한다.
- Rust generated 전체 적합성 검사와 `conformance-all-modes` release 명령을 추가했다. Rust generated expression은 safe string, 동적 spread, 조건 분기, 중첩 loop metadata에서 runtime `Value` 모델을 유지하고 typed 변환은 assign, definition, template input 경계에서만 수행한다. 이 명령은 TypeScript, Go, Rust, PHP의 AST/generated cell 1,688개 전체를 통과한다.
- 완성된 제품 compiler artifact로 정적 showcase를 다시 생성했다. 정적 HTML 검사가 parser 기반 template token, output HTML 하이라이트, compiled/generated source의 크기가 제한된 양방향 스크롤, 모든 입력·template 보기와 React island 경계를 통과한다.
- 격리 package 설치 검증을 추가했다. npm tarball, local proxy를 통한 versioned Go module zip, 압축을 푼 Cargo `.crate`, Composer archive를 임시 설치 프로젝트에 설치하고 모든 언어의 AST와 generated program이 같은 177바이트 assign/define page를 생성하도록 요구한다.
- 진단용 mode 측정을 제품 artifact 벤치마크로 교체했다. 8개 언어·모드 행이 모두 같은 177바이트를 출력한 뒤에만 독립 표본 21개로 compiler, cold process, 전체 render, prepared render, process, RSS의 중앙값과 P95를 기록한다. 생성되는 문서 표와 정적 예제 페이지는 검증된 같은 결과를 읽는다.
- 생성 계약과 문서, package 단위, compiler 산출물, core mode cell 1,688개 전체, PHP 확장, 위치 복구와 mutation 회귀, 격리 package 설치와 browser 출력, 정적 HTML, 새 성능 smoke를 검사하는 7계층 상용 release matrix를 추가했다. 명세 규칙 254개 모두 fixture 또는 명시적인 비-fixture 근거를 가져야 하며 CI가 전체 gate를 실행한다.
- 격리된 clean-checkout release gate를 추가했다. PHP package target은 lock으로 고정한 test 의존성을 직접 설치하고, gate는 JavaScript 의존성을 설치한 뒤 분리된 임시 worktree에서 전체 matrix를 실행한다.
- 호환되는 최신 안정 의존성 정책과 기계적으로 검사하는 고정 사유·해제 조건을 정의했다. 호환되는 test·문서 의존성을 갱신하고 PHP test를 선언한 PHP 8.2 최저 버전에 맞췄으며 PHP 8.2와 현재 환경 CI cell, JavaScript·PHP 보안 권고 검사를 release 첫 계층에 추가했다. 검사한 의존성 graph에는 알려진 취약점이 없다.

- 네 런타임에서 컴파일 방식(`ast` 또는 `gen`), 컴파일 artifact 갱신(`dev`, `true` 또는 `false`), 최종 HTML 페이지 캐시 TTL(`null` 또는 `0`은 영구)을 분리했다. artifact 갱신과 페이지 캐시 만료 테스트를 추가했다.
- 별도 벤치마크 workspace를 다시 구성해 구현의 AST 행은 매 렌더마다 파싱하고 생성 코드 행은 생성된 호스트 언어 소스를 직접 호출하게 했다. 참조 행도 측정하는 모든 렌더마다 파싱 또는 컴파일하며, 측정 전에 모든 행이 동일한 323바이트 HTML과 SHA-256을 생성해야 한다.
- 검증: PHP 513개, TypeScript 652개, Go 패키지 테스트, Rust 패키지 테스트가 통과했다. 행마다 50회 실행한 벤치마크에서 출력 불일치가 없었고 결과는 벤치마크 workspace에 기록했다.

- Rust·Go·TypeScript·PHP 런타임에 준비된 렌더 계약을 추가했다. `prepare`가 assign과 define 데이터를 바인딩하고 파싱된 target을 한 번 해석하며 반복 `render` 호출은 그 상태를 재사용한다. 벤치마크 드라이버, 런타임 명세, 기능 상태와 정적 showcase 성능 설명을 갱신했다.
- 검증: Rust와 Go 패키지 검사가 통과했고 TypeScript 빌드와 PHP 문법 검사가 통과했다. 전체 언어 간 검증과 벤치마크 재실행은 이 변경을 완료로 표시하기 전에 남아 있다.


- 실제 Composer path 의존성의 PHP 검사인 `php-path-check.mjs`와 `php-runner.php`를 추가했다. 임시 프로젝트가 symlink 없이 `polyspec/template`을 설치하고 Composer로 로드한 뒤 `FilesystemLoader`로 플랫폼 스냅샷을 렌더한다.

- 모든 예제를 공통 템플릿, 목업 assign 데이터, define 레지스트리, `layout` 렌더 target으로 단순화했다. 사이트에서 템플릿과 목업 입력을 볼 수 있다. 벤치마크 P95 표기를 표본 평균의 백분위로 바로잡았다.
- 단순화 후 검증: `make showcase`가 구현·시나리오 25개 조합을 통과하고 벤치마크 표본 125개를 기록했다. `make showcase-check`가 원시 출력 비교와 공통 목업 입력·템플릿의 브라우저 테스트를 통과했고 `make docs-check`가 문서 쌍 30개로 통과했다.
- RT-43–RT-48에 언어 간 렌더 계약을 정의하고 Mermaid 도표, JSON 요청 형태, 어댑터 규칙을 추가했다. 모든 showcase `define.json` 항목을 object 형태로 통일하고 빌드 시 계약 검사를 추가했으며 Go, Rust, TypeScript, JavaScript 예제가 같은 시나리오 입력을 읽도록 갱신했다.
- `tools/showcase/adapters/interface.json`을 어댑터 타입, 필드, 소유 관계, 연산, 오류와 상태 전이의 원본으로 만들었다. TypeScript, JavaScript, Go, Rust, PHP에 대한 생성 선언부와 Mermaid 도표, 컴파일·reflection·런타임 계약 검사를 추가하고 모든 showcase 시나리오에서 실패 후 복구를 증명했다.
- 검증: `make check`, `make showcase`, `make showcase-check`, `make docs-check`가 통과했다. 계약 게이트는 211개 케이스의 적합성 1055건 중 1055건과 showcase 구현·시나리오 25개 조합 전체를 검증했다.
- 온라인 문서를 저장소 경로를 반영하는 정적 VitePress artifact로 구성하고 GitHub Pages 배포 workflow와 `make docs-static-check`을 추가했으며 발행 절차와 실행 체크리스트를 동기화했다.
- 공개된 VitePress 테마의 보간 문자열 노출을 수정하고 문서 색인 항목을 실제 링크로 바꾸었으며 모든 `.ko` 경로에 한글 sidebar를 지정해 언어 전환 후에도 한글 메뉴가 유지되게 했다.
- showcase 템플릿 등록을 식별자와 경로의 직접 대응으로 단순화하고 define 데이터나 완성된 HTML이 필요한 경우에만 객체를 유지했으며 예제 페이지에서 각 시나리오의 assign JSON과 템플릿을 기본으로 펼쳐 보이게 했다.

- TypeScript·Go·Rust·PHP에 동일한 `PageCache.getOrSet` miss/hit 계약을 추가했다. hit에서는 render callback을 호출하지 않고 저장된 HTML을 반환하며, miss에서는 한 번 호출하고 결과를 저장한다. 재생성 가능한 산출물을 dangling command continuation 없이 제거하도록 `make clean`도 수정했다.
- TypeScript·Go·Rust·PHP 생성 소스의 동등성을 강화했다. HTML escape 문자 다섯 개를 동일하게 처리하고 논리 연산자는 항상 boolean을 반환하며 빈 list와 map은 공통 진릿값 규칙을 따르게 했다. 지원하지 않는 generated 함수는 런타임 stub으로 남기지 않고 공통 IR에서 실패한다. 빌드 순서는 `tpl`에서 AST, typed host source로 이어지도록 강제하고 compiler 계약 도표에 source, manifest, typed program, 함수 signature를 포함했다.
- Generated mode 상태를 in progress로 바로잡았다. AST runtime은 211개 적합성 case를 통과하지만 generated 실행은 showcase 시나리오 5개로 제한되고 typed compiler는 `default`만 받으며 별도 showcase generator가 주입 callback을 제공한다. 구현을 계속하기 전에 v1 compiler 경계, build-time artifact 갱신, 완전한 내부 검증 gate를 정의했다.
- TypeScript, Go, Rust, PHP에서 `AstProgram`과 generated `Program` 구현을 위임형 `Engine` 뒤의 동등한 구현으로 구성했다. runtime engine의 compile mode 선택과 generated renderer callback을 제거하고 generated showcase artifact가 `Program`을 직접 구현하게 했다. 별도 generator를 제품 compiler로 교체하기 전까지 generated 적합성 범위는 showcase 시나리오 5개로 유지한다.
- 파서가 승인한 태그 범위와 표현식 lexer token 범위를 반환하는 분석 출력을 추가했다. 정적 예제 사이트는 이 범위로 템플릿 문법을 하이라이트하고 compiled artifact와 generated source를 양방향 스크롤 영역에 표시한다.
- 네 공개 runtime이 같은 `Engine`/`Program`/`AstProgram` 소유 구조를 제공하도록 구체적인 Go `AstProgram` 타입을 추가했다.
- compiler manifest에 runtime 선언 계약을 추가했다. interface gate는 TypeScript, Go, Rust 선언을 각 언어 parser로, PHP 선언을 Reflection으로 추출한 뒤 연산, 인자 수, 소유 관계, AST program 구조를 manifest와 비교한다.
- 중복된 showcase AST 디렉터리 네 벌을 시나리오별 canonical `compiled/ast` graph 하나로 교체했다. 제품 AST compiler는 source, type, contract digest를 기록하고 모든 파일 뒤에 manifest를 발행하며 실패한 빌드 뒤에도 이전 artifact를 보존하고 `false` 갱신 정책에서 템플릿 소스를 읽지 않고 배포 artifact를 검증한다.
- TypeScript, Go, Rust, PHP의 truthiness, 문자열 변환, escaping, 숫자 변환, 유한 산술 결과 검사, 동등성, 정렬, lookup, 반복 entry, 함수 호출, limit, 위치 오류를 `RuntimeBindings`로 통합했다. AST evaluator와 statement renderer가 이 경계를 사용하고 compiler interface gate가 runtime 연산 누락을 거부한다. TypeScript와 PHP의 표현식 깊이 검사는 고정값 대신 설정된 제한값을 사용한다.
- Typed IR이 모든 source span을 보존하고 명시적인 동적 member, index, spread, loop 연산과 built-in·host 함수 signature를 받도록 확장했다. 잘못된 symbol과 함수 구현 종류는 lowering 단계에서 계속 실패한다. 현재 compiler 계약 digest에 맞춰 canonical AST manifest를 갱신했다.
- 단일 파일에 섞여 있던 호스트 소스 생성기를 하나의 compiler 진입점과 독립적인 TypeScript·Go·Rust·PHP backend 모듈로 교체했다. 공통 IR 순회, 이름 변환, 재귀 타입 대응을 언어 emitter 밖으로 분리하고 artifact를 원자적으로 교체하며, 현재 생성 프로그램 20개가 계속 컴파일되고 바이트가 같은 HTML을 렌더하는지 확인했다.
- 실제 compiler 모듈에 manifest의 LanguageBackend 계약을 강제했다. 모든 backend가 동일한 네 연산으로 선언부, runtime 지원, template 함수, program entry를 제공하고 compiler가 그 순서를 소유한다. interface gate는 JavaScript backend 모듈 네 개를 파싱하며 mutation test로 backend 연산 하나가 빠지면 검증이 실패함을 증명한다.
- showcase adapter 계약을 compiler interface manifest에 병합했다. 계약 선언부, adapter 검사, Mermaid 생성, canonical artifact digest가 같은 설계 원본을 읽으며 interface gate는 중복 manifest가 다시 생기면 실패한다.
- 네 runtime에서 `RuntimeServices`와 AST template loading을 분리했다. Render context는 limit과 host 함수 조회에만 의존하고 AST statement renderer가 template loading을 명시적으로 소유한다. Generated program이 AST program에 의존하지 않고 `RuntimeBindings`를 사용할 수 있도록 공통 manifest와 선언 검사가 이 경계를 강제한다.
- Digest에 연결된 generated artifact manifest와 무결성 검사·원자 교체를 포함한 독립적인 `dev`, `true`, `false` 갱신 동작을 추가했다.
- Render frame의 canonical AST 소유를 제거하고 TypeScript, Go, Rust, PHP의 `RenderFrame`과 `RenderScope` 필드·연산을 통일했다.
- TypeScript, Go, Rust, PHP에서 구체적인 `RuntimeEnvironment`가 자원 제한과 host 함수를 공통으로 소유하게 했다. AST program은 runtime service를 이 환경에 위임하고 generated-program 계약도 같은 환경을 요구하며 parser와 Reflection 검사는 field, operation, signature 또는 소유 관계 이탈을 거부한다.
- 제품 compiler가 TypeScript, Go, Rust, PHP의 구체적인 `GeneratedProgram` 구현을 생성하게 했다. Package 단위 통합 검사는 현재 시나리오 5개를 모두 이 program으로 compile하고 실행해 바이트가 같은 HTML을 요구한다.
- Schema 3 AST와 generated artifact manifest에 compiler 구현 digest를 추가했다. `true` 갱신 정책은 parser나 backend 변경 뒤 artifact를 다시 만들고 `false`는 source, type, contract 또는 compiler 입력을 읽지 않고 배포 파일을 검증한다.
- Showcase 전용 renderer generator를 제품 compiler artifact로 교체했다. TypeScript, JavaScript, Go, Rust, PHP adapter는 시나리오별 `GeneratedProgram`을 선택하고 Go artifact는 분리된 package를 사용하며 JavaScript 배포 artifact는 TypeScript backend 출력에서 compile한다.
- Compiler IR에 명시적인 동적 root type 계약을 추가했다. 동적 root는 선언되지 않은 입력 이름을 optional runtime value로 받으면서 선언된 template input, record, definition, function signature는 유지하고, 고정 `Assign` root는 선언되지 않은 field를 계속 거부한다.
- Generated runtime 오류가 template source를 읽지 않고 정확한 원본 위치를 유지할 수 있도록 각 template의 source line byte index를 canonical artifact와 typed IR에 보존했다.
- 네 runtime의 unary와 eager binary 값 의미를 공통 `RuntimeBindings` 계약으로 옮겼다. AST evaluator에는 단축 평가 제어 흐름만 남기고 실제 연산을 위임해 generated backend가 산술·비교·membership 의미를 다시 정의하지 못하게 했다.
- TypeScript generated program을 package의 `RenderContext`와 `RuntimeBindings`에 연결했다. 직접 template 함수가 공통 값 연산, 함수 호출, source 위치, render chain, 반복 제한, UTF-8 output 제한을 사용하며 생성 검사가 중복 의미 helper를 거부한다.
