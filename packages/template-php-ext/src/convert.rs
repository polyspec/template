//! Conversion between PHP values and the template value model (VAL-14, VAL-1).

use ext_php_rs::convert::IntoZval;
use ext_php_rs::types::{ArrayKey, ZendHashTable, Zval};
use polyspec_template::value::number::MAX_SAFE;
use std::rc::Rc;
use polyspec_template::{BindError, ErrorCode, OrderedMap, Value};

fn bind_error(code: ErrorCode, message: impl Into<String>) -> BindError {
    BindError {
        code,
        message: message.into(),
    }
}

/// Converts a PHP value into a template value (VAL-14).
///
/// An integer is range-checked, a float is checked for finiteness, a string is checked for UTF-8,
/// an array with the keys `0..n-1` in order becomes a list and every other array becomes a map
/// whose keys are the PHP keys as text.
pub fn php_to_value(zval: &Zval) -> Result<Value, BindError> {
    let zval = zval.dereference();
    if zval.is_null() {
        return Ok(Value::Null);
    }
    if let Some(value) = zval.bool() {
        return Ok(Value::Bool(value));
    }
    if zval.is_long() {
        let value = zval.long().unwrap_or_default();
        if value.unsigned_abs() as f64 > MAX_SAFE {
            return Err(bind_error(
                ErrorCode::E_DATA_NUMBER_RANGE,
                format!("integer {value} is outside the safe range"),
            ));
        }
        return Ok(Value::Number(value as f64));
    }
    if zval.is_double() {
        let value = zval.double().unwrap_or(f64::NAN);
        if !value.is_finite() {
            return Err(bind_error(ErrorCode::E_DATA_NUMBER_NOT_FINITE, "number is not finite"));
        }
        return Ok(Value::Number(value));
    }
    if zval.is_string() {
        let bytes = zval.zend_str().map(ext_php_rs::types::ZendStr::as_bytes).unwrap_or_default();
        return match std::str::from_utf8(bytes) {
            Ok(text) => Ok(Value::text(text)),
            Err(_) => Err(bind_error(ErrorCode::E_DATA_INVALID_UTF8, "string is not valid UTF-8")),
        };
    }
    if let Some(table) = zval.array() {
        return table_to_value(table);
    }
    Err(bind_error(
        ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        format!("value of type {} has no binding", zval.get_type()),
    ))
}

fn table_to_value(table: &ZendHashTable) -> Result<Value, BindError> {
    if table.has_sequential_keys() {
        let mut list = Vec::with_capacity(table.len());
        for (_, item) in table.iter() {
            list.push(php_to_value(item)?);
        }
        return Ok(Value::list(list));
    }
    let mut map = OrderedMap::new();
    for (key, item) in table.iter() {
        map.insert(key_text(&key), php_to_value(item)?);
    }
    Ok(Value::map(map))
}

fn key_text(key: &ArrayKey<'_>) -> String {
    match key {
        ArrayKey::Long(value) => value.to_string(),
        ArrayKey::String(value) => value.clone(),
        ArrayKey::Str(value) => (*value).to_string(),
        ArrayKey::ZendString(value) => String::from_utf8_lossy(value.as_bytes()).into_owned(),
    }
}

/// Converts a PHP value into the assign data map. An empty array is an empty map.
pub fn php_to_map(zval: &Zval) -> Result<OrderedMap, BindError> {
    match php_to_value(zval)? {
        Value::Map(map) => Ok(Rc::try_unwrap(map).unwrap_or_else(|shared| (*shared).clone())),
        Value::List(list) if list.is_empty() => Ok(OrderedMap::new()),
        _ => Err(bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "assign is not a map")),
    }
}

/// Converts a template value into a PHP value. A map becomes an array with its keys as text and a
/// safe string becomes a plain string.
pub fn value_to_php(value: &Value) -> Result<Zval, String> {
    let result = match value {
        Value::Null => Zval::new(),
        Value::Bool(value) => into_zval(*value)?,
        Value::Number(number) => into_zval(*number)?,
        Value::Str(text) | Value::Safe(text) => into_zval(&**text)?,
        Value::List(list) => {
            let mut table = ZendHashTable::new();
            for item in list.iter() {
                table.push(value_to_php(item)?).map_err(|error| error.to_string())?;
            }
            into_zval(table)?
        }
        Value::Map(map) => {
            let mut table = ZendHashTable::new();
            for (key, item) in map.iter() {
                table.insert(key.as_str(), value_to_php(item)?).map_err(|error| error.to_string())?;
            }
            into_zval(table)?
        }
    };
    Ok(result)
}

fn into_zval(value: impl IntoZval) -> Result<Zval, String> {
    value.into_zval(false).map_err(|error| error.to_string())
}
