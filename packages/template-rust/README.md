# polyspec-template

[한국어](README.ko.md).

Rust implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. The library is `polyspec_template`; the binary is `template`.

## Render

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

Assign data is a `serde_json::Value`; objects keep their document order and integer literals outside the safe range are rejected.

## API

| Item | Description |
| --- | --- |
| `parse(source, name, &ParseOptions)` | Parses one UTF-8 template into its AST with optional delimiters. |
| `Engine::new(EngineOptions)` | Creates an engine with a loader, host functions, limits and delimiters. |
| `Engine::render(target, assign, &RenderOptions)` | Renders a template name or a parsed template to a string. `assign` contains variables and `define` supplies template or HTML entries. |
| `Engine::register(name, function)` | Registers a host function `Fn(&[Value], &FunctionContext) -> Result<Value, String>`. |
| `MapLoader`, `FsLoader` | In-memory and filesystem loaders. |
| `parse_json`, `parse_json_bytes` | JSON parsing into template values. |
| `TemplateError` | Error with `code`, `template`, `line`, `col`, `offset`, `end`, `message`. |
| `Value::text`, `Value::safe_text`, `Value::list`, `Value::map` | Constructors for text, safe text, list and map values. Lists and maps share storage when values are cloned. |
| `Value::Safe` | A string that the echo tag writes without escaping. |

## Command line

```sh
template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
cargo fmt --check
cargo clippy --locked --release -- -D warnings
cargo test --locked
```

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process.
