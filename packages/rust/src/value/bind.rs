//! Host binding of JSON values of polyspec-json and of host-built values (VAL-2, VAL-3, VAL-20),
//! and the binding error.

use crate::error::ErrorCode;
use crate::value::number::MAX_SAFE;
use crate::value::{MAX_DEPTH, OrderedMap, Value};
use polyspec_json::{Kind as JsonKind, Value as JsonValue};
use std::fmt;
use std::sync::Arc;

/// Error raised while binding host data (data_* codes).
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

/// Converts a JSON value of polyspec-json into a template value (VAL-12): numbers under VAL-2, strings that are Unicode
/// text, object members in document order with the last value of a repeated key in the first position, and the depth
/// limit of VAL-20.
pub fn bind_json(input: &JsonValue) -> Result<Value, BindError> {
    bind_json_at(input, 0)
}

/// A failure of an accessor of a JSON value whose kind was matched first: a broken invariant, internal.
fn json_internal(error: &polyspec_json::Error) -> BindError {
    BindError {
        code: ErrorCode::E_INTERNAL,
        message: format!("internal failure: {error}"),
    }
}

/// VAL-12: the text of a JSON string or key; an escaped unpaired surrogate is data_invalid_utf8.
fn json_text(input: &JsonValue) -> Result<String, BindError> {
    input.string_value().map_err(|error| match error {
        polyspec_json::Error::UnpairedSurrogate => BindError {
            code: ErrorCode::E_DATA_INVALID_UTF8,
            message: "a \\u escape leaves a surrogate unpaired".to_string(),
        },
        other => json_internal(&other),
    })
}

fn bind_json_at(input: &JsonValue, level: usize) -> Result<Value, BindError> {
    match input.kind() {
        JsonKind::Null => Ok(Value::Null),
        JsonKind::Boolean => Ok(Value::Bool(input.boolean_value().map_err(|error| json_internal(&error))?)),
        JsonKind::Number => {
            // The nearest double of the literal decides (VAL-2).
            let literal = input.number_literal().map_err(|error| json_internal(&error))?;
            check_number(json_number(literal)?).map(Value::Number)
        }
        JsonKind::String => Ok(Value::text(json_text(input)?)),
        JsonKind::Array => {
            check_level(level + 1)?;
            let items = input.items().map_err(|error| json_internal(&error))?;
            let mut list = Vec::with_capacity(items.len());
            for item in items {
                list.push(bind_json_at(item, level + 1)?);
            }
            Ok(Value::list(list))
        }
        JsonKind::Object => {
            check_level(level + 1)?;
            let members = input.members().map_err(|error| json_internal(&error))?;
            let mut map = OrderedMap::new();
            for (key, value) in members.iter() {
                map.insert(json_text(key)?, bind_json_at(value, level + 1)?);
            }
            Ok(Value::map(map))
        }
    }
}

/// The nearest double of a JSON number literal; an overflowing literal is infinity, which check_number rejects (VAL-2). A
/// literal that f64 does not read is a broken invariant of the JSON reader, internal.
fn json_number(literal: &str) -> Result<f64, BindError> {
    literal.parse::<f64>().map_err(|error| BindError {
        code: ErrorCode::E_INTERNAL,
        message: format!("the JSON number {literal} is not a number literal: {error}"),
    })
}

/// Binds a value that must be a map. A null value is an empty map (RT-4).
pub fn bind_map(input: &JsonValue) -> Result<OrderedMap, BindError> {
    if input.kind() == JsonKind::Null {
        return Ok(OrderedMap::new());
    }
    match bind_json(input)? {
        Value::Map(map) => Ok(match Arc::try_unwrap(map) {
            Ok(map) => map,
            Err(shared) => (*shared).clone(),
        }),
        _ => Err(bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "assign is not a map")),
    }
}

/// Binds a value that the host built directly (VAL-13): numbers are checked under VAL-2 and VAL-3,
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

/// Binds a native root map that the host built (VAL-13) while retaining native object values.
pub fn bind_values(input: &OrderedMap) -> Result<OrderedMap, BindError> {
    check_level(1)?;
    bind_entries(input, 1)
}

/// Converts a JSON value that generated code built from template values back into a template value. It is not host
/// binding: the value has already passed binding or comes from template operations, so the checks of VAL-2 and VAL-20 do
/// not apply.
pub fn value_from_json(input: &JsonValue) -> Result<Value, BindError> {
    Ok(match input.kind() {
        JsonKind::Null => Value::Null,
        JsonKind::Boolean => Value::Bool(input.boolean_value().map_err(|error| json_internal(&error))?),
        JsonKind::Number => Value::Number(json_number(input.number_literal().map_err(|error| json_internal(&error))?)?),
        JsonKind::String => Value::text(json_text(input)?),
        JsonKind::Array => Value::list(
            input
                .items()
                .map_err(|error| json_internal(&error))?
                .iter()
                .map(value_from_json)
                .collect::<Result<_, _>>()?,
        ),
        JsonKind::Object => Value::map(
            input
                .members()
                .map_err(|error| json_internal(&error))?
                .iter()
                .map(|(key, value)| Ok((json_text(key)?, value_from_json(value)?)))
                .collect::<Result<_, BindError>>()?,
        ),
    })
}

/// The JSON form of a template value (the form of VAL-21 without native objects) as a polyspec-json value; safe strings
/// become plain strings and numbers are written as VAL-9 writes them. A native object has no JSON form and is
/// data_unsupported_type; a number that is not finite is a broken invariant of the value model and is internal.
pub fn to_json_value(value: &Value) -> Result<JsonValue, BindError> {
    Ok(match value {
        Value::Null => JsonValue::null(),
        Value::Bool(value) => JsonValue::boolean(*value),
        Value::Number(number) => JsonValue::from_f64(*number).map_err(|error| json_internal(&error))?,
        Value::Str(text) | Value::Safe(text) => JsonValue::string(text),
        Value::List(list) => {
            JsonValue::array(&list.iter().map(to_json_value).collect::<Result<Vec<_>, _>>()?).map_err(|error| json_internal(&error))?
        }
        Value::Map(map) => {
            let mut members = polyspec_json::OrderedMap::new();
            for (key, value) in map.iter() {
                members
                    .insert(JsonValue::string(key), to_json_value(value)?)
                    .map_err(|error| json_internal(&error))?;
            }
            JsonValue::object(&members).map_err(|error| json_internal(&error))?
        }
        Value::Object(_) => {
            return Err(BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: "a native object has no JSON form".to_string(),
            });
        }
    })
}
