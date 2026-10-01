//! Conversion between PHP values and the template value model (VAL-14, VAL-1).

use ext_php_rs::convert::{IntoZval, IntoZvalDyn};
use ext_php_rs::types::{ArrayKey, ZendCallable, ZendHashTable, ZendObject, Zval};
use ext_php_rs::zend::ClassEntry;
use polyspec_template::value::number::MAX_SAFE;
use polyspec_template::value::TemplateObject;
use std::fmt;
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
/// whose keys are the PHP keys as text. A `stdClass` is a map of its properties, an object that
/// implements `JsonSerializable` binds the value of `jsonSerialize()`, and every other object is
/// retained as a native object (VAL-14, VAL-18).
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
    if let Some(object) = zval.object() {
        if let Some(value) = object_to_value(object)? {
            return Ok(value);
        }
        return Ok(Value::object(PhpObject { zval: zval.shallow_clone() }));
    }
    Err(bind_error(
        ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        format!("value of type {} has no binding", zval.get_type()),
    ))
}

/// A PHP object retained by reference. Its public properties and methods are visible; the visibility is
/// that of a caller outside every class, as PHP decides it (VAL-18, VAL-19).
pub struct PhpObject {
    zval: Zval,
}

impl fmt::Debug for PhpObject {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let class = self.zval.object().and_then(|object| object.get_class_name().ok()).unwrap_or_default();
        write!(formatter, "PhpObject({class})")
    }
}

impl TemplateObject for PhpObject {
    fn member(&self, key: &str) -> Option<Value> {
        let properties = call_function("get_object_vars", vec![&self.zval]).ok()?;
        properties.array()?.get(key).and_then(|item| php_to_value(item).ok())
    }

    fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, String>> {
        let mut pair = ZendHashTable::new();
        pair.push(self.zval.shallow_clone()).ok()?;
        pair.push(method).ok()?;
        let pair = pair.into_zval(false).ok()?;
        if call_function("is_callable", vec![&pair]).ok()?.bool() != Some(true) {
            return None;
        }
        let object = self.zval.object()?;
        let params = match args.iter().map(value_to_php).collect::<Result<Vec<Zval>, String>>() {
            Ok(params) => params,
            Err(error) => return Some(Err(error)),
        };
        let params: Vec<&dyn IntoZvalDyn> = params.iter().map(|param| param as &dyn IntoZvalDyn).collect();
        Some(
            object
                .try_call_method(method, params)
                .map_err(|error| error.to_string())
                .and_then(|result| php_to_value(&result).map_err(|error| error.message)),
        )
    }
}

fn call_function(name: &str, params: Vec<&dyn IntoZvalDyn>) -> Result<Zval, String> {
    let function = ZendCallable::try_from_name(name).map_err(|error| error.to_string())?;
    function.try_call(params).map_err(|error| error.to_string())
}

/// Binds a `stdClass` as a map and a `JsonSerializable` object as its value (VAL-14); returns `None`
/// for every other object.
fn object_to_value(object: &ZendObject) -> Result<Option<Value>, BindError> {
    if object.get_class_name().is_ok_and(|name| name == "stdClass") {
        let properties = object
            .get_properties()
            .map_err(|_| bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "stdClass properties cannot be read"))?;
        return table_to_map(properties).map(Some);
    }
    if ClassEntry::try_find("JsonSerializable").is_some_and(|serializable| object.instance_of(serializable)) {
        let value = object
            .try_call_method("jsonSerialize", vec![])
            .map_err(|_| bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "jsonSerialize() failed"))?;
        return php_to_value(&value).map(Some);
    }
    Ok(None)
}

fn table_to_value(table: &ZendHashTable) -> Result<Value, BindError> {
    if table.has_sequential_keys() {
        let mut list = Vec::with_capacity(table.len());
        for (_, item) in table.iter() {
            list.push(php_to_value(item)?);
        }
        return Ok(Value::list(list));
    }
    table_to_map(table)
}

fn table_to_map(table: &ZendHashTable) -> Result<Value, BindError> {
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
        Value::Object(_) => return Err("native template objects cannot cross the PHP extension boundary".to_string()),
    };
    Ok(result)
}

fn into_zval(value: impl IntoZval) -> Result<Zval, String> {
    value.into_zval(false).map_err(|error| error.to_string())
}
