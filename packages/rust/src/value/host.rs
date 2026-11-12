//! The binding of a value that a generated binding describes as a `HostValue` of binding_core, and the making of a
//! template value as `OutValue`s (VAL-23, binding design U-7): the `in` and `out` functions of the value alias
//! `template_value` of the interface contract.

use crate::error::{ErrorCode, RenderError, TemplateError};
use crate::value::bind::{BindError, check_level, check_number};
use crate::value::{HostError, OrderedMap, TemplateObject, Value};
use binding_core::{Failure, Handle, HostText, HostValue, HostValues, MapOut, OutValue, OutValues};
use std::collections::HashMap;
use std::sync::Arc;

/// A language object that entered as a handle (VAL-23 `Object`): the core holds it and gives it back unchanged; it reads
/// no member and calls no method of it.
#[derive(Debug)]
pub struct HostObject {
    handle: Handle,
}

impl HostObject {
    /// The handle of the language object.
    pub fn handle(&self) -> Handle {
        self.handle
    }
}

impl TemplateObject for HostObject {
    fn member(&self, _key: &str) -> Result<Option<Value>, HostError> {
        Ok(None)
    }

    fn call(&self, _method: &str, _args: &[Value]) -> Option<Result<Value, HostError>> {
        None
    }

    // EXP-39: two such objects are the same host object when their handles are equal.
    fn identity(&self) -> *const () {
        // The binding gives handles from 1 upward, which a pointer of the target holds; one beyond it is the last address.
        let address = match usize::try_from(self.handle.raw()) {
            Ok(address) => address,
            Err(_) => usize::MAX,
        };
        std::ptr::without_provenance(address)
    }
}

fn kind(error: BindError) -> RenderError {
    RenderError::Kind(TemplateError::without_position(error.code, "", error.message))
}

fn unsupported(what: &str) -> RenderError {
    RenderError::Kind(TemplateError::without_position(
        ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        "",
        format!("{what} is not a template value"),
    ))
}

fn invalid_text(cause: impl std::fmt::Display) -> RenderError {
    RenderError::Kind(TemplateError::without_position(
        ErrorCode::E_DATA_INVALID_UTF8,
        "",
        format!("a string is not valid Unicode text: {cause}"),
    ))
}

/// The text of the units of a language string; units that are not well formed are data_invalid_utf8.
fn text(units: HostText) -> Result<String, RenderError> {
    match units {
        HostText::Bytes(bytes) => String::from_utf8(bytes).map_err(invalid_text),
        HostText::Utf16(units) => String::from_utf16(&units).map_err(invalid_text),
        HostText::CodePoints(points) => points
            .into_iter()
            .map(|point| char::from_u32(point).ok_or_else(|| invalid_text(format!("U+{point:04X} is no scalar value"))))
            .collect(),
    }
}

/// VAL-23: binds a value that a generated binding describes; the children of a container are asked for through `host`.
///
/// # Errors
///
/// `Failure::Kind` with the kind of a value that is no template value, and `Failure::Raised` with the exception that
/// language code raised while the binding answered a question of the walk (binding design E-1c). The walk calls no
/// Rust callback, so it never gives `Failure::Callback`.
pub fn value_in(host: &mut dyn HostValues, value: HostValue) -> Result<Value, Failure<TemplateError>> {
    bind(host, value, 0)
}

fn bind(host: &mut dyn HostValues, value: HostValue, level: usize) -> Result<Value, RenderError> {
    Ok(match value {
        HostValue::Null | HostValue::Undefined => Value::Null,
        HostValue::Bool(value) => Value::Bool(value),
        HostValue::Int(value) => {
            // VAL-2: an integer within ±(2^53 − 1) is exact as a double; one outside it is data_number_range.
            if value.unsigned_abs() > 9_007_199_254_740_991 {
                return Err(kind(BindError {
                    code: ErrorCode::E_DATA_NUMBER_RANGE,
                    message: format!("number {value} is outside the safe range"),
                }));
            }
            #[allow(
                clippy::as_conversions,
                clippy::cast_precision_loss,
                reason = "VAL-2: an integer within ±(2^53 − 1), which a double holds exactly"
            )]
            let number = value as f64;
            Value::Number(number)
        }
        HostValue::Number(token) => {
            return Err(kind(BindError {
                code: ErrorCode::E_DATA_NUMBER_RANGE,
                message: format!("number {token} is outside the safe range"),
            }));
        }
        HostValue::Float(value) | HostValue::UntypedNumber(value) => Value::Number(check_number(value).map_err(kind)?),
        HostValue::Text(units) => Value::text(text(units)?),
        HostValue::List { handle, len }
        | HostValue::PhpArray {
            handle,
            len,
            is_list: true,
        } => {
            check_level(level + 1).map_err(kind)?;
            let mut items = Vec::new();
            for index in 0..len {
                let item = host.item(handle, index)?;
                items.push(bind(host, item, level + 1)?);
            }
            Value::list(items)
        }
        HostValue::PhpArray {
            handle,
            len,
            is_list: false,
        } => entries(host, handle, len, level, true)?,
        HostValue::Map { handle, len } | HostValue::PlainObject { handle, len, .. } | HostValue::StdClass { handle, len } => {
            entries(host, handle, len, level, false)?
        }
        HostValue::PhpReference { target, .. } => bind(host, *target, level)?,
        HostValue::Object { handle, .. } => Value::object(HostObject { handle }),
        HostValue::Bytes(_) => return Err(unsupported("a byte string")),
        HostValue::Date(_) => return Err(unsupported("a date")),
        HostValue::Callable(_) => return Err(unsupported("a function")),
        HostValue::Value { .. } => return Err(unsupported("a value of another library")),
        HostValue::Other { type_name, .. } => return Err(unsupported(&format!("a value of the type {type_name}"))),
    })
}

/// The entries of a map; `integer_keys` admits the integer keys of a PHP array, which become their decimal text.
fn entries(host: &mut dyn HostValues, handle: Handle, len: u64, level: usize, integer_keys: bool) -> Result<Value, RenderError> {
    check_level(level + 1).map_err(kind)?;
    let mut map = OrderedMap::new();
    for index in 0..len {
        let (key, item) = host.entry(handle, index)?;
        let key = match key {
            HostValue::Text(units) => text(units)?,
            HostValue::Int(key) if integer_keys => key.to_string(),
            _ => return Err(unsupported("a map key that is not a string")),
        };
        map.insert(key, bind(host, item, level + 1)?);
    }
    Ok(Value::map(map))
}

/// The lists and maps of a template value by the handles that `value_out` gave them (VAL-23): one list or map is one
/// handle, however often the value holds it.
pub struct ValueOut<'v> {
    /// The containers by their handle, from 1.
    containers: Vec<&'v Value>,
    /// The handle of each container, by its address.
    handles: HashMap<*const (), Handle>,
}

impl<'v> ValueOut<'v> {
    fn describe(&mut self, value: &'v Value) -> OutValue {
        match value {
            Value::Null => OutValue::Null,
            Value::Bool(value) => OutValue::Bool(*value),
            Value::Number(number) => OutValue::Float(binding_core::FloatOut::new(*number)),
            Value::Str(text) | Value::Safe(text) => OutValue::Text(text.clone()),
            Value::List(items) => OutValue::List {
                handle: self.handle(value, Arc::as_ptr(items).cast()),
                len: length(items.len()),
            },
            Value::Map(map) => {
                let sequence_keys = map.iter().enumerate().all(|(index, (key, _))| *key == index.to_string());
                OutValue::Map(MapOut::new(
                    self.handle(value, Arc::as_ptr(map).cast()),
                    length(map.len()),
                    sequence_keys,
                ))
            }
            Value::Object(object) => match (Arc::as_ref(object) as &dyn std::any::Any).downcast_ref::<HostObject>() {
                Some(host) => OutValue::Native(host.handle()),
                // An object that a Rust host built has no language object; no binding gives the core one.
                None => OutValue::Null,
            },
        }
    }

    fn handle(&mut self, value: &'v Value, address: *const ()) -> Handle {
        if let Some(handle) = self.handles.get(&address) {
            return *handle;
        }
        self.containers.push(value);
        let handle = Handle::new(length(self.containers.len()));
        self.handles.insert(address, handle);
        handle
    }

    fn container(&self, handle: Handle) -> Option<&'v Value> {
        let index = match usize::try_from(handle.raw()) {
            Ok(index) => index.checked_sub(1)?,
            // A handle beyond usize was never given.
            Err(_) => return None,
        };
        self.containers.get(index).copied()
    }
}

/// The length of a list or a map, which a usize holds and so a u64 does.
fn length(len: usize) -> u64 {
    #[allow(clippy::as_conversions, reason = "VAL-23: a usize fits in a u64 on every target of the crate")]
    let length = len as u64;
    length
}

impl OutValues for ValueOut<'_> {
    fn item(&mut self, list: Handle, index: u64) -> OutValue {
        let item = match (self.container(list), usize::try_from(index)) {
            (Some(Value::List(items)), Ok(index)) => items.get(index),
            // A handle or an index that value_out never gave names no item.
            _ => None,
        };
        match item {
            Some(item) => self.describe(item),
            None => OutValue::Null,
        }
    }

    fn entry(&mut self, map: Handle, index: u64) -> (OutValue, OutValue) {
        let entry = match (self.container(map), usize::try_from(index)) {
            (Some(Value::Map(map)), Ok(index)) => map.iter().nth(index),
            _ => None,
        };
        match entry {
            Some((key, item)) => (OutValue::Text(key.clone()), self.describe(item)),
            None => (OutValue::Null, OutValue::Null),
        }
    }
}

/// VAL-23: a template value as the `OutValue` of its root and the source of its children.
pub fn value_out(value: &Value) -> (OutValue, ValueOut<'_>) {
    let mut source = ValueOut {
        containers: Vec::new(),
        handles: HashMap::new(),
    };
    let root = source.describe(value);
    (root, source)
}
