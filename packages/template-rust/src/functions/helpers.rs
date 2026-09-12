//! Argument helpers and the error type shared by the function groups.

use crate::error::ErrorCode;
use crate::value::{Value, parse_numeric_string, stringify};

/// Environment of a render (FUN-42).
#[derive(Debug, Clone, PartialEq)]
pub struct Env {
    /// Fixed offset `Z` or `±HH:MM`.
    pub timezone: String,
    /// Unix seconds of `now()`.
    pub now: f64,
}

/// Context passed to functions.
#[derive(Debug, Clone)]
pub struct FunctionContext<'a> {
    /// Environment.
    pub env: &'a Env,
}

/// Error raised by a function; the renderer adds the call position.
#[derive(Debug, Clone, PartialEq)]
pub struct FunctionError {
    /// Error code.
    pub code: ErrorCode,
    /// Description.
    pub message: String,
}

/// A built-in function.
pub struct BuiltIn {
    /// Minimum argument count.
    pub min: usize,
    /// Maximum argument count.
    pub max: usize,
    /// Implementation.
    pub call: fn(&[Value], &FunctionContext<'_>) -> Result<Value, FunctionError>,
}

/// Creates an E_RUNTIME_TYPE error.
pub fn type_error(message: impl Into<String>) -> FunctionError {
    FunctionError {
        code: ErrorCode::E_RUNTIME_TYPE,
        message: message.into(),
    }
}

/// Requires a string argument.
pub fn arg_string(value: &Value, name: &str) -> Result<String, FunctionError> {
    value
        .as_text()
        .map(str::to_string)
        .ok_or_else(|| type_error(format!("{name} requires a string, got {}", value.value_type().name())))
}

/// Requires a list argument.
pub fn arg_list<'v>(value: &'v Value, name: &str) -> Result<&'v Vec<Value>, FunctionError> {
    match value {
        Value::List(list) => Ok(list),
        other => Err(type_error(format!("{name} requires a list, got {}", other.value_type().name()))),
    }
}

/// EXP-23 to_number.
pub fn to_number(value: &Value) -> Result<f64, FunctionError> {
    match value {
        Value::Null => Ok(0.0),
        Value::Bool(true) => Ok(1.0),
        Value::Bool(false) => Ok(0.0),
        Value::Number(number) => Ok(*number),
        Value::Str(text) | Value::Safe(text) => parse_numeric_string(text).ok_or_else(|| type_error(format!("{text:?} is not a number"))),
        other => Err(type_error(format!("a {} is not a number", other.value_type().name()))),
    }
}

/// Converts an argument with to_number.
pub fn arg_number(value: &Value) -> Result<f64, FunctionError> {
    to_number(value)
}

/// Converts an argument with to_number and truncates it.
pub fn arg_integer(value: &Value) -> Result<i64, FunctionError> {
    Ok(to_number(value)?.trunc() as i64)
}

/// Stringifies an argument; a list or map is E_RUNTIME_STRINGIFY.
pub fn stringify_arg(value: &Value) -> Result<String, FunctionError> {
    stringify(value).map_err(|_| FunctionError {
        code: ErrorCode::E_RUNTIME_STRINGIFY,
        message: "a list or map cannot be converted to text".to_string(),
    })
}

/// Optional argument accessor.
pub fn optional(args: &[Value], index: usize) -> Option<&Value> {
    args.get(index)
}
