//! The PHP engine class (RT-1 to RT-6).

use crate::convert::{php_to_map, php_to_value, value_to_php};
use crate::error::php_exception;
use ext_php_rs::convert::IntoZval;
use ext_php_rs::exception::PhpException;
use ext_php_rs::prelude::*;
use ext_php_rs::types::{ZendHashTable, Zval};
use polyspec_template::functions::helpers::FunctionContext;
use polyspec_template::{
    BindError, Engine as CoreEngine, EngineOptions, ErrorCode, FsLoader, Limits, ParseOptions, RenderOptions, RenderTarget,
    TemplateError as EngineError, Value, defines_from_json, env_from_json, parse as core_parse, to_json_value,
};

/// The template engine backed by the native implementation.
#[php_class]
#[php(name = "Polyspec\\Template\\Native\\Engine")]
pub struct NativeEngine {
    engine: CoreEngine,
}

#[php_impl]
impl NativeEngine {
    /// Creates an engine. `root` is the loader root directory; without it no template name resolves.
    ///
    /// `options` accepts `delimiters` as a two-character string, `legacy_wrappers` as a boolean
    /// and `limits` as an array with the keys `iterations`, `depth`, `outputBytes` and
    /// `expressionDepth`.
    pub fn __construct(root: Option<String>, options: Option<&ZendHashTable>) -> PhpResult<NativeEngine> {
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
            if options.get("legacy_wrappers").and_then(Zval::bool).unwrap_or(false) {
                engine_options.legacy_wrappers = true;
            }
        }
        Ok(NativeEngine {
            engine: CoreEngine::new(engine_options),
        })
    }

    /// RT-2: parses one template source and returns the AST as nested arrays.
    pub fn parse(source: &Zval, name: String, options: Option<&ZendHashTable>) -> PhpResult<Zval> {
        let text = Self::parse_to_json(source, name, options)?;
        let value: serde_json::Value =
            serde_json::from_str(&text).map_err(|error| PhpException::default(format!("cannot read the AST: {error}")))?;
        json_to_php(&value).map_err(PhpException::default)
    }

    /// RT-2: parses one template source and returns the AST as JSON text.
    pub fn parse_to_json(source: &Zval, name: String, options: Option<&ZendHashTable>) -> PhpResult<String> {
        let bytes = source_bytes(source);
        let parse_options = ParseOptions {
            delimiters: delimiters_of(options, &name)?,
            legacy_wrappers: options
                .and_then(|options| options.get("legacy_wrappers"))
                .and_then(Zval::bool)
                .unwrap_or(false),
        };
        let ast = core_parse(bytes, &name, &parse_options).map_err(|error| php_exception(&error))?;
        serde_json::to_string(&ast).map_err(|error| PhpException::default(format!("cannot write the AST: {error}")))
    }

    /// FUN-43, FUN-44: registers a host function `fn(array $args, array $env): mixed`.
    pub fn register(&mut self, name: String, function: &Zval) -> PhpResult<()> {
        let callable =
            ZendCallable::new_owned(function.shallow_clone()).map_err(|_| PhpException::default("argument is not callable".to_string()))?;
        let host = Box::new(move |args: &[Value], context: &FunctionContext<'_>| call_php(&callable, args, context));
        self.engine.register(&name, host).map_err(PhpException::default)
    }

    /// Renders a template with data given as a PHP value.
    ///
    /// `options` accepts `define` and `env` as arrays of the form of the specification.
    pub fn render(&self, name: String, assign: Option<&Zval>, options: Option<&ZendHashTable>) -> PhpResult<String> {
        let bound = (|| -> Result<(serde_json::Value, RenderOptions), BindError> {
            let root = match assign {
                Some(assign) => php_to_map(assign)?,
                None => Default::default(),
            };
            let mut render_options = RenderOptions::default();
            if let Some(options) = options {
                if let Some(define) = options.get("define") {
                    render_options.define = defines_from_json(&php_to_json(define)?)?;
                }
                if let Some(env) = options.get("env") {
                    render_options.env = Some(env_from_json(&php_to_json(env)?)?);
                }
            }
            Ok((to_json_value(&Value::map(root)), render_options))
        })();
        let (assign, render_options) = bound.map_err(|error| php_exception(&bind_failure(&name, error)))?;
        self.engine
            .render(RenderTarget::Name(&name), &assign, &render_options)
            .map_err(|error| php_exception(&error))
    }

    /// Renders a template with assign data, template definitions and environment given as JSON text.
    pub fn render_json(&self, name: String, assign: String, define: Option<String>, env: Option<String>) -> PhpResult<String> {
        let assign = read_json(&assign, &name)?;
        let mut render_options = RenderOptions::default();
        if let Some(define) = define {
            let value = read_json(&define, &name)?;
            render_options.define = defines_from_json(&value).map_err(|error| php_exception(&bind_failure(&name, error)))?;
        }
        if let Some(env) = env {
            let value = read_json(&env, &name)?;
            render_options.env = Some(env_from_json(&value).map_err(|error| php_exception(&bind_failure(&name, error)))?);
        }
        self.engine
            .render(RenderTarget::Name(&name), &assign, &render_options)
            .map_err(|error| php_exception(&error))
    }
}

fn bind_failure(template: &str, error: BindError) -> EngineError {
    EngineError::without_position(error.code, template, error.message)
}

fn source_bytes(zval: &Zval) -> &[u8] {
    zval.zend_str().map(ext_php_rs::types::ZendStr::as_bytes).unwrap_or_default()
}

fn delimiters_of(options: Option<&ZendHashTable>, name: &str) -> PhpResult<Option<String>> {
    let Some(delimiters) = options.and_then(|options| options.get("delimiters")).and_then(Zval::str) else {
        return Ok(None);
    };
    if polyspec_template::parser::scanner::parse_delimiters(delimiters).is_none() {
        let _ = name;
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

fn read_json(text: &str, template: &str) -> PhpResult<serde_json::Value> {
    serde_json::from_str(text).map_err(|error| {
        php_exception(&EngineError::without_position(
            ErrorCode::E_DATA_UNSUPPORTED_TYPE,
            template,
            format!("input is not JSON: {error}"),
        ))
    })
}

fn php_to_json(zval: &Zval) -> Result<serde_json::Value, BindError> {
    Ok(to_json_value(&php_to_value(zval)?))
}

/// Calls a PHP callable with the argument list and the environment (FUN-43, FUN-46).
fn call_php(callable: &ZendCallable<'static>, args: &[Value], context: &FunctionContext<'_>) -> Result<Value, String> {
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
    let result = callable.try_call(vec![&list, &env]).map_err(|error| error.to_string())?;
    php_to_value(&result).map_err(|error| error.message)
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
                table.insert(key.as_str(), json_to_php(item)?).map_err(|error| error.to_string())?;
            }
            into_zval(table)?
        }
    };
    Ok(result)
}

fn into_zval(value: impl IntoZval) -> Result<Zval, String> {
    value.into_zval(false).map_err(|error| error.to_string())
}
