<!-- doc-id: packages-template-rust-readme -->
# polyspec-template

[한국어](README.ko.md).

Rust implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. The library is `polyspec_template`; the binary is `template`.

## Render

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

Assign data is a `serde_json::Value`; objects keep their document order and integer literals outside the safe range are rejected.

## API

| Item | Description |
| --- | --- |
| `parse(source, name, &ParseOptions)` | Parses one UTF-8 template into its AST with optional delimiters. |
| `decode_template(json)` | Reads the AST JSON text into the `Template` that `parse` returns, validated with the crate jsonschema against `contracts/schema/ast.schema.json`, which the crate embeds; an `AstDecodeError::Invalid` names in `path()` the JSON Pointer of the invalid node, and text that is not JSON is `AstDecodeError::Json` (AST-10). |
| `analyze(source, name, &ParseOptions)` | Parses like `parse` and also returns every accepted tag (`TagKind`, range, body range) and the EDT-8 class of every part of it (`SyntaxToken`), in byte offsets after a leading BOM. |
| `format(source, &FormatOptions)` | Formats the whitespace inside tags and the indentation of lines by HTML elements and template blocks. `FormatOptions` sets the indent unit (`IndentUnit`, two spaces by default; `None` keeps every line), `TemplateBlocks::Indent` or `Flat`, delimiters and a byte range. The result is the text only when it parses to the same AST; otherwise a `FormatError` with reason `parse`, `invariant` or `html`. |
| `AstProgram::new(EngineOptions)` | Creates an AST program with a loader, host functions, limits and delimiters, or returns an `ArgumentError` for a delimiter option that is not a delimiter pair. |
| `Engine::new(Program)` | Creates an engine that delegates to one AST or generated program. A generated program comes into the crate with `include!` (from `OUT_DIR` after `build.rs`, or from a committed file), never as a module file, so `cargo fmt` leaves its layout to the compiler and clippy lints it. |
| `Engine::render(target, assign, &RenderOptions)` | Renders a template name or a parsed template to a string. `assign` contains variables and `define` supplies template or HTML entries. |
| `bind(input)`, `merge(&first, &second)`, `Engine::render_bound`, `Engine::prepare_bound` | `bind` checks a `&serde_json::Value`, a `&OrderedMap` or a `&BoundMap` once and returns a `BoundMap`; `merge` combines two bound maps, and an entry of `second` replaces the entry of `first` with the same key. `render_bound` and `prepare_bound` take a bound map as assign, and `DefineData::Bound` gives one as definition data, without binding it again (VAL-22). A `BoundMap` is not `Send`. Errors have no template and no position (ERR-14). |
| `AstProgram::register(name, function)` | Registers a host function `Fn(&[Value], &FunctionContext) -> Result<Value, HostError>`. `Err("message".into())` fails the call with `E_RUNTIME_HOST_FUNCTION`; the returned value is checked like host data. A safe string argument arrives as `Value::Str` (VAL-21). |
| `AstProgram::render_values(target, OrderedMap, &RenderOptions)` | Renders a root map built from `Value`s, which may hold `Value::Object` native objects. Numbers, depth and safe strings are checked like JSON data. |
| `TemplateObject` | A native object: `member(key)` returns `Ok(Some(value))`, `Ok(None)` for no public field, or a `HostError`; `call(method, args)` returns `None` for no public method. |
| `Value::downcast_object::<T>()` | Returns the original `TemplateObject` of type `T` that a template passed to a host function, a class function or a method. |
| `internal_boundary` | Every public parse, prepare and render operation reports a panic as `E_INTERNAL` instead of unwinding into the host. |
| `MapLoader`, `FsLoader` | In-memory and filesystem loaders. `Loader::load` returns `Result<Option<Loaded>, String>`; `Err` fails the render with `E_LOAD_FAILED`, and `FsLoader` returns it for a regular file that cannot be read. |
| `parse_json`, `parse_json_bytes`, `read_json` | JSON parsing into template values or into a checked `serde_json::Value`. Numbers outside ±(2^53 − 1), unpaired surrogate escapes, nesting deeper than 64 levels and text that is not one JSON document (`E_DATA_INVALID_JSON`) fail with their data codes. |
| `TemplateError` | Error with `code`, `template`, `line`, `col`, `offset`, `end`, `message`. |
| `Value::text`, `Value::safe_text`, `Value::list`, `Value::map` | Constructors for text, safe text, list and map values. Lists and maps share storage when values are cloned. |
| `Value::Safe` | A string that the echo tag writes without escaping. |

## Command line

```sh
template parse [--root DIR] [--delimiters OC] FILE
template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
template tokens [--root DIR] [--delimiters OC] FILE
template format [--indent none|tab|N] [--delimiters OC] FILE
```

`parse` prints the AST JSON. `render` prints the output. `tokens` prints `[start, end, type]` for every token. `format` prints the formatted text, or exits with status 2 and prints `{reason, code, line, col, message}` on stderr. A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
cargo fmt --check
cargo clippy --locked --release -- -D warnings
cargo test --locked --features __test_support
```

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process. The Rust unit and parity targets enable `__test_support` for the native expression-vector bridge; release consumers use the default SDK, whose expression and source implementations are private.

Built-in function implementations and their registry are private implementation details. Generated programs use `RuntimeBindings`; host callbacks use `Env`, `FunctionContext` and `HostFunction` from the crate root.
