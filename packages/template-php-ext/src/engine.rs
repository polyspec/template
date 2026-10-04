//! The PHP engine class (RT-1 to RT-6).

use crate::bound::bound_of;
use crate::convert::{array_key, php_to_map, php_to_value, value_to_php};
use crate::error::{boundary, php_exception};
use ext_php_rs::convert::IntoZval;
use ext_php_rs::error::Error as ExtError;
use ext_php_rs::exception::PhpException;
use ext_php_rs::prelude::*;
use ext_php_rs::types::array::Iter;
use ext_php_rs::types::{ZendHashTable, Zval};
use polyspec_template::functions::helpers::FunctionContext;
use polyspec_template::{
    AstProgram as CoreProgram, BindError, DefineData, DefineInput, EngineOptions, ErrorCode, FsLoader, HostError, Limits, OrderedMap,
    ParseOptions, RenderOptions, RenderTarget, TemplateError as EngineError, Value, bind, defines_from_json, env_from_json,
    parse as core_parse, read_json, to_json_value,
};
use std::collections::HashMap;

/// The template engine backed by the native implementation.
#[php_class]
#[php(name = "Polyspec\\Template\\Native\\Engine")]
pub struct NativeEngine {
    engine: CoreProgram,
}

#[php_impl]
impl NativeEngine {
    /// Creates an engine. `root` is the loader root directory; without it no template name resolves.
    ///
    /// `options` accepts `delimiters` as a two-character string and `limits` as an array
    /// with the keys `iterations`, `depth`, `outputBytes` and
    /// `expressionDepth`.
    pub fn __construct(root: Option<String>, options: Option<&ZendHashTable>) -> PhpResult<NativeEngine> {
        boundary("", || Self::create(root, options))
    }

    /// RT-2: parses one template source and returns the AST as nested arrays.
    pub fn parse(source: &Zval, name: String, options: Option<&ZendHashTable>) -> PhpResult<Zval> {
        boundary(&name, || {
            let text = Self::ast_json(source, &name, options)?;
            let value: serde_json::Value =
                serde_json::from_str(&text).map_err(|error| PhpException::default(format!("cannot read the AST: {error}")))?;
            json_to_php(&value).map_err(PhpException::default)
        })
    }

    /// RT-2: parses one template source and returns the AST as JSON text.
    pub fn parse_to_json(source: &Zval, name: String, options: Option<&ZendHashTable>) -> PhpResult<String> {
        boundary(&name, || Self::ast_json(source, &name, options))
    }

    /// FUN-43, FUN-44: registers a host function `fn(array $args, array $env): mixed`.
    pub fn register(&mut self, name: String, function: &Zval) -> PhpResult<()> {
        boundary("", || {
            let host = host_function(function)?;
            self.engine.register(&name, host).map_err(PhpException::default)
        })
    }

    /// FUN-43, VAL-19: registers the logical class function `ClassName::method` as
    /// `fn(array $args, array $env): mixed`.
    pub fn register_class(&mut self, class_name: String, method: String, function: &Zval) -> PhpResult<()> {
        boundary("", || {
            let host = host_function(function)?;
            self.engine
                .register_class(&class_name, &method, host)
                .map_err(PhpException::default)
        })
    }

    /// Renders a template with data given as a PHP value, or as a bound map that is not bound again
    /// (VAL-22).
    ///
    /// `options` accepts `define` and `env` as arrays of the form of the specification. The values
    /// go to the engine without JSON, so assigned objects keep their instances (VAL-18).
    pub fn render(&self, name: String, assign: Option<&Zval>, options: Option<&ZendHashTable>) -> PhpResult<String> {
        boundary(&name, || {
            let render_options = bind_options(options).map_err(|error| php_exception(&bind_failure(&name, error)))?;
            if let Some(bound) = assign.and_then(bound_of) {
                return self
                    .engine
                    .render_bound(RenderTarget::Name(&name), bound, &render_options)
                    .map_err(|error| php_exception(&error));
            }
            let assign = match assign {
                Some(assign) => php_to_map(assign).map_err(|error| php_exception(&bind_failure(&name, error)))?,
                None => OrderedMap::new(),
            };
            self.engine
                .render_values(RenderTarget::Name(&name), assign, &render_options)
                .map_err(|error| php_exception(&error))
        })
    }

    /// Renders a template with assign data, template definitions and environment given as JSON text.
    pub fn render_json(&self, name: String, assign: String, define: Option<String>, env: Option<String>) -> PhpResult<String> {
        boundary(&name, || {
            let assign = read_json_text(&assign, &name)?;
            let mut render_options = RenderOptions::default();
            if let Some(define) = define {
                let value = read_json_text(&define, &name)?;
                render_options.define = defines_from_json(&value).map_err(|error| php_exception(&bind_failure(&name, error)))?;
            }
            if let Some(env) = env {
                let value = read_json_text(&env, &name)?;
                render_options.env = Some(env_from_json(&value).map_err(|error| php_exception(&bind_failure(&name, error)))?);
            }
            self.engine
                .render(RenderTarget::Name(&name), &assign, &render_options)
                .map_err(|error| php_exception(&error))
        })
    }
}

impl NativeEngine {
    fn create(root: Option<String>, options: Option<&ZendHashTable>) -> PhpResult<NativeEngine> {
        let mut engine_options = EngineOptions::default();
        if let Some(root) = root {
            engine_options.loader = Some(Box::new(FsLoader::new(&root)));
        }
        if let Some(options) = options {
            if let Some(delimiters) = options.get("delimiters").and_then(Zval::str) {
                if polyspec_template::parser::scanner::parse_delimiters(delimiters).is_none() {
                    return Err(PhpException::default(format!("{delimiters:?} is not a delimiter pair")));
                }
                engine_options.delimiters = Some(delimiters.to_string());
            }
            if let Some(limits) = options.get("limits").and_then(Zval::array) {
                engine_options.limits = Some(read_limits(limits));
            }
        }
        Ok(NativeEngine {
            engine: CoreProgram::new(engine_options),
        })
    }

    fn ast_json(source: &Zval, name: &str, options: Option<&ZendHashTable>) -> PhpResult<String> {
        let bytes = source_bytes(source);
        let parse_options = ParseOptions {
            delimiters: delimiters_of(options)?,
        };
        let ast = core_parse(bytes, name, &parse_options).map_err(|error| php_exception(&error))?;
        serde_json::to_string(&ast).map_err(|error| PhpException::default(format!("cannot write the AST: {error}")))
    }
}

/// Binds the template definitions and the environment of `render` (VAL-14).
fn bind_options(options: Option<&ZendHashTable>) -> Result<RenderOptions, BindError> {
    let mut render_options = RenderOptions::default();
    if let Some(options) = options {
        if let Some(define) = options.get("define") {
            render_options.define = defines_from_php(define)?;
        }
        if let Some(env) = options.get("env") {
            render_options.env = Some(env_from_json(&to_json_value(&php_to_value(env)?))?);
        }
    }
    Ok(render_options)
}

/// Reads the template definitions of `render` (RT-24). The data of an entry is bound as its own
/// value, so it may hold native objects and its depth counts from the data map (VAL-11, VAL-20).
fn defines_from_php(zval: &Zval) -> Result<HashMap<String, DefineInput>, BindError> {
    let not_object = || BindError {
        code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        message: "define is not an object".to_string(),
    };
    let table = zval.dereference().array().ok_or_else(not_object)?;
    let mut defines = HashMap::new();
    let mut entries = Iter::new(table);
    while let Some((id, entry)) = entries.next_zval() {
        let id = match id.long() {
            Some(number) => number.to_string(),
            None => std::str::from_utf8(id.zend_str().map(ext_php_rs::types::ZendStr::as_bytes).unwrap_or_default())
                .map(str::to_string)
                .map_err(|_| BindError {
                    code: ErrorCode::E_DATA_INVALID_UTF8,
                    message: "a define id is not valid UTF-8".to_string(),
                })?,
        };
        let entry = entry.dereference();
        let input = if let Some(template) = entry.str() {
            DefineInput {
                template: Some(template.to_string()),
                data: None,
                html: None,
            }
        } else if let Some(fields) = entry.array() {
            DefineInput {
                template: fields.get("template").and_then(Zval::str).map(str::to_string),
                data: fields.get("data").map(define_data).transpose()?,
                html: fields.get("html").and_then(Zval::str).map(str::to_string),
            }
        } else {
            return Err(BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: format!("define {id} is not a path or object"),
            });
        };
        defines.insert(id, input);
    }
    Ok(defines)
}

/// The data of a definition: a bound map of the extension is not bound again (VAL-22), and every
/// other value is bound as its own value.
fn define_data(zval: &Zval) -> Result<DefineData, BindError> {
    match bound_of(zval) {
        Some(bound) => bind(bound).map(DefineData::Bound).map_err(|error| BindError {
            code: error.code,
            message: error.message,
        }),
        None => php_to_value(zval).map(DefineData::Value),
    }
}

fn bind_failure(template: &str, error: BindError) -> EngineError {
    EngineError::without_position(error.code, template, error.message)
}

fn source_bytes(zval: &Zval) -> &[u8] {
    zval.zend_str().map(ext_php_rs::types::ZendStr::as_bytes).unwrap_or_default()
}

fn delimiters_of(options: Option<&ZendHashTable>) -> PhpResult<Option<String>> {
    let Some(delimiters) = options.and_then(|options| options.get("delimiters")).and_then(Zval::str) else {
        return Ok(None);
    };
    if polyspec_template::parser::scanner::parse_delimiters(delimiters).is_none() {
        return Err(PhpException::default(format!("{delimiters:?} is not a delimiter pair")));
    }
    Ok(Some(delimiters.to_string()))
}

fn read_limits(table: &ZendHashTable) -> Limits {
    let mut limits = Limits::default();
    let read = |key: &str, current: usize| -> usize {
        table
            .get(key)
            .and_then(Zval::long)
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(current)
    };
    limits.iterations = read("iterations", limits.iterations);
    limits.depth = read("depth", limits.depth);
    limits.output_bytes = read("outputBytes", limits.output_bytes);
    limits.expression_depth = read("expressionDepth", limits.expression_depth);
    limits
}

/// Reads JSON text under VAL-2, VAL-12 and VAL-20; text that is not one JSON document is
/// `E_DATA_INVALID_JSON`.
fn read_json_text(text: &str, template: &str) -> PhpResult<serde_json::Value> {
    read_json(text).map_err(|error| php_exception(&bind_failure(template, error)))
}

fn host_function(function: &Zval) -> PhpResult<polyspec_template::HostFunction> {
    let callable =
        ZendCallable::new_owned(function.shallow_clone()).map_err(|_| PhpException::default("argument is not callable".to_string()))?;
    Ok(Box::new(move |args: &[Value], context: &FunctionContext<'_>| {
        call_php(&callable, args, context)
    }))
}

/// Calls a PHP callable with the argument list and the environment (FUN-43, FUN-46). A native
/// object argument is the original PHP object (VAL-18); an exception is a host failure with its
/// message, and a result that cannot be bound fails with its data code.
fn call_php(callable: &ZendCallable<'static>, args: &[Value], context: &FunctionContext<'_>) -> Result<Value, HostError> {
    let mut list = ZendHashTable::new();
    for argument in args {
        list.push(value_to_php(argument)?).map_err(|error| error.to_string())?;
    }
    let mut env = ZendHashTable::new();
    env.insert("timezone", context.env.timezone.as_str())
        .map_err(|error| error.to_string())?;
    env.insert("now", context.env.now).map_err(|error| error.to_string())?;
    let list = list.into_zval(false).map_err(|error| error.to_string())?;
    let env = env.into_zval(false).map_err(|error| error.to_string())?;
    let result = callable.try_call(vec![&list, &env]).map_err(|error| match error {
        ExtError::Exception(exception) => exception
            .try_call_method("getMessage", vec![])
            .ok()
            .and_then(|message| message.string())
            .unwrap_or_default(),
        other => other.to_string(),
    })?;
    Ok(php_to_value(&result)?)
}

/// Converts a JSON value into a PHP value; an integer literal becomes a PHP integer.
fn json_to_php(value: &serde_json::Value) -> Result<Zval, String> {
    let result = match value {
        serde_json::Value::Null => Zval::new(),
        serde_json::Value::Bool(value) => into_zval(*value)?,
        serde_json::Value::Number(number) => {
            let literal = number.to_string();
            if literal.contains(['.', 'e', 'E']) {
                into_zval(literal.parse::<f64>().unwrap_or(f64::NAN))?
            } else {
                match literal.parse::<i64>() {
                    Ok(value) => into_zval(value)?,
                    Err(_) => into_zval(literal.parse::<f64>().unwrap_or(f64::NAN))?,
                }
            }
        }
        serde_json::Value::String(text) => into_zval(text.as_str())?,
        serde_json::Value::Array(items) => {
            let mut table = ZendHashTable::new();
            for item in items {
                table.push(json_to_php(item)?).map_err(|error| error.to_string())?;
            }
            into_zval(table)?
        }
        serde_json::Value::Object(entries) => {
            let mut table = ZendHashTable::new();
            for (key, item) in entries {
                table
                    .insert(array_key(key), json_to_php(item)?)
                    .map_err(|error| error.to_string())?;
            }
            into_zval(table)?
        }
    };
    Ok(result)
}

fn into_zval(value: impl IntoZval) -> Result<Zval, String> {
    value.into_zval(false).map_err(|error| error.to_string())
}
