# polyspec-template

[English](README.md).

템플릿 언어의 Rust 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. 라이브러리는 `polyspec_template`, 바이너리는 `template`이다.

## 렌더

```rust
use polyspec_template::{DefineInput, Engine, EngineOptions, FsLoader, RenderOptions, RenderTarget, Value};

let mut engine = Engine::new(EngineOptions { loader: Some(Box::new(FsLoader::new("templates"))), ..Default::default() });
engine.register("greet", Box::new(|args, _| Ok(Value::text(format!("Hello, {}", args[0].as_text().unwrap_or(""))))))?;
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
| `Engine::new(EngineOptions)` | 로더, 호스트 함수, 제한, 구분자를 가진 엔진을 생성한다. |
| `Engine::render(target, assign, &RenderOptions)` | 템플릿 이름 또는 파싱된 템플릿을 문자열로 렌더한다. `assign`은 변수를 담고 `define`은 템플릿 또는 HTML 항목을 제공한다. |
| `Engine::register(name, function)` | 호스트 함수 `Fn(&[Value], &FunctionContext) -> Result<Value, String>`을 등록한다. |
| `MapLoader`, `FsLoader` | 메모리 로더와 파일시스템 로더. |
| `parse_json`, `parse_json_bytes` | 템플릿 값으로의 JSON 파싱. |
| `TemplateError` | `code`, `template`, `line`, `col`, `offset`, `end`, `message`를 가진 오류. |
| `Value::text`, `Value::safe_text`, `Value::list`, `Value::map` | text, safe text, list, map 값을 생성하는 함수. 값을 복제할 때 list와 map은 저장소를 공유한다. |
| `Value::Safe` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 개발

```sh
cargo fmt --check
cargo clippy --locked --release -- -D warnings
cargo test --locked
```

테스트는 `tests/`에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.
