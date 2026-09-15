//! Host binding of `serde_json::Value` (VAL-16) and the binding error.

use crate::error::ErrorCode;
use crate::value::number::MAX_SAFE;
use crate::value::{OrderedMap, Value};
use std::fmt;
use std::rc::Rc;

/// Error raised while binding host data (E_DATA_* codes).
#[derive(Debug, Clone, PartialEq)]
pub struct BindError {
    /// Error code.
    pub code: ErrorCode,
    /// Description.
    pub message: String,
}

impl fmt::Display for BindError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for BindError {}

fn bind_error(code: ErrorCode, message: impl Into<String>) -> BindError {
    BindError {
        code,
        message: message.into(),
    }
}

/// Converts a `serde_json::Value` into a template value.
pub fn bind(input: &serde_json::Value) -> Result<Value, BindError> {
    match input {
        serde_json::Value::Null => Ok(Value::Null),
        serde_json::Value::Bool(value) => Ok(Value::Bool(*value)),
        serde_json::Value::Number(number) => {
            // With arbitrary precision the number keeps its literal text (VAL-12).
            let literal = number.to_string();
            let is_integer_literal = !literal.contains(['.', 'e', 'E']);
            let value: f64 = literal.parse().unwrap_or(f64::INFINITY);
            if !value.is_finite() {
                return Err(bind_error(
                    ErrorCode::E_DATA_NUMBER_NOT_FINITE,
                    format!("number {literal} is not finite"),
                ));
            }
            if is_integer_literal && value.abs() > MAX_SAFE {
                return Err(bind_error(
                    ErrorCode::E_DATA_NUMBER_RANGE,
                    format!("integer {literal} is outside the safe range"),
                ));
            }
            Ok(Value::Number(value))
        }
        serde_json::Value::String(text) => Ok(Value::text(text.clone())),
        serde_json::Value::Array(items) => Ok(Value::list(items.iter().map(bind).collect::<Result<Vec<_>, _>>()?)),
        serde_json::Value::Object(entries) => {
            let mut map = OrderedMap::with_capacity(entries.len());
            for (key, value) in entries {
                map.insert(key.clone(), bind(value)?);
            }
            Ok(Value::map(map))
        }
    }
}

/// Binds a value that must be a map.
pub fn bind_map(input: &serde_json::Value) -> Result<OrderedMap, BindError> {
    match bind(input)? {
        Value::Map(map) => Ok(Rc::try_unwrap(map).unwrap_or_else(|shared| (*shared).clone())),
        _ => Err(bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "assign is not a map")),
    }
}

/// Accepts a native root map while retaining native object values.
pub fn bind_values(input: OrderedMap) -> OrderedMap {
    input
}

/// Converts a template value into a `serde_json::Value`; safe strings become plain strings.
pub fn to_json_value(value: &Value) -> serde_json::Value {
    match value {
        Value::Null => serde_json::Value::Null,
        Value::Bool(value) => serde_json::Value::Bool(*value),
        Value::Number(number) => serde_json::Number::from_f64(*number)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Value::Str(text) | Value::Safe(text) => serde_json::Value::String(text.to_string()),
        Value::List(list) => serde_json::Value::Array(list.iter().map(to_json_value).collect()),
        Value::Map(map) => serde_json::Value::Object(map.iter().map(|(key, value)| (key.clone(), to_json_value(value))).collect()),
        Value::Object(_) => serde_json::Value::Null,
    }
}
