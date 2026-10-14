//! Host binding of `serde_json::Value` and of host-built values (VAL-2, VAL-3, VAL-16, VAL-20),
//! and the binding error.

use crate::error::ErrorCode;
use crate::value::number::MAX_SAFE;
use crate::value::{MAX_DEPTH, OrderedMap, Value};
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

/// VAL-2, VAL-3: accepts a number that is finite and whose magnitude is at most 2^53 − 1.
pub fn check_number(value: f64) -> Result<f64, BindError> {
    if !value.is_finite() {
        return Err(bind_error(ErrorCode::E_DATA_NUMBER_NOT_FINITE, "number is not finite"));
    }
    if value.abs() > MAX_SAFE {
        return Err(bind_error(
            ErrorCode::E_DATA_NUMBER_RANGE,
            format!("number {value} is outside the safe range"),
        ));
    }
    Ok(value)
}

/// VAL-2: accepts an integer-typed host value whose magnitude is at most 2^53 − 1, compared exactly.
pub fn check_integer(value: i128) -> Result<f64, BindError> {
    if value.unsigned_abs() > MAX_SAFE as u128 {
        return Err(bind_error(
            ErrorCode::E_DATA_NUMBER_RANGE,
            format!("integer {value} is outside the safe range"),
        ));
    }
    Ok(value as f64)
}

/// VAL-20: fails when a list or map would be entered at a level greater than the limit.
/// `level` is the number of enclosing lists and maps, including the one being entered.
pub fn check_level(level: usize) -> Result<(), BindError> {
    if level > MAX_DEPTH {
        return Err(bind_error(
            ErrorCode::E_DATA_DEPTH,
            format!("lists and maps nest deeper than {MAX_DEPTH} levels"),
        ));
    }
    Ok(())
}

/// Converts a `serde_json::Value` into a template value (VAL-16).
pub fn bind_json(input: &serde_json::Value) -> Result<Value, BindError> {
    bind_json_at(input, 0)
}

fn bind_json_at(input: &serde_json::Value, level: usize) -> Result<Value, BindError> {
    match input {
        serde_json::Value::Null => Ok(Value::Null),
        serde_json::Value::Bool(value) => Ok(Value::Bool(*value)),
        serde_json::Value::Number(number) => {
            // With arbitrary precision the number keeps its literal text; the nearest double decides (VAL-2).
            let literal = number.to_string();
            let value: f64 = literal.parse().unwrap_or(f64::INFINITY);
            check_number(value).map(Value::Number)
        }
        serde_json::Value::String(text) => Ok(Value::text(text.clone())),
        serde_json::Value::Array(items) => {
            check_level(level + 1)?;
            let mut list = Vec::with_capacity(items.len());
            for item in items {
                list.push(bind_json_at(item, level + 1)?);
            }
            Ok(Value::list(list))
        }
        serde_json::Value::Object(entries) => {
            check_level(level + 1)?;
            let mut map = OrderedMap::with_capacity(entries.len());
            for (key, value) in entries {
                map.insert(key.clone(), bind_json_at(value, level + 1)?);
            }
            Ok(Value::map(map))
        }
    }
}

/// Binds a value that must be a map. A null value is an empty map (RT-4).
pub fn bind_map(input: &serde_json::Value) -> Result<OrderedMap, BindError> {
    if input.is_null() {
        return Ok(OrderedMap::new());
    }
    match bind_json(input)? {
        Value::Map(map) => Ok(Rc::try_unwrap(map).unwrap_or_else(|shared| (*shared).clone())),
        _ => Err(bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "assign is not a map")),
    }
}

/// Binds a value that the host built directly (VAL-16): numbers are checked under VAL-2 and VAL-3,
/// the depth under VAL-20, and a safe string becomes a plain string (VAL-7). A native object is
/// retained.
pub fn bind_value(input: &Value) -> Result<Value, BindError> {
    bind_host(input, 0)
}

fn bind_host(input: &Value, level: usize) -> Result<Value, BindError> {
    match input {
        Value::Number(number) => check_number(*number).map(Value::Number),
        Value::Safe(text) => Ok(Value::Str(text.clone())),
        Value::List(items) => {
            check_level(level + 1)?;
            let mut list = Vec::with_capacity(items.len());
            for item in items.iter() {
                list.push(bind_host(item, level + 1)?);
            }
            Ok(Value::list(list))
        }
        Value::Map(map) => {
            check_level(level + 1)?;
            Ok(Value::map(bind_entries(map, level + 1)?))
        }
        other => Ok(other.clone()),
    }
}

fn bind_entries(map: &OrderedMap, level: usize) -> Result<OrderedMap, BindError> {
    let mut entries = OrderedMap::with_capacity(map.len());
    for (key, value) in map.iter() {
        entries.insert(key.clone(), bind_host(value, level)?);
    }
    Ok(entries)
}

/// Binds a native root map that the host built (VAL-16) while retaining native object values.
pub fn bind_values(input: &OrderedMap) -> Result<OrderedMap, BindError> {
    check_level(1)?;
    bind_entries(input, 1)
}

/// Converts a `serde_json::Value` that generated code built from template values back into a
/// template value. It is not host binding: the value has already passed binding or comes from
/// template operations, so the checks of VAL-2 and VAL-20 do not apply.
pub fn value_from_json(input: &serde_json::Value) -> Value {
    match input {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Bool(*value),
        serde_json::Value::Number(number) => Value::Number(number.to_string().parse().unwrap_or(f64::NAN)),
        serde_json::Value::String(text) => Value::text(text.clone()),
        serde_json::Value::Array(items) => Value::list(items.iter().map(value_from_json).collect()),
        serde_json::Value::Object(entries) => {
            Value::map(entries.iter().map(|(key, value)| (key.clone(), value_from_json(value))).collect())
        }
    }
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
