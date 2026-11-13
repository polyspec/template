#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]
//! The contract cases of contracts/core-cases.json (binding design K-1, G-5), one trial per case, `<group>::<id>`, run
//! against the core. A case names its arguments by the parameter names of its member in packages/rust/interface.json; an
//! instance is `{"new", "receiver", "args", "then"}`, a callback `{"callback": {"<member>": [rows]}}`, a function
//! `{"function": [rows]}`, and a result is compared in the form of a case value. A form that this runner does not
//! read fails its case; no case is skipped.

mod common;

use common::{json_equal, kind_category, repo_root};
use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_template::{
    ArtifactRefresh, AstProgram, BoundMap, DefineData, DefineInput, EngineOptions, Env, FormatOptions, FsLoader, FunctionContext,
    HostError, HostFunction, IndentUnit, Limits, LoadError, Loaded, Loader, MapLoader, OrderedMap, ParseOptions, RenderError,
    RenderOptions, RenderTarget, SyntaxTag, SyntaxToken, Template, TemplateBlocks, TemplateError, TemplateObject, Value, analyze,
    analyze_prefix, bind, decode_template, encode_template, format, merge, parse, resolve_path,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

type Json = serde_json::Value;

/// The calls of a fixture that no row answers; a case fails when one is left after its call (P-3).
type Unexpected = Arc<Mutex<Vec<String>>>;

fn fail<T>(message: impl Into<String>) -> Result<T, Failed> {
    Err(Failed::from(message.into()))
}

fn text(value: &Json, what: &str) -> Result<String, Failed> {
    match value.as_str() {
        Some(text) => Ok(text.to_string()),
        None => fail(format!("{what} is no text: {value}")),
    }
}

fn uint(value: &Json, what: &str) -> Result<usize, Failed> {
    match value.as_u64().map(usize::try_from) {
        Some(Ok(number)) => Ok(number),
        _ => fail(format!("{what} is no unsigned integer: {value}")),
    }
}

/// The value of a key of a case or of a record; an absent key is None, which a default of the contract takes.
fn key<'a>(object: &'a Json, name: &str) -> Option<&'a Json> {
    object.as_object().and_then(|members| members.get(name))
}

fn required<'a>(object: &'a Json, name: &str) -> Result<&'a Json, Failed> {
    match key(object, name) {
        Some(value) => Ok(value),
        None => fail(format!("the key {name} is missing in {object}")),
    }
}

/// The bytes of a `source` value: its text, or `{"hex": ...}` for bytes that are no text (GN-13).
fn source_bytes(value: &Json) -> Result<Vec<u8>, Failed> {
    if let Some(text) = value.as_str() {
        return Ok(text.as_bytes().to_vec());
    }
    let hex = text(required(value, "hex")?, "hex")?;
    (0..hex.len())
        .step_by(2)
        .map(|at| match hex.get(at..at + 2).map(|pair| u8::from_str_radix(pair, 16)) {
            Some(Ok(byte)) => Ok(byte),
            _ => fail(format!("{hex} is no hex text")),
        })
        .collect()
}

/// A native object of a test (VAL-19): it has no member and no method, as an object that entered as a handle.
#[derive(Debug)]
struct Native;

impl TemplateObject for Native {
    fn member(&self, _key: &str) -> Result<Option<Value>, HostError> {
        Ok(None)
    }

    fn call(&self, _method: &str, _args: &[Value]) -> Option<Result<Value, HostError>> {
        None
    }
}

/// The template value of a case value `{"kind", "value"}`, or the native object of `{"host": "object"}`.
fn template_value(value: &Json) -> Result<Value, Failed> {
    if let Some(host) = key(value, "host") {
        return match host.as_str() {
            Some("object") => Ok(Value::Object(Arc::new(Native))),
            _ => fail(format!("the runner makes no language value {host}")),
        };
    }
    let kind = text(required(value, "kind")?, "kind")?;
    let content = key(value, "value");
    match (kind.as_str(), content) {
        ("null", None) => Ok(Value::Null),
        ("bool", Some(Json::Bool(flag))) => Ok(Value::Bool(*flag)),
        ("int" | "float", Some(Json::Number(number))) => match number.as_f64() {
            Some(number) => Ok(Value::Number(number)),
            None => fail(format!("{number} is no number")),
        },
        ("text", Some(Json::String(text))) => Ok(Value::Str(text.clone())),
        ("list", Some(Json::Array(items))) => Ok(Value::list(items.iter().map(template_value).collect::<Result<_, _>>()?)),
        ("map", Some(Json::Array(pairs))) => {
            let mut map = OrderedMap::new();
            for pair in pairs {
                map.insert(text(&pair[0], "a map key")?, template_value(&pair[1])?);
            }
            Ok(Value::map(map))
        }
        _ => fail(format!("{value} is no template value of a case")),
    }
}

/// The case value of a template value that leaves the core (VAL-23): a number is a float, a safe string a text.
fn case_value(value: &Value) -> Json {
    match value {
        Value::Null => serde_json::json!({"kind": "null"}),
        Value::Bool(flag) => serde_json::json!({"kind": "bool", "value": flag}),
        Value::Number(number) => serde_json::json!({"kind": "float", "value": number}),
        Value::Str(text) | Value::Safe(text) => serde_json::json!({"kind": "text", "value": text}),
        Value::List(items) => serde_json::json!({"kind": "list", "value": items.iter().map(case_value).collect::<Vec<_>>()}),
        Value::Map(map) => {
            let pairs: Vec<Json> = map.iter().map(|(key, value)| serde_json::json!([key, case_value(value)])).collect();
            serde_json::json!({"kind": "map", "value": pairs})
        }
        Value::Object(_) => serde_json::json!({"host": "object"}),
    }
}

/// The JSON text of a json_value of a case: `number` holds its literal, `map` its pairs in order (GN-13).
fn json_text(value: &Json) -> Result<String, Failed> {
    let kind = text(required(value, "kind")?, "kind")?;
    let content = key(value, "value");
    match (kind.as_str(), content) {
        ("null", None) => Ok("null".to_string()),
        ("bool", Some(Json::Bool(flag))) => Ok(flag.to_string()),
        ("number", Some(Json::String(literal))) => Ok(literal.clone()),
        ("text", Some(text @ Json::String(_))) => Ok(text.to_string()),
        ("list", Some(Json::Array(items))) => Ok(format!(
            "[{}]",
            items.iter().map(json_text).collect::<Result<Vec<_>, _>>()?.join(",")
        )),
        ("map", Some(Json::Array(pairs))) => {
            let mut members = Vec::new();
            for pair in pairs {
                members.push(format!("{}:{}", pair[0], json_text(&pair[1])?));
            }
            Ok(format!("{{{}}}", members.join(",")))
        }
        _ => fail(format!("{value} is no json_value of a case")),
    }
}

fn json_value(value: &Json) -> Result<polyspec_template::polyspec_json::Value, Failed> {
    use polyspec_template::polyspec_json::{ParseOptions, parse};
    let text = json_text(value)?;
    parse(text.as_bytes(), &ParseOptions::default()).map_err(|error| Failed::from(format!("the json_value {text}: {error}")))
}

/// The canonical AST JSON (AST-7) of a case value: a variant `{"<tag>": {fields}}` is `{"type": "<tag>", fields}`.
fn canonical(value: &Json) -> Json {
    match value {
        Json::Array(items) => Json::Array(items.iter().map(canonical).collect()),
        Json::Object(members) => {
            let variant = members
                .iter()
                .next()
                .filter(|(tag, fields)| members.len() == 1 && tag.starts_with(char::is_uppercase) && fields.is_object());
            let (tag, fields) = match variant {
                Some((tag, Json::Object(fields))) => (tag.as_str(), fields),
                _ => ("Template", members),
            };
            let mut object = serde_json::Map::new();
            object.insert("type".to_string(), Json::String(tag.to_string()));
            for (name, field) in fields {
                object.insert(name.clone(), canonical(field));
            }
            Json::Object(object)
        }
        other => other.clone(),
    }
}

/// The case value of a canonical AST JSON value, the reverse of [`canonical`]. A literal holds a variant of the
/// contract that the runner does not write, so a result with a literal fails its case.
fn case_ast(value: &Json) -> Result<Json, Failed> {
    match value {
        Json::Array(items) => Ok(Json::Array(items.iter().map(case_ast).collect::<Result<_, _>>()?)),
        Json::Object(members) => {
            let tag = text(required(value, "type")?, "type")?;
            if tag == "Literal" {
                return fail("the runner writes no literal of an AST result");
            }
            let mut fields = serde_json::Map::new();
            for (name, field) in members {
                if name != "type" {
                    fields.insert(name.clone(), case_ast(field)?);
                }
            }
            if tag == "Template" {
                return Ok(Json::Object(fields));
            }
            Ok(serde_json::json!({ tag: fields }))
        }
        other => Ok(other.clone()),
    }
}

fn template_of(value: &Json) -> Result<Template, Failed> {
    decode_template(&canonical(value).to_string()).map_err(|error| Failed::from(format!("the template of the case: {error}")))
}

fn case_template(template: &Template) -> Result<Json, Failed> {
    case_ast(&common::ast_value(template))
}

fn case_tags(tags: &[SyntaxTag]) -> Json {
    tags.iter()
        .map(|tag| {
            serde_json::json!({"start": tag.start, "end": tag.end, "echo": tag.echo, "kind": tag.kind.as_str(),
                "body_start": tag.body_start, "body_end": tag.body_end})
        })
        .collect()
}

fn case_tokens(tokens: &[SyntaxToken]) -> Json {
    tokens
        .iter()
        .map(|token| serde_json::json!({"start": token.start, "end": token.end, "kind": token.kind.as_str()}))
        .collect()
}

/// One row of a callback or function fixture (c6 2.1).
struct Row {
    args: Json,
    result: Json,
    once: bool,
    used: bool,
}

/// The rows of a fixture: the first unused row whose `args` equal the arguments answers a call, and a call that no row
/// answers is recorded (c6 2.2).
struct Rows {
    name: String,
    rows: Mutex<Vec<Row>>,
    unexpected: Unexpected,
}

impl Rows {
    fn new(name: &str, rows: &Json, unexpected: &Unexpected) -> Result<Rows, Failed> {
        let Some(list) = rows.as_array() else {
            return fail(format!("the rows of {name} are no list: {rows}"));
        };
        let mut parsed = Vec::new();
        for row in list {
            if key(row, "raise").is_some() || key(row, "async").is_some() {
                return fail(format!("the runner reads no raise and no async row: {row}"));
            }
            parsed.push(Row {
                args: required(row, "args")?.clone(),
                result: match key(row, "result") {
                    Some(result) => result.clone(),
                    None => Json::Null,
                },
                once: key(row, "once") == Some(&Json::Bool(true)),
                used: false,
            });
        }
        Ok(Rows {
            name: name.to_string(),
            rows: Mutex::new(parsed),
            unexpected: Arc::clone(unexpected),
        })
    }

    fn answer(&self, args: &Json) -> Result<Json, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = self.rows.lock().expect("the rows of a fixture");
        for row in rows.iter_mut() {
            if !row.used && json_equal(&row.args, args) {
                row.used = row.once;
                return Ok(row.result.clone());
            }
        }
        let call = format!("{}({args})", self.name);
        self.unexpected.lock().expect("the unexpected calls").push(call.clone());
        Err(format!("UnexpectedCall: {call}").into())
    }
}

/// A loader of host code as a callback fixture of `loader.load`.
struct FixtureLoader(Rows);

impl Loader for FixtureLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, LoadError> {
        let result = self.0.answer(&serde_json::json!({"name": name})).map_err(LoadError::Callback)?;
        if result.is_null() {
            return Ok(None);
        }
        let loaded = (|| -> Result<Loaded, Failed> {
            if let Some(source) = key(&result, "source") {
                return Ok(Loaded::Source {
                    bytes: source_bytes(required(source, "source")?)?,
                    version: text(required(source, "version")?, "version")?,
                });
            }
            let ast = required(&result, "ast")?;
            Ok(Loaded::Ast {
                ast: template_of(required(ast, "ast")?)?,
                version: text(required(ast, "version")?, "version")?,
                lines: None,
            })
        })();
        match loaded {
            Ok(loaded) => Ok(Some(loaded)),
            Err(error) => Err(LoadError::Callback(format!("the row of loader.load: {error:?}").into())),
        }
    }
}

fn host_function(rows: &Json, unexpected: &Unexpected) -> Result<HostFunction, Failed> {
    let rows = Rows::new("function", required(rows, "function")?, unexpected)?;
    Ok(Box::new(move |args: &[Value], context: &FunctionContext<'_>| {
        let list: Vec<Json> = args.iter().map(case_value).collect();
        let call = serde_json::json!({"0": list, "1": {"timezone": context.env.timezone, "now": context.env.now}});
        let result = rows.answer(&call).map_err(HostError::Callback)?;
        template_value(&result).map_err(|error| HostError::Callback(format!("the row of the function: {error:?}").into()))
    }))
}

/// What a case makes while it runs: the directory of its `path` values and the calls that no fixture row answers.
struct Run {
    directory: PathBuf,
    unexpected: Unexpected,
}

static RUNS: AtomicUsize = AtomicUsize::new(0);

impl Run {
    fn new() -> Result<Run, Failed> {
        let directory = std::env::temp_dir().join(format!(
            "polyspec-template-contract-cases-{}-{}",
            std::process::id(),
            RUNS.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).map_err(|error| Failed::from(format!("{}: {error}", directory.display())))?;
        Ok(Run {
            directory,
            unexpected: Arc::new(Mutex::new(Vec::new())),
        })
    }

    /// A `path` value: a relative path inside the directory of the case (c6 1.5).
    fn path(&self, value: &Json) -> Result<PathBuf, Failed> {
        let path = text(value, "a path")?;
        if path.starts_with('/') || path.split('/').any(|part| part == "..") {
            return fail(format!("the path {path} leaves the directory of the case"));
        }
        Ok(self.directory.join(path))
    }

    fn loader(&self, value: &Json) -> Result<Box<dyn Loader>, Failed> {
        if let Some(callback) = key(value, "callback") {
            return Ok(Box::new(FixtureLoader(Rows::new(
                "loader.load",
                required(callback, "loader.load")?,
                &self.unexpected,
            )?)));
        }
        match text(required(value, "new")?, "new")?.as_str() {
            "fs_loader.new" => Ok(Box::new(FsLoader::new(self.path(required(required(value, "args")?, "root")?)?))),
            "map_loader.new" => Ok(Box::new(self.map_loader(value)?)),
            other => fail(format!("{other} makes no loader")),
        }
    }

    fn map_loader(&self, value: &Json) -> Result<MapLoader, Failed> {
        let mut loader = MapLoader::new();
        for step in steps(value) {
            let args = required(step, "args")?;
            match text(required(step, "call")?, "call")?.as_str() {
                "map_loader.set" => loader.set(&text(required(args, "name")?, "name")?, &text(required(args, "source")?, "source")?),
                "map_loader.set_ast" => loader
                    .set_ast(&text(required(args, "path")?, "path")?, template_of(required(args, "ast")?)?)
                    .map_err(|error| Failed::from(format!("the preparation failed: {error}")))?,
                other => return fail(format!("the runner prepares a map loader with no step {other}")),
            }
        }
        Ok(loader)
    }

    fn engine_options(&self, value: Option<&Json>) -> Result<EngineOptions, Failed> {
        let mut options = EngineOptions {
            artifact_refresh: ArtifactRefresh::Dev,
            ..EngineOptions::default()
        };
        let Some(value) = value else {
            return Ok(options);
        };
        if let Some(loader) = key(value, "loader").filter(|loader| !loader.is_null()) {
            options.loader = Some(self.loader(loader)?);
        }
        if let Some(limits) = key(value, "limits").filter(|limits| !limits.is_null()) {
            options.limits = Some(Limits {
                iterations: uint(required(limits, "iterations")?, "iterations")?,
                depth: uint(required(limits, "depth")?, "depth")?,
                output_bytes: uint(required(limits, "output_bytes")?, "output_bytes")?,
                expression_depth: uint(required(limits, "expression_depth")?, "expression_depth")?,
            });
        }
        if let Some(delimiters) = key(value, "delimiters").filter(|delimiters| !delimiters.is_null()) {
            options.delimiters = Some(text(delimiters, "delimiters")?);
        }
        if let Some(refresh) = key(value, "artifact_refresh") {
            options.artifact_refresh = match text(refresh, "artifact_refresh")?.as_str() {
                "dev" => ArtifactRefresh::Dev,
                "true" => ArtifactRefresh::True,
                "false" => ArtifactRefresh::False,
                other => return fail(format!("{other} is no artifact_refresh")),
            };
        }
        Ok(options)
    }

    /// The engine of an instance value `{"new": "engine.new", "args", "then"}`; a step that fails is a failed
    /// preparation, never the expected failure of the case (c6 1.1).
    fn engine(&self, value: &Json) -> Result<AstProgram, Failed> {
        if key(value, "new") != Some(&Json::String("engine.new".to_string())) {
            return fail(format!("{value} makes no engine"));
        }
        let options = self.engine_options(key(value, "args").and_then(|args| key(args, "options")))?;
        let mut engine = AstProgram::new(options).map_err(|error| Failed::from(format!("the preparation failed: {error}")))?;
        for step in steps(value) {
            let args = required(step, "args")?;
            let function = host_function(required(args, "host_function")?, &self.unexpected)?;
            match text(required(step, "call")?, "call")?.as_str() {
                "engine.register" => engine.register(&text(required(args, "name")?, "name")?, function),
                "engine.register_class" => engine.register_class(
                    &text(required(args, "class_name")?, "class_name")?,
                    &text(required(args, "method")?, "method")?,
                    function,
                ),
                other => return fail(format!("the runner prepares an engine with no step {other}")),
            }
            .map_err(|error| Failed::from(format!("the preparation failed: {error}")))?;
        }
        Ok(engine)
    }

    /// The bound map of an instance value of `bind` or `merge`.
    fn bound(&self, value: &Json) -> Result<BoundMap, Failed> {
        let args = required(value, "args")?;
        match text(required(value, "new")?, "new")?.as_str() {
            "bind" => {
                bind(&template_value(required(args, "value")?)?).map_err(|error| Failed::from(format!("the preparation failed: {error}")))
            }
            "merge" => Ok(merge(
                &self.bound(required(args, "first")?)?,
                &self.bound(required(args, "second")?)?,
            )),
            other => fail(format!("{other} makes no bound map")),
        }
    }

    fn render_options(&self, case: &Json) -> Result<RenderOptions, Failed> {
        let mut options = RenderOptions::default();
        let Some(value) = key(case, "options") else {
            return Ok(options);
        };
        if let Some(define) = key(value, "define") {
            let Some(pairs) = define.as_array() else {
                return fail(format!("define is no list of pairs: {define}"));
            };
            for pair in pairs {
                let entry = &pair[1];
                let field = |name: &str| match key(entry, name).filter(|field| !field.is_null()) {
                    Some(field) => text(field, name).map(Some),
                    None => Ok(None),
                };
                let data = match key(entry, "data").filter(|data| !data.is_null()) {
                    Some(data) => Some(DefineData::Value(template_value(data)?)),
                    None => None,
                };
                options.define.insert(
                    text(&pair[0], "a define id")?,
                    DefineInput {
                        template: field("template")?,
                        data,
                        html: field("html")?,
                    },
                );
            }
        }
        if let Some(env) = key(value, "env").filter(|env| !env.is_null()) {
            options.env = Some(Env {
                timezone: text(required(env, "timezone")?, "timezone")?,
                now: match required(env, "now")?.as_f64() {
                    Some(now) => now,
                    None => return fail("now is no number"),
                },
            });
        }
        Ok(options)
    }
}

impl Drop for Run {
    fn drop(&mut self) {
        // HR-87: the directory of the case does not outlive it; a directory that cannot be removed fails the run.
        std::fs::remove_dir_all(&self.directory).expect("the directory of the case is removed");
    }
}

fn steps(value: &Json) -> impl Iterator<Item = &Json> {
    key(value, "then").and_then(Json::as_array).into_iter().flatten()
}

/// The assign of a template_value: the value that the core takes is a map of values, null is no data (RT-4), and the
/// core has no entry for another value, so the runner refuses it.
fn assign_map(value: &Json) -> Result<OrderedMap, Failed> {
    match template_value(value)? {
        Value::Null => Ok(OrderedMap::new()),
        Value::Map(map) => Ok((*map).clone()),
        other => fail(format!("the core takes a map of values as assign, not {other:?}")),
    }
}

fn parse_options(case: &Json) -> Result<ParseOptions, Failed> {
    let delimiters = match key(case, "options")
        .and_then(|options| key(options, "delimiters"))
        .filter(|value| !value.is_null())
    {
        Some(delimiters) => Some(text(delimiters, "delimiters")?),
        None => None,
    };
    Ok(ParseOptions { delimiters })
}

/// The format options of a case; `indent` given as null keeps every line, and its text is an indent unit, which the
/// core validates (FMT-9).
fn format_options(case: &Json) -> Result<Result<FormatOptions, TemplateError>, Failed> {
    let mut options = FormatOptions::default();
    let Some(value) = key(case, "options") else {
        return Ok(Ok(options));
    };
    if let Some(name) = key(value, "name") {
        options.name = text(name, "name")?;
    }
    if let Some(delimiters) = key(value, "delimiters").filter(|delimiters| !delimiters.is_null()) {
        options.delimiters = Some(text(delimiters, "delimiters")?);
    }
    if let Some(range) = key(value, "range").filter(|range| !range.is_null()) {
        options.range = Some(uint(&range[0], "range")?..uint(&range[1], "range")?);
    }
    if let Some(indent) = key(value, "indent") {
        options.indent = match indent.as_str() {
            Some(unit) => match IndentUnit::new(unit) {
                Ok(unit) => Some(unit),
                Err(error) => return Ok(Err(error)),
            },
            None => None,
        };
    }
    if let Some(blocks) = key(value, "template_blocks") {
        options.template_blocks = match text(blocks, "template_blocks")?.as_str() {
            "indent" => TemplateBlocks::Indent,
            "flat" => TemplateBlocks::Flat,
            other => return fail(format!("{other} is no template_blocks")),
        };
    }
    Ok(Ok(options))
}

/// What the member of a case gave: nothing, a value in the form of a case value, or a failure.
type Outcome = Result<Option<Json>, RenderError>;

fn kind_of<T>(result: Result<T, TemplateError>) -> Result<T, RenderError> {
    result.map_err(RenderError::Kind)
}

/// Runs the member of a group with the arguments of a case.
fn call(run: &Run, group: &str, case: &Json) -> Result<Outcome, Failed> {
    let arg = |name: &str| required(case, name);
    let name = |name: &str| text(required(case, name)?, name);
    let done = |result: Result<(), RenderError>| Ok(result.map(|()| None));
    let value = |result: Result<String, RenderError>| Ok(result.map(|text| Some(Json::String(text))));
    match group {
        "fs_loader.new" => {
            drop(FsLoader::new(run.path(arg("root")?)?));
            Ok(Ok(None))
        }
        "map_loader.new" => {
            drop(MapLoader::new());
            Ok(Ok(None))
        }
        "map_loader.set" => {
            run.map_loader(arg("receiver")?)?.set(&name("name")?, &name("source")?);
            Ok(Ok(None))
        }
        "map_loader.set_ast" => {
            let result = run.map_loader(arg("receiver")?)?.set_ast(&name("path")?, template_of(arg("ast")?)?);
            done(result.map_err(|message| RenderError::Callback(message.into())))
        }
        "map_loader.set_ast_lines" => {
            let lines = match arg("lines")?.as_array() {
                Some(lines) => lines.iter().map(|line| uint(line, "a line start")).collect::<Result<Vec<_>, _>>()?,
                None => return fail("lines is no list"),
            };
            let result = run
                .map_loader(arg("receiver")?)?
                .set_ast_lines(&name("path")?, lines, template_of(arg("ast")?)?);
            done(result.map_err(|message| RenderError::Callback(message.into())))
        }
        "engine.new" => done(kind_of(AstProgram::new(run.engine_options(key(case, "options"))?).map(drop))),
        "engine.register" => {
            let function = host_function(arg("host_function")?, &run.unexpected)?;
            done(kind_of(run.engine(arg("receiver")?)?.register(&name("name")?, function)))
        }
        "engine.register_class" => {
            let function = host_function(arg("host_function")?, &run.unexpected)?;
            done(kind_of(run.engine(arg("receiver")?)?.register_class(
                &name("class_name")?,
                &name("method")?,
                function,
            )))
        }
        "engine.render" => {
            let engine = run.engine(arg("receiver")?)?;
            let assign = match key(case, "assign") {
                Some(assign) => assign_map(assign)?,
                None => OrderedMap::new(),
            };
            value(engine.render_values(RenderTarget::Name(&name("name")?), assign, &run.render_options(case)?))
        }
        "engine.render_json" => {
            let engine = run.engine(arg("receiver")?)?;
            value(engine.render(
                RenderTarget::Name(&name("name")?),
                &json_value(arg("assign")?)?,
                &run.render_options(case)?,
            ))
        }
        "engine.render_bound" => {
            let engine = run.engine(arg("receiver")?)?;
            value(engine.render_bound(
                RenderTarget::Name(&name("name")?),
                &run.bound(arg("assign")?)?,
                &run.render_options(case)?,
            ))
        }
        "engine.load" => {
            let engine = run.engine(arg("receiver")?)?;
            done(engine.load(RenderTarget::Name(&name("name")?), &run.render_options(case)?))
        }
        "engine.prepare" | "engine.prepare_bound" | "prepared_render.render" => prepared(run, group, case),
        "parse" => {
            let parsed = parse(&source_bytes(arg("source")?)?, &name("name")?, &parse_options(case)?);
            match parsed {
                Ok(template) => Ok(Ok(Some(case_template(&template)?))),
                Err(error) => Ok(Err(RenderError::Kind(error))),
            }
        }
        "analyze" => match analyze(&source_bytes(arg("source")?)?, &name("name")?, &parse_options(case)?) {
            Ok(analysis) => Ok(Ok(Some(serde_json::json!({"ast": case_template(&analysis.ast)?,
                "tags": case_tags(&analysis.tags), "tokens": case_tokens(&analysis.tokens)})))),
            Err(error) => Ok(Err(RenderError::Kind(error))),
        },
        "analyze_prefix" => match analyze_prefix(&source_bytes(arg("source")?)?, &name("name")?, &parse_options(case)?) {
            Ok(analysis) => {
                let ast = match &analysis.ast {
                    Some(ast) => case_template(ast)?,
                    None => Json::Null,
                };
                let error = match &analysis.error {
                    Some(error) => serde_json::json!({"code": error.code.as_str(), "template": error.template, "line": error.line,
                        "col": error.col, "offset": error.offset, "end": error.end, "message": error.message}),
                    None => Json::Null,
                };
                Ok(Ok(Some(serde_json::json!({"ast": ast, "tags": case_tags(&analysis.tags),
                    "tokens": case_tokens(&analysis.tokens), "error": error}))))
            }
            Err(error) => Ok(Err(RenderError::Kind(error))),
        },
        "format" => {
            let formatted = match format_options(case)? {
                Ok(options) => format(&name("source")?, &options),
                Err(error) => Err(error),
            };
            Ok(kind_of(formatted).map(|formatted| Some(serde_json::json!({"text": formatted.text, "changed": formatted.changed}))))
        }
        "resolve_path" => value(kind_of(resolve_path(&name("current")?, &name("path")?))),
        "encode_template" => value(kind_of(encode_template(&template_of(arg("template")?)?))),
        "decode_template" => match decode_template(&name("json")?) {
            Ok(template) => Ok(Ok(Some(case_template(&template)?))),
            Err(error) => Ok(Err(RenderError::Kind(error))),
        },
        "bind" => done(kind_of(bind(&template_value(arg("value")?)?).map(drop))),
        "merge" => {
            drop(merge(&run.bound(arg("first")?)?, &run.bound(arg("second")?)?));
            Ok(Ok(None))
        }
        other => fail(format!("the runner calls no member {other}")),
    }
}

/// The members of a prepared render, which borrows its engine: `engine.prepare` and `engine.prepare_bound` with their
/// `after` on the result, and `prepared_render.render` on a receiver that one of the two makes.
fn prepared(run: &Run, group: &str, case: &Json) -> Result<Outcome, Failed> {
    let (maker, source) = if group == "prepared_render.render" {
        let receiver = required(case, "receiver")?;
        (text(required(receiver, "new")?, "new")?, receiver)
    } else {
        (group.to_string(), case)
    };
    let args = if group == "prepared_render.render" {
        required(source, "args")?
    } else {
        case
    };
    let engine = run.engine(required(source, "receiver")?)?;
    let target = text(required(args, "name")?, "name")?;
    let options = run.render_options(args)?;
    let json;
    let bound;
    let made = match maker.as_str() {
        "engine.prepare" => {
            json = json_value(required(args, "assign")?)?;
            engine.prepare(RenderTarget::Name(&target), &json, &options)
        }
        "engine.prepare_bound" => {
            bound = run.bound(required(args, "assign")?)?;
            engine.prepare_bound(RenderTarget::Name(&target), &bound, &options)
        }
        other => return fail(format!("{other} makes no prepared render")),
    };
    if group == "prepared_render.render" {
        return match made {
            Ok(render) => Ok(render.render().map(|text| Some(Json::String(text)))),
            Err(error) => fail(format!("the preparation failed: {error}")),
        };
    }
    let render = match made {
        Ok(render) => render,
        Err(error) => return Ok(Err(error)),
    };
    for observation in key(case, "after").and_then(Json::as_array).into_iter().flatten() {
        if key(observation, "on") != Some(&Json::String("result".to_string()))
            || key(observation, "call") != Some(&Json::String("prepared_render.render".to_string()))
        {
            return fail(format!(
                "the runner observes only prepared_render.render on the result: {observation}"
            ));
        }
        let expected = required(observation, "result")?;
        match render.render() {
            Ok(text) if expected == &Json::String(text.clone()) => {}
            other => return fail(format!("after\n  actual {other:?}\nexpected {expected}")),
        }
    }
    Ok(Ok(None))
}

/// Runs one case: its result equals `result`, or its failure has the kind and the category of `raises` (B-4), and no
/// fixture was called without a row.
fn run_case(group: &str, case: &Json) -> Result<(), Failed> {
    let run = Run::new()?;
    let outcome = call(&run, group, case)?;
    let unexpected = run.unexpected.lock().expect("the unexpected calls").clone();
    if !unexpected.is_empty() {
        return fail(format!("calls that no row of a fixture answers: {unexpected:?}"));
    }
    if key(case, "after").is_some() && !matches!(group, "engine.prepare" | "engine.prepare_bound") {
        return fail("the runner observes no after of this member");
    }
    match (outcome, key(case, "raises")) {
        (Ok(actual), None) => match (actual, key(case, "result")) {
            (None, None) => Ok(()),
            (Some(actual), Some(expected)) if json_equal(&actual, expected) => Ok(()),
            (actual, expected) => fail(format!("result\n  actual {actual:?}\nexpected {expected:?}")),
        },
        (Err(RenderError::Kind(error)), Some(raises)) => {
            let kind = error.code.as_str();
            let actual = serde_json::json!({"kind": kind, "status": null, "category": kind_category(kind)});
            if &actual == raises {
                Ok(())
            } else {
                fail(format!("raises\n  actual {actual} ({})\nexpected {raises}", error.message))
            }
        }
        (Ok(actual), Some(raises)) => fail(format!("the call gave {actual:?}, expected {raises}")),
        (Err(error), _) => fail(format!("the call failed: {error}")),
    }
}

/// A case that arms fault injection points (G-5, X-1): it arms them for the member of its group as a generated binding
/// test does, runs the case under the arming, and fails a fault that did not fire.
fn faulted(group: &str, case: &Json, faults: &Json) -> Result<(), Failed> {
    let id = binding_core::fault::arm(group, &faults.to_string()).map_err(|error| Failed::from(error.to_string()))?;
    let outcome = binding_core::fault::take(group).run(|| run_case(group, case));
    let left = binding_core::fault::left(id).map_err(|error| Failed::from(error.to_string()))?;
    if !left.is_empty() {
        return fail(format!("the faults of {} did not fire", left.join(", ")));
    }
    outcome
}

/// A case of the file: with its faults armed when it names any.
fn trial(group: &str, case: &Json) -> Result<(), Failed> {
    match key(case, "faults") {
        Some(faults) => faulted(group, case, faults),
        None => run_case(group, case),
    }
}

/// The kinds that the cases of a member raise are kinds of its `raises` in the contract; a case of another kind states
/// a failure that the contract does not give the member (E-5).
fn raises_of_member(member: &str, raises: &[String], cases: &[Json]) -> Result<(), Failed> {
    for case in cases {
        if let Some(kind) = key(case, "raises").and_then(|raises| key(raises, "kind")).and_then(Json::as_str) {
            // The variant of a kind is its words in UpperCamelCase (binding E-3).
            let variant = format!(
                "polyspec_template::ErrorCode::{}",
                kind.split('_')
                    .map(|word| word[..1].to_uppercase() + &word[1..])
                    .collect::<String>()
            );
            if !raises.contains(&variant) {
                return fail(format!(
                    "a case of {member} raises {kind}, which the raises of the member do not name"
                ));
            }
        }
    }
    Ok(())
}

fn read(path: &[&str]) -> Json {
    let path = path.iter().fold(repo_root(), |path, part| path.join(part));
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the file is read");
    // A case of data_depth nests deeper than the 128 levels that serde_json reads by default.
    let mut reader = serde_json::Deserializer::from_str(&text);
    reader.disable_recursion_limit();
    serde::Deserialize::deserialize(&mut reader)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the file is JSON")
}

fn main() {
    let arguments = Arguments::from_args();
    let contract = read(&["packages", "rust", "interface.json"]);
    let file = read(&["contracts", "core-cases.json"]);
    let mut raises: HashMap<String, Vec<String>> = HashMap::new();
    for unit in contract["units"].as_array().expect("units") {
        for member in unit["members"].as_array().into_iter().flatten() {
            let kinds = member["raises"].as_array().into_iter().flatten();
            raises.insert(
                member["id"].as_str().expect("a member id").to_string(),
                kinds.map(|kind| kind.as_str().expect("a variant").to_string()).collect(),
            );
        }
    }
    let mut trials = Vec::new();
    let mut groups = Vec::new();
    for row in contract["cases"].as_array().expect("cases") {
        assert_eq!(
            row["file"], "contracts/core-cases.json",
            "the file of the cases of {}",
            row["member"]
        );
        let member = row["member"].as_str().expect("a member").to_string();
        let group = row["group"].as_str().expect("a group").to_string();
        assert_eq!(member, group, "a group of the case file has the id of its member");
        let Some(cases) = file[&group].as_array().cloned() else {
            panic!("the group {group} is not in the case file");
        };
        // HR-84: a member without a case checks nothing.
        assert!(!cases.is_empty(), "the group {group} has no case");
        let Some(kinds) = raises.get(&member).cloned() else {
            panic!("{member} is no member of the contract");
        };
        {
            let (member, cases) = (member.clone(), cases.clone());
            trials.push(Trial::test(format!("raises::{member}"), move || {
                raises_of_member(&member, &kinds, &cases)
            }));
        }
        for case in cases {
            let id = case["id"].as_str().expect("a case id").to_string();
            let group = group.clone();
            trials.push(Trial::test(format!("{group}::{id}"), move || trial(&group, &case)));
        }
        groups.push(group);
    }
    // A group of the file that no row of the contract names would run nowhere.
    for group in file.as_object().expect("the case file is an object").keys() {
        assert!(
            group == "comment" || groups.contains(group),
            "no row of cases names the group {group}"
        );
    }
    assert!(trials.len() >= 100, "expected the contract cases, found {}", trials.len());
    libtest_mimic::run(&arguments, trials).exit();
}
