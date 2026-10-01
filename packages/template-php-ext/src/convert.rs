//! Conversion between PHP values and the template value model (VAL-14, VAL-1).

use ext_php_rs::convert::{IntoZval, IntoZvalDyn};
use ext_php_rs::ffi::{ZEND_ACC_PUBLIC, zend_function, zend_hash_str_find_ptr_lc};
use ext_php_rs::types::array::Iter;
use ext_php_rs::types::{ZendCallable, ZendHashTable, ZendObject, Zval};
use ext_php_rs::zend::{ClassEntry, ExecutorGlobals, ce};
use polyspec_template::value::bind::{check_integer, check_level, check_number};
use polyspec_template::value::{HostError, TemplateObject};
use polyspec_template::{BindError, ErrorCode, OrderedMap, Value};
use std::fmt;
use std::os::raw::c_char;
use std::rc::Rc;

fn bind_error(code: ErrorCode, message: impl Into<String>) -> BindError {
    BindError {
        code,
        message: message.into(),
    }
}

/// Converts a PHP value into a template value (VAL-14, VAL-20).
///
/// An integer and a float are checked under VAL-2, a string and every map key are checked for
/// UTF-8, an array with the keys `0..n-1` in order becomes a list and every other array becomes a
/// map. An object that implements `JsonSerializable` binds the value of `jsonSerialize()`, an
/// instance of `stdClass` or of a subclass is a map of its public properties, a closure is
/// rejected, and every other object is retained as a native object. Lists, maps and
/// `jsonSerialize()` calls nest at most 64 levels, which also stops a cyclic structure.
pub fn php_to_value(zval: &Zval) -> Result<Value, BindError> {
    bind_php(zval, 0)
}

fn bind_php(zval: &Zval, level: usize) -> Result<Value, BindError> {
    let zval = zval.dereference();
    if zval.is_null() {
        return Ok(Value::Null);
    }
    if let Some(value) = zval.bool() {
        return Ok(Value::Bool(value));
    }
    if zval.is_long() {
        return check_integer(i128::from(zval.long().unwrap_or_default())).map(Value::Number);
    }
    if zval.is_double() {
        return check_number(zval.double().unwrap_or(f64::NAN)).map(Value::Number);
    }
    if zval.is_string() {
        return text_of(zval.zend_str().map(ext_php_rs::types::ZendStr::as_bytes).unwrap_or_default()).map(Value::text);
    }
    if let Some(table) = zval.array() {
        check_level(level + 1)?;
        return if is_list(table) {
            let mut list = Vec::with_capacity(table.len());
            let mut entries = Iter::new(table);
            while let Some((_, item)) = entries.next_zval() {
                list.push(bind_php(item, level + 1)?);
            }
            Ok(Value::list(list))
        } else {
            table_to_map(table, level + 1, false).map(Value::map)
        };
    }
    if let Some(object) = zval.object() {
        if instance_of(object, "JsonSerializable") {
            check_level(level + 1)?;
            let result = object.try_call_method("jsonSerialize", vec![]);
            if let Some(message) = take_exception_message() {
                return Err(bind_error(ErrorCode::E_RUNTIME_HOST_FUNCTION, format!("jsonSerialize() failed: {message}")));
            }
            let value = result.map_err(|error| bind_error(ErrorCode::E_RUNTIME_HOST_FUNCTION, format!("jsonSerialize() failed: {error}")))?;
            return bind_php(&value, level + 1);
        }
        if object.instance_of(ce::stdclass()) {
            check_level(level + 1)?;
            let properties = properties_of(zval)?;
            let table = properties.array().ok_or_else(unreadable_properties)?;
            return table_to_map(table, level + 1, true).map(Value::map);
        }
        if instance_of(object, "Closure") {
            return Err(bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "a closure has no binding"));
        }
        return Ok(Value::object(PhpObject { zval: zval.shallow_clone() }));
    }
    Err(bind_error(
        ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        format!("value of type {} has no binding", zval.get_type()),
    ))
}

fn text_of(bytes: &[u8]) -> Result<String, BindError> {
    std::str::from_utf8(bytes)
        .map(str::to_string)
        .map_err(|_| bind_error(ErrorCode::E_DATA_INVALID_UTF8, "string is not valid UTF-8"))
}

fn instance_of(object: &ZendObject, class: &str) -> bool {
    ClassEntry::try_find(class).is_some_and(|entry| object.instance_of(entry))
}

/// `array_is_list()`: the keys are the integers `0..n-1` in order. The keys are read as raw zvals,
/// so a string key that is not valid UTF-8 cannot stop the check.
fn is_list(table: &ZendHashTable) -> bool {
    let mut entries = Iter::new(table);
    let mut position = 0;
    while let Some((key, _)) = entries.next_zval() {
        if key.long() != Some(position) {
            return false;
        }
        position += 1;
    }
    true
}

/// Binds every entry of an array as a map entry; an integer key becomes its decimal text and a
/// string key must be valid UTF-8 (VAL-14, VAL-17). With `public_only` the array holds the
/// properties of an object and the entries with mangled names are skipped.
fn table_to_map(table: &ZendHashTable, level: usize, public_only: bool) -> Result<OrderedMap, BindError> {
    let mut map = OrderedMap::with_capacity(table.len());
    let mut entries = Iter::new(table);
    while let Some((key, item)) = entries.next_zval() {
        if public_only && is_mangled(&key) {
            continue;
        }
        let key = match key.long() {
            Some(number) => number.to_string(),
            None => text_of(key.zend_str().map(ext_php_rs::types::ZendStr::as_bytes).unwrap_or_default())
                .map_err(|_| bind_error(ErrorCode::E_DATA_INVALID_UTF8, "a map key is not valid UTF-8"))?,
        };
        map.insert(key, bind_php(item, level)?);
    }
    Ok(map)
}

/// The properties of an object as `get_mangled_object_vars()` returns them. The function ignores
/// the class scope of the caller, so the public properties, the entries whose names are not
/// mangled, are the same wherever the host calls `render` (VAL-14, VAL-19).
fn properties_of(object: &Zval) -> Result<Zval, BindError> {
    call_function("get_mangled_object_vars", vec![object]).map_err(|_| unreadable_properties())
}

fn unreadable_properties() -> BindError {
    bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "the object properties cannot be read")
}

/// A private property name starts with `\0Class\0` and a protected one with `\0*\0`.
fn is_mangled(key: &Zval) -> bool {
    key.zend_str().is_some_and(|name| name.as_bytes().first() == Some(&0))
}

/// Takes the pending PHP exception, if there is one, and returns its message.
pub fn take_exception_message() -> Option<String> {
    let exception = ExecutorGlobals::take_exception()?;
    let message = exception
        .try_call_method("getMessage", vec![])
        .ok()
        .and_then(|message| message.string())
        .unwrap_or_default();
    // A failure of getMessage() leaves no exception behind that PHP would raise later.
    let _ = ExecutorGlobals::take_exception();
    Some(message)
}

/// A PHP object retained by reference. Its public properties and methods are visible; the
/// visibility comes from the declarations and not from the scope of the code that called
/// `render` (VAL-18, VAL-19).
pub struct PhpObject {
    zval: Zval,
}

impl fmt::Debug for PhpObject {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let class = self.zval.object().and_then(|object| object.get_class_name().ok()).unwrap_or_default();
        write!(formatter, "PhpObject({class})")
    }
}

impl PhpObject {
    /// The public method of the class or an ancestor under a case-insensitive name; `None` for a
    /// missing, private or protected method. `__call` is not consulted.
    fn public_method(&self, method: &str) -> Option<()> {
        let object = self.zval.object()?;
        let entry = object.get_class_entry();
        // SAFETY: the function table of a live class entry maps lower-case names to `zend_function`
        // pointers; the lookup lower-cases the name and returns null when it is absent.
        let function = unsafe {
            zend_hash_str_find_ptr_lc(&raw const entry.function_table, method.as_ptr().cast::<c_char>(), method.len()).cast::<zend_function>()
        };
        if function.is_null() {
            return None;
        }
        // SAFETY: `function` points to a function of the class entry, which outlives this call.
        let flags = unsafe { (*function).common.fn_flags };
        (flags & ZEND_ACC_PUBLIC != 0).then_some(())
    }
}

impl TemplateObject for PhpObject {
    fn member(&self, key: &str) -> Result<Option<Value>, HostError> {
        let properties = properties_of(&self.zval)?;
        let table = properties.array().ok_or_else(unreadable_properties)?;
        let mut entries = Iter::new(table);
        while let Some((name, item)) = entries.next_zval() {
            if is_mangled(&name) {
                continue;
            }
            let matches = match name.long() {
                Some(number) => number.to_string() == key,
                None => name.zend_str().is_some_and(|name| name.as_bytes() == key.as_bytes()),
            };
            if matches {
                return Ok(Some(php_to_value(item)?));
            }
        }
        Ok(None)
    }

    fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, HostError>> {
        self.public_method(method)?;
        let object = self.zval.object()?;
        let params = match args.iter().map(value_to_php).collect::<Result<Vec<Zval>, String>>() {
            Ok(params) => params,
            Err(error) => return Some(Err(HostError::Failed(error))),
        };
        let params: Vec<&dyn IntoZvalDyn> = params.iter().map(|param| param as &dyn IntoZvalDyn).collect();
        let result = object.try_call_method(method, params);
        if let Some(message) = take_exception_message() {
            return Some(Err(HostError::Failed(message)));
        }
        Some(match result {
            Ok(value) => php_to_value(&value).map_err(HostError::Data),
            Err(error) => Err(HostError::Failed(error.to_string())),
        })
    }
}

fn call_function(name: &str, params: Vec<&dyn IntoZvalDyn>) -> Result<Zval, String> {
    let function = ZendCallable::try_from_name(name).map_err(|error| error.to_string())?;
    function.try_call(params).map_err(|error| error.to_string())
}

/// Converts a PHP value into the assign data map. An empty array is an empty map.
pub fn php_to_map(zval: &Zval) -> Result<OrderedMap, BindError> {
    match php_to_value(zval)? {
        Value::Map(map) => Ok(Rc::try_unwrap(map).unwrap_or_else(|shared| (*shared).clone())),
        Value::List(list) if list.is_empty() => Ok(OrderedMap::new()),
        _ => Err(bind_error(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "assign is not a map")),
    }
}

/// Converts a template value into a PHP value. A map becomes an array with its keys as text, a
/// safe string becomes a plain string and a native object becomes the original PHP object (VAL-18).
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
        Value::Object(_) => match value.downcast_object::<PhpObject>() {
            Some(object) => object.zval.shallow_clone(),
            None => return Err("a native object of another host cannot cross the PHP extension boundary".to_string()),
        },
    };
    Ok(result)
}

fn into_zval(value: impl IntoZval) -> Result<Zval, String> {
    value.into_zval(false).map_err(|error| error.to_string())
}
