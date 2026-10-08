<!-- doc-id: packages-template-rust-readme -->
<!-- source-sha256: e144f95f36243cb8c4a93017c655959b8fb87221b3ea7e8cedcc6f3f31287a91 -->
# polyspec-template

[English](README.md).

템플릿 언어의 Rust 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. 라이브러리는 `polyspec_template`, 바이너리는 `template`이다.

## 렌더

```rust
use polyspec_template::{AstProgram, DefineInput, Engine, EngineOptions, FsLoader, RenderOptions, RenderTarget, Value};

let mut program = AstProgram::new(EngineOptions { loader: Some(Box::new(FsLoader::new("templates"))), ..Default::default() })?;
program.register("greet", Box::new(|args, _| Ok(Value::text(format!("Hello, {}", args[0].as_text().unwrap_or(""))))))?;
let engine = Engine::new(program);
let assign = serde_json::json!({ "title": "Home" });
let mut options = RenderOptions::default();
options.define.insert("layout".to_string(), DefineInput { template: Some("layout.tpl".to_string()), ..Default::default() });
options.define.insert("content".to_string(), DefineInput { template: Some("pages/home.tpl".to_string()), ..Default::default() });
let html = engine.render(RenderTarget::Name("layout"), &assign, &options)?;
```

assign 데이터는 `serde_json::Value`다. 객체는 문서 순서를 유지하고, 안전 범위 밖의 정수 리터럴은 거부한다.

## API

| 항목 | 설명 |
| --- | --- |
| `parse(source, name, &ParseOptions)` | 선택적인 구분자로 UTF-8 템플릿 하나를 AST로 파싱한다. |
| `AstProgram::new(EngineOptions)` | 로더, 호스트 함수, 제한, 구분자를 가진 AST program을 생성한다. 구분자 쌍이 아닌 구분자 옵션에는 `ArgumentError`를 돌려준다. |
| `Engine::new(Program)` | AST 또는 generated program 하나에 위임하는 engine을 생성한다. |
| `Engine::render(target, assign, &RenderOptions)` | 템플릿 이름 또는 파싱된 템플릿을 문자열로 렌더한다. `assign`은 변수를 담고 `define`은 템플릿 또는 HTML 항목을 제공한다. |
| `bind(input)`, `merge(&first, &second)`, `Engine::render_bound`, `Engine::prepare_bound` | `bind`는 `&serde_json::Value`, `&OrderedMap`, `&BoundMap`을 한 번 검사하고 `BoundMap`을 반환한다. `merge`는 두 bound map을 합치며, `second`의 항목이 같은 key를 가진 `first`의 항목을 바꾼다. `render_bound`와 `prepare_bound`는 bound map을 assign으로 받고, `DefineData::Bound`는 그것을 정의 데이터로 준다. 둘 다 다시 binding하지 않는다(VAL-22). `BoundMap`은 `Send`가 아니다. 오류에는 template과 위치가 없다(ERR-14). |
| `AstProgram::register(name, function)` | 호스트 함수 `Fn(&[Value], &FunctionContext) -> Result<Value, HostError>`를 등록한다. `Err("message".into())`는 호출을 `E_RUNTIME_HOST_FUNCTION`으로 실패시키고, 반환값은 호스트 데이터와 같이 검사한다. safe 문자열 인자는 `Value::Str`로 도착한다(VAL-21). |
| `AstProgram::render_values(target, OrderedMap, &RenderOptions)` | `Value`로 만든 root map을 렌더한다. Map은 `Value::Object` native object를 담을 수 있다. 숫자, 깊이, safe 문자열은 JSON 데이터와 같이 검사한다. |
| `TemplateObject` | Native object. `member(key)`는 `Ok(Some(value))`, public field가 없으면 `Ok(None)`, 또는 `HostError`를 반환한다. `call(method, args)`는 public method가 없으면 `None`을 반환한다. |
| `Value::downcast_object::<T>()` | 템플릿이 호스트 함수, class 함수, method에 넘긴 `T` 타입의 원본 `TemplateObject`를 반환한다. |
| `internal_boundary` | 모든 공개 parse, prepare, render 연산은 panic을 호스트로 전파하지 않고 `E_INTERNAL`로 보고한다. |
| `MapLoader`, `FsLoader` | 메모리 로더와 파일시스템 로더. `Loader::load`는 `Result<Option<Loaded>, String>`을 반환한다. `Err`는 렌더를 `E_LOAD_FAILED`로 실패시키며, `FsLoader`는 읽을 수 없는 일반 파일에 대해 이를 반환한다. |
| `parse_json`, `parse_json_bytes`, `read_json` | 템플릿 값 또는 검사한 `serde_json::Value`로의 JSON 파싱. ±(2^53 − 1) 밖의 숫자, 짝이 없는 surrogate escape, 64단계보다 깊은 중첩, 하나의 JSON 문서가 아닌 텍스트(`E_DATA_INVALID_JSON`)는 각 데이터 코드로 실패한다. |
| `TemplateError` | `code`, `template`, `line`, `col`, `offset`, `end`, `message`를 가진 오류. |
| `Value::text`, `Value::safe_text`, `Value::list`, `Value::map` | text, safe text, list, map 값을 생성하는 함수. 값을 복제할 때 list와 map은 저장소를 공유한다. |
| `Value::Safe` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
template parse FILE [--root DIR] [--delimiters OC]
template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 개발

```sh
cargo fmt --check
cargo clippy --locked --release -- -D warnings
cargo test --locked
```

테스트는 `tests/`에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.
