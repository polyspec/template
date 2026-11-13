<!-- doc-id: docs-operations-conformance -->
<!-- source-sha256: f6243e57e1fd414c628867dcabc87cd2b582c382aaec52d90c2fcb0c0c148726 -->
# 적합성

[English](/operations/conformance).

적합성 스위트는 모든 구현이 `tests/cases/`의 케이스에 대해 같은 AST, 같은 출력, 같은 오류 필드를 만드는지 검증한다. 이행 기간(docs/spec/runtime.md#transition)에는 legacy 언어 패키지, legacy 런타임을 받는 TypeScript 패키지, compiler가 그것들을 위해 생성한 코드가 `legacy/tests/`를 실행한다. 이는 legacy 패키지가 옮겨질 때 통과하던 `tests/cases/`와 `tests/fixtures/`의 사본이며 기대 오류는 이전 형태 `{code, template, line, col}`이다. Rust crate는 `tests/`를 실행한다. 동작의 변경은 `tests/`만 바꾼다.


아래 규칙(CNF-n)은 conformance suite 자체의 규칙이다. case의 구조, 모든 구현이 suite에 제공하는 명령줄, 비교, runner를 정한다. 언어의 requirement가 아니다.

## 스위트 실행

```sh
make conformance
node tests/runner/conformance.mts --langs ts,go
node tests/runner/conformance.mts --case loop/meta-fields
```

`make conformance`는 모든 패키지를 빌드하고 모든 케이스를 실행하며, 없는 패키지는 실행을 실패시킨다. 러너는 구현 하나에서 케이스가 끝날 때마다 `<case> [<lang>] pass|fail (<ms> ms)`을 출력하고, 그 뒤 케이스와 구현마다 한 행인 요약 표를 출력하며, 비교가 실패하면 상태 1로 종료한다. 러너는 케이스 전에 각 구현의 CLI를 build한다(`tests/runner/drivers.mts`). binary가 있어도 더 오래된 source로 build되었을 수 있으므로 build하며, 입력이 바뀌지 않았으면 build는 아무것도 하지 않는다. runner는 Go와 Rust CLI를 실행하고 PHP extension을 `var/build`에서 로드하며, `scripts/publish-build.mts`는 build의 byte가 바뀔 때에만 그곳에 게시한다. cargo는 build할 때마다 `target/release`를 다시 link하고, go build는 새 파일을 쓰며, macOS는 새 실행 파일을 처음 실행할 때 검사한다. 부하가 큰 machine에서 이 검사는 Rust CLI에 29.8 s가 걸려 호출의 10 s 제한을 넘겼다. `make build-go`, `make build-rust`, `make build-php-ext`도 같은 파일에 게시한다. build는 시간 제한 없는 단계이고, 이 단계는 시작, build 출력, 경과 시간이 붙은 결과를 standard error에 출력하며 build가 0이 아닌 status로 종료하면 실패한다. CLI 호출마다 10 s timeout이 있다. `make delimiter-matrix`는 모든 유효한 ASCII 구분자 쌍과 따옴표 안 구분자 문자로 template을 모든 언어에서 render하고, 언어 하나에서 쌍이 끝날 때마다 `<pair> [<lang>] pass|fail (<ms> ms)`를 출력하며, 끝에 check 수를 출력한다.

`make conformance-generated-ts`, `make conformance-generated-go`, `make conformance-generated-rust`, `make conformance-generated-php`, `make conformance-generated-python`는 모든 케이스의 generated program을 실행한다. `--case <group>/<name>`이나 `--case <group>`으로 케이스를 고른다. 각 케이스는 시작과 결과를 경과 시간과 함께 출력하고 30 s의 자기 deadline을 가진다. Go와 Rust 러너는 케이스 test를 `node_modules/@polyspec/kit/scripts/kit/run-tests.mts`로 실행한다. Go 케이스는 package `case_<case id>`이고 Rust 케이스는 test `case_<case id>`이며, 문자와 숫자가 아닌 글자가 이어진 부분은 `_` 하나로 쓴다. PHP 러너는 `php -l`과 케이스 process를 deadline에서 멈춘다. Python 러너는 `python3 -m py_compile`과 케이스 process를 deadline에서 멈춘다. TypeScript 러너는 `tsc`를 시간 제한 없는 단계로 한 번 실행하여 시작, 실행 중 5 s마다 한 줄, 경과 시간이 붙은 결과를 출력하고, `tsc`가 0이 아닌 code로 종료하면 실패하며, 각 케이스를 worker에서 render한다.

## 케이스 추가

1. `tests/cases/<group>/<name>/`을 만들고 `input.tpl`, `case.json`(`requirements`와 `stage`), 필요하면 `data.json`, `define.json`, `env.json`, `options.json` 또는 추가 템플릿을 넣는다.
2. 명세에 따라 `expected.html` 또는 `expected.error.json`을 손으로 작성한다.
3. TypeScript 구현으로 `expected.ast.json`을 생성하고 검토한다:

```sh
node tests/runner/conformance.mts --langs ts --case <group>/<name> --update ast
node scripts/check-schema.mts
node scripts/check-rules.mts
```

4. 모든 구현에 대해 스위트를 실행한다.

`scripts/check-schema.mts`는 `input.tpl`이 파싱되는 케이스에 `expected.ast.json`이 없거나, `input.tpl`의 렉시컬 또는 파싱 오류를 기대하는 케이스에 그 파일이 있으면 실패한다(CNF-15). `make schema-check`와 `make docs-check`가 이를 실행하므로 `make check`도 실행한다.

`--update html`과 `--update error`는 TypeScript 구현의 결과로 기대 파일을 쓴다. 생성된 파일은 커밋 전에 명세와 대조해 검토한다.

## 표현식 픽스처 추가

`tests/fixtures/expr/cases.json`에 `name`, `expr`, `tokens`, `ast`, `cases`를 가진 항목이나 `name`, `expr`, `error`를 가진 항목을 추가한다. span은 `expr`의 시작부터 바이트를 센다. 모든 구현이 단위 테스트에서 이 파일을 로드한다.

## 픽스처 케이스

- **CNF-1** 케이스는 디렉터리 `tests/cases/<group>/<name>/`다. `<group>`과 `<name>`은 소문자, 숫자, `-`로 이루어진다.

- **CNF-2** 케이스 디렉터리의 파일:

| 파일 | 필수 | 내용 |
| --- | --- | --- |
| `input.tpl` | 예 | 진입 템플릿. 템플릿 이름은 `input.tpl`이다. |
| 그 외 `.tpl` 파일 | 아니오 | include와 block 태그가 참조하는 템플릿. 로더 루트는 케이스 디렉터리다. |
| `data.json` | 아니오 | assign 데이터. 기본값 `{}`. |
| `define.json` | 아니오 | 템플릿 define. 기본값 `{}`. 각 값은 문자열 경로, 선택 `"data"` 객체를 가진 `{"template": "path"}` 또는 `{"html": "string"}`이다. 경로는 케이스 디렉터리 기준이다. |
| `env.json` | 아니오 | 환경. 기본값 `{"timezone": "Z", "now": 0}`. |
| `options.json` | 아니오 | 엔진 옵션. 기본값 `{}`. `{"delimiters": ";;"}`는 구분자를 선택한다. |
| `case.json` | 예 | `{"requirements": ["LEX-3"], "stage": 1}`. `requirements`는 케이스가 시험하는 명세 requirement를 나열한다. `stage`는 렉시컬·문법·표현식 케이스가 1, 함수·데이터 모델·공백 케이스가 2, include·block·래퍼·구분자·오류 케이스가 3이다. |
| `expected.ast.json` | 예. 단 `expected.error.json`이 `input.tpl`의 렉시컬 또는 파싱 오류를 지정하면 제외 | `input.tpl`의 AST. include와 block은 전개하지 않는다. |
| `expected.html` | 둘 중 하나 | 정확한 렌더 출력. |
| `expected.error.json` | 둘 중 하나 | 기대 오류의 `{"raises": {"kind", "status", "category", "message", "properties": {"template", "line", "col"}}}`: kind(ERR-1), HTTP 상태 없음(`null`), `packages/rust/interface.json`의 오류 표에 있는 그 kind의 category, 메시지 없음(`null`, ERR-3), 그리고 ERR-3이 비교하는 template과 위치. |
| `expected.tokens.json` | `expected.ast.json`이 있을 때 | `input.tpl`의 토큰(FMT-1, FMT-2). `[start, end, type]`의 JSON 배열. |
| `expected.format.json` | `expected.ast.json`이 있을 때 | `{"indent": R, "keep": R}`. `input.tpl`을 기본 옵션(`indent`, 공백 두 개, `templateBlocks` `indent`)과 `indent: null`(`keep`)로 포맷한 결과다([포맷](/ko/spec/formatting)). `R`은 `{"text": "<포맷한 텍스트>"}` 또는 `{"error": {"reason", "code", "line", "col"}}`이다(FMT-14). |

- **CNF-15** `scripts/check-schema.mts`는 모든 케이스 디렉터리에서 `expected.ast.json`이 있는지 검사한다. 케이스에 `expected.ast.json`이 없고 그 `expected.error.json`이 `template`이 `input.tpl`인 `lex_*` 또는 `parse_*` 코드를 지정하지 않으면 실패하고, `expected.error.json`이 그런 오류를 지정하는데 `expected.ast.json`이 있어도 실패한다. `expected.ast.json`이 있는 케이스에 `expected.tokens.json`이나 `expected.format.json`이 없을 때, 그것이 없는 케이스에 있을 때, 또는 CNF-2의 내용을 갖지 않을 때도 실패한다. `make schema-check`와 `make docs-check`가 이를 실행하므로 파일이 없으면 전체 suite가 실패한다. 이유: CNF-9는 입력이 파싱되는 모든 케이스의 파싱, 토큰, 포맷 결과를 비교하며, 파일이 없는 케이스는 그렇지 않으면 그 비교 없이 통과한다.

- **CNF-16** `tests/fixtures/filesystem/cases.json`은 파일시스템 로더(RT-10)의 filesystem 케이스를 나열한다. checkout은 symbolic link와 hard link를 담지 않으므로 케이스 디렉터리는 이 케이스를 담을 수 없다. 각 케이스는 `name`, `requirements`, `files`(template 이름에서 그 텍스트로의 map, `input.tpl` 포함), 선택적 `symbolicLinks`와 `hardLinks`(이름에서 대상 이름으로의 map), 그리고 `html` 또는 `error`(`{code, template, line, col}`)를 가진 `expected`를 가진다. `tests/runner/conformance.mts`는 각 케이스의 tree를 시스템 임시 디렉터리의 한 디렉터리에 쓰고, 선택된 모든 구현의 `render --root <directory> input.tpl`을 케이스 `filesystem/<name>`으로 실행해 결과를 CNF-7과 CNF-8로 비교한다. `--case filesystem`이 이 케이스들을 선택한다.

- **CNF-19** `contracts/core-cases.json`은 Rust 코어와, binding이 `packages/rust/interface.json`에서 생성하는 바인딩의 계약 케이스를 담는다. 계약의 공개 member마다 그 member의 id를 이름으로 하는 group이 하나 있고, 계약의 `cases`가 member마다 그 group을 가리킨다. 케이스는 `id`, 그 케이스가 보이는 `rule`, parameter 이름으로 적은 member의 인자를 가지며, 호출의 `result`를 적거나 실패의 kind, status, category를 담은 `raises`를 적는다(ERR-1). 인스턴스인 receiver나 인자는 `{"new": <그것을 주는 member>, "receiver", "args", "then": [단계]}`이며, `then`의 각 단계는 인스턴스를 준비하는 호출이고 그 실패는 준비 실패로 케이스를 실패시킨다. host 코드의 로더는 callback 값 `{"callback": {"loader.load": [행]}}`이고 host 함수는 function 값 `{"function": [행]}`이다. 행은 `{"args", "result"}`이며, 다 쓰이지 않은 행 중 `args`가 호출의 인자와 같은 첫 행이 그 호출에 답하고, `"once": true`인 행은 호출 하나에만 답하며, 어느 행도 답하지 않는 호출은 케이스를 실패시킨다. `template_value`와 `json_value`는 `{"kind", "value"}`이고, map은 순서대로 적은 `[key, value]` 쌍이며 `json_value`의 수는 그 literal이다. `define`처럼 계약의 `map<T>` 타입의 값은 순서대로 적은 entry의 객체다. `{"host": "object"}`는 native object다(VAL-19). `source`는 그 텍스트이거나 `{"hex"}`이고, `path`는 케이스가 가진 디렉터리에 대한 상대 경로다. variant unit의 값은 객체이며, 그 tag key(unit의 `tag`를 snake_case로 적은 `type`)는 계약이 적은 그대로의 case `value`를 담고, 나머지 key는 snake_case 이름으로 적은 case의 field이며 각 field는 자기 타입의 형태를 따른다. `{"type": "Text", "value": "a ", "span": [0, 2]}`는 node이고, `{"type": "source", "bytes": {"hex": "780a"}, "version": "1"}`은 `loader.load`의 행이 주는 값이다. 기본값이 null인 `optional` 타입의 field는 생략할 수 있고 생략은 null이다. 그 밖의 모든 field는 적어야 하며, case의 field가 아닌 key는 케이스를 실패시킨다. record의 값은 snake_case 이름으로 적은 field의 객체이고, enum의 값은 그 variant의 `value`이며(`unary_op`의 `"!"`), tuple은 그 부분의 배열이고 `bytes`는 `{"hex"}`다. runner는 이런 값을 코어의 타입으로 읽고, result는 그 타입에서 모든 field를 적어 쓴다. result를 비교할 때는 기대값도 같은 방식으로 읽고 쓴 뒤 비교하므로, 생략된 field는 null과 같다. `after`는 호출이 돌려준 인스턴스를 호출 하나와 그 `result`로 관찰한다. 케이스가 생략한 option은 계약의 기본값을 가지며, 코어의 runner에서도 바인딩의 생성된 시험에서도 그렇다. `packages/rust/tests/contract_cases.rs`는 모든 케이스를 `make test-rust`의 시험 `<group>::<id>`로 코어에 실행하고, 케이스가 없는 group, `cases`의 어느 행도 가리키지 않는 group, 읽지 못하는 형식을 실패시키며, member의 케이스가 내는 모든 kind가 그 member의 `raises`에 있는지를 `raises::<member>`로 확인한다. kind `internal`에는 member의 케이스가 없다. 어떤 입력도 거기에 닿지 않기 때문이다. group `template_value`는 그 이름의 value alias의 케이스를 담고, `cases`의 행 하나가 `member` 대신 `alias`로 그것을 가리킨다. 케이스는 `{"id", "value", "raises"}`이고 `rule`과 `note`를 가질 수 있으며, 그 value는 바인딩이 언어의 값을 기술하는 대로 `value_in`으로 들어간다. 유한하지 않은 float는 `{"float": "nan" | "inf" | "-inf"}`, well-formed가 아닌 text는 `{"ill_formed": "<text>"}`, bytes는 `{"hex"}`, 값을 둘러싼 n개의 list는 `{"kind": "list", "repeat": n, "value"}`다. alias의 `in_raises`는 `value_in`이 돌려주는 kind인 data_number_range, data_number_not_finite, data_invalid_utf8, data_unsupported_type, data_depth를 정확히 적는다. alias를 받는 member는 자기 `raises`의 kind 외에 그 각각으로 실패하며, runner는 `in_raises`가 그 kind를 적고 각 kind에 케이스가 있는지를 `in_raises::template_value`로 확인한다. 이유: 케이스는 각 member가 입력에 대해 무엇을 돌려주는지를 적은 하나의 진술이고 코어와 생성된 모든 바인딩이 그것을 실행하므로, 바인딩이 코어와 달라지면 케이스가 실패한다. variant 값의 형태에 대한 이유: case의 value를 담은 tag key는 AST JSON(AST-7)의 형태이고, 생성된 바인딩이 variant의 class가 없는 언어에 variant를 주는 형태다. 그래서 하나의 text가 계약, AST JSON, 케이스에서 같은 case를 가리키고, 바인딩의 생성된 시험은 코어의 runner가 읽는 것과 같은 값을 읽는다. case 이름을 key 하나로 가진 객체는 runner만 읽던 형태다.

- **CNF-20** `packages/rust/interface.json`의 record가 `core_type`에 적은 코어의 struct는 정확히 그 record의 field를 가진다. 각 field는 `pub`이고 snake_case 이름이며, field의 계약 타입이 적는 Rust 타입이다. `bool`은 `bool`, `uint`는 `usize`, `u64`, `u32`, `u16`, `u8` 중 하나, `int`는 `isize`, `i64`, `i32`, `i16`, `i8` 중 하나, `int64`는 `i64`, `float`는 `f64`, `text`는 `String`, `bytes`는 `Vec<u8>`, `path`는 `PathBuf`, `list<T>`는 `Vec<T>`, `map<T>`는 `binding_core::OrderedMap<T>`, `optional<T>`는 `Option<T>`다. tuple은 그 부분의 Rust tuple이거나, 부분의 타입이 하나일 때는 배열 `[T; n]`이다. enum, record, variant, value alias는 그 `core_type`이 적은 타입이다. callback unit은 그 코어 trait의 `Box<dyn Trait + 'a>`이고, 그것을 담는 struct는 lifetime parameter `'a` 하나를 가진다. 기본값이 있고 타입이 `optional`이 아닌 field는 그 타입의 `Option<T>`이며, `None`은 `default_core`가 적은 값, `{empty}` 기본값의 빈 값, 또는 `{computed}` 기본값의 규칙이 적는 값이다. `optional` 타입의 field는 두 번째 `Option` 없이 그 타입의 `Option<T>`이므로, 생략된 field와 null은 같은 `None`이고, null은 기본값이 아닌 다른 값을 뜻하지 않는다. `tests/scripts/core-type.test.mts`는 모든 record의 field 구성과 각 field의 타입을 비교한다. 이유: 계약은 값의 타입을 적고 그것을 담는 Rust 타입은 적지 않으며, 생성된 crate는 record의 field로 struct literal을 쓰고 생략된 field에 `None`을 넘긴다(binding GN-6i, GN-6ac, GN-6aa). 다른 타입의 field, record에 없는 field, callback의 lifetime이 없는 struct는 거기서 compile되지 않고, 기본값이 아닌 뜻을 가진 `None`은 바인딩의 선언이 보이지 않는 값을 준다.

- **CNF-3** `scripts/check-rules.mts`는 케이스 디렉터리에 `case.json`이 없거나 `stage`가 1, 2, 3이 아니면 실패한다.

## 명령줄 계약

- **CNF-4** 모든 구현은 네 하위 명령을 가진 명령을 제공한다.

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

- **CNF-5** 구현별 명령:

| 구현 | 명령 |
| --- | --- |
| ts | `node legacy/packages/ts/bin/template.mjs`; `format`: `node packages/language/bin/template-language.mjs` |
| go | `legacy/packages/go/template` |
| rust | `target/release/template` |
| php | `php vendor/bin/template.php` |
| php-ext | `php -d extension=var/php-ext/polyspec_template.so vendor/bin/template.php` |
| python | `legacy/packages/python/.venv/bin/python -m polyspec.template.cli`(`make python-package`가 `legacy/packages/python`을 `legacy/packages/python/.venv`에 설치한다) |

TypeScript의 포매터는 `@polyspec/template`에 의존하는 패키지 `@polyspec/template-language`이므로, 그 명령 `template-language`가 `format`을 제공하고 명령 `template`이 나머지 하위 명령을 제공한다.

## 비교

- **CNF-6** AST 비교는 두 JSON 문서를 파싱해 재귀적으로 비교한다. 객체 키 순서는 의미가 없다. 숫자는 값으로 비교한다.

- **CNF-7** HTML 비교는 stdout의 바이트와 `expected.html`의 바이트를 비교한다.

- **CNF-8** 오류 비교는 stderr JSON의 `code`, `template`, `line`, `col`을 `expected.error.json`의 kind와 properties와 비교한다. legacy 구현의 코드 `E_<KIND>`는 그 kind로 비교한다(ERR-1). `expected.error.json`이 있는 케이스는 종료 상태가 2일 때만 통과한다.

- **CNF-17** 토큰 비교는 `tokens`의 stdout을 파싱하고, 종료 상태가 0이며 배열이 `expected.tokens.json`과 원소마다 같기를 요구한다.

- **CNF-18** 포맷 비교는 `format`을 기본 옵션으로 한 번, `--indent none`으로 한 번 실행하고, 각각을 `expected.format.json`의 `indent` 또는 `keep` 항목과 비교한다. `text`이면 종료 상태가 0이고 stdout의 바이트가 텍스트와 같아야 한다. `error`이면 종료 상태가 2이고 stderr JSON의 `reason`, `code`, `line`, `col`이 기대 필드와 같아야 한다. `message`는 비교하지 않는다.

- **CNF-9** `render` 결과가 CNF-7 또는 CNF-8을 만족하고, `expected.ast.json`이 있는 케이스에서는 `parse` 결과가 그것과 같고 `tokens`와 `format` 결과가 CNF-17과 CNF-18을 만족할 때 케이스가 그 구현에서 통과한다. 하위 명령 하나라도 없는 구현은 그 케이스에서 실패한다.

## 러너

- **CNF-10** `tests/runner/conformance.mts`는 케이스를 열거하고, 선택된 모든 구현을 실행하고, 구현 하나에서 케이스가 끝날 때마다 `<case> [<lang>] pass|fail (<ms> ms)`을 출력하고, 마지막 케이스 뒤에 케이스와 구현마다 한 행인 요약 표를 출력하고, 비교가 하나라도 실패하면 상태 1로 종료한다.

| 옵션 | 효과 |
| --- | --- |
| `--langs a,b` | 나열된 구현을 실행한다. 기본값: 명령이 존재하는 모든 구현. |
| `--case group/name` | 케이스 하나를 실행한다. |
| `--list` | 실행하지 않고 케이스 id와 건수를 출력한다. |
| `--update ast\|html\|error\|tokens\|format` | 지정한 종류의 기대 파일을 `ts` 구현의 결과로 쓴다. `tokens`와 `format`은 `expected.ast.json`이 있는 케이스의 파일을 쓴다. `ts`가 선택된 구현에 포함되어야 한다. |

- **CNF-11** 모든 구현은 공유 suite를 자기 native test로 실행한다: `tests/cases`의 적합성 케이스(unit `conformance`, native test가 AST와 렌더 결과를 비교한다), 그 케이스의 토큰(unit `tokens`, CNF-17), 그 포맷 결과(unit `formatting`, CNF-18), `tests/fixtures/expr/cases.json`의 표현식 vector다. 각 native test는 각 케이스를 그 runner의 이름으로 보고한다: Go는 subtest `TestX/<case>`, cargo는 test `<symbol>::<case>`, vitest는 top-level test `<case>`, PHPUnit은 binding method의 data set `"<case>"`, unittest는 test `<case>`다. PHP extension은 표현식 lexer와 evaluator를 노출하지 않으므로, 표현식 vector의 test는 각 표현식을 echo tag `{=<expr>}`로 parse하고 `{= json(<expr>) | raw}`로 평가하며, token vector는 비교하지 않는다.

## 표현식 픽스처

- **CNF-12** `tests/fixtures/expr/cases.json`은 표현식 케이스의 목록이다. 모든 구현은 자기 테스트 스위트에서 이 파일을 로드한다.

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

- **CNF-13** 토큰 타입:

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

- **CNF-14** 각 표현식 케이스에 대해 구현은 세 결과를 검사한다: 토큰 스트림이 `tokens`와 같고, 파싱된 AST가 `ast`와 같고, `cases`의 각 항목에 대해 `data`를 루트 데이터로 평가한 표현식의 값이 `value`와 같다. 값은 JSON으로 비교한다. safe 문자열은 일반 문자열로 비교한다. `error`가 있는 케이스는 파싱이 그 코드를 발생시키는지 검사한다.
