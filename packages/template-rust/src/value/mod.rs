//! Value types, safe strings, truthiness, equality and ordering (docs/spec/data-model.md, expressions.md).

pub mod bind;
pub mod json;
pub mod number;

use std::cmp::Ordering;
use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;

/// Native application object exposed to a template without copying its state.
pub trait TemplateObject: fmt::Debug {
    /// Reads one public member. Missing members return `None`.
    fn member(&self, key: &str) -> Option<Value>;
    /// Calls one public instance method.
    fn call(&self, method: &str, args: &[Value]) -> Result<Value, String>;
}

/// An insertion-ordered map with string keys.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct OrderedMap {
    entries: Vec<(String, Value)>,
    index: HashMap<String, usize>,
}

impl OrderedMap {
    /// Creates an empty map.
    pub fn new() -> OrderedMap {
        OrderedMap::default()
    }

    /// Creates an empty map with room for a number of entries.
    pub fn with_capacity(capacity: usize) -> OrderedMap {
        OrderedMap {
            entries: Vec::with_capacity(capacity),
            index: HashMap::with_capacity(capacity),
        }
    }

    /// Inserts a value; an existing key keeps its position and receives the new value.
    pub fn insert(&mut self, key: String, value: Value) {
        if let Some(&position) = self.index.get(&key) {
            self.entries[position].1 = value;
        } else {
            self.index.insert(key.clone(), self.entries.len());
            self.entries.push((key, value));
        }
    }

    /// Value stored under a key.
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.index.get(key).map(|&position| &self.entries[position].1)
    }

    /// Whether the map has the key.
    pub fn contains_key(&self, key: &str) -> bool {
        self.index.contains_key(key)
    }

    /// Number of entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the map is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Entries in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&String, &Value)> {
        self.entries.iter().map(|(key, value)| (key, value))
    }

    /// Keys in insertion order.
    pub fn keys(&self) -> impl Iterator<Item = &String> {
        self.entries.iter().map(|(key, _)| key)
    }

    /// Values in insertion order.
    pub fn values(&self) -> impl Iterator<Item = &Value> {
        self.entries.iter().map(|(_, value)| value)
    }

    /// Removes a key and returns its value; later entries keep their relative order.
    pub fn remove(&mut self, key: &str) -> Option<Value> {
        let position = self.index.remove(key)?;
        let (_, value) = self.entries.remove(position);
        for (name, index) in self.index.iter_mut() {
            if *index > position {
                *index -= 1;
            }
            let _ = name;
        }
        Some(value)
    }
}

impl FromIterator<(String, Value)> for OrderedMap {
    fn from_iter<T: IntoIterator<Item = (String, Value)>>(iter: T) -> OrderedMap {
        let mut map = OrderedMap::new();
        for (key, value) in iter {
            map.insert(key, value);
        }
        map
    }
}

/// A template value (VAL-1). `Safe` is a string that the echo tag writes without escaping.
///
/// A list and a map are reference counted, so cloning a value never copies a collection.
/// Values are immutable once built; a function that changes a collection builds a new one.
#[derive(Debug, Clone)]
pub enum Value {
    /// The null value.
    Null,
    /// A boolean.
    Bool(bool),
    /// A number (IEEE 754 double).
    Number(f64),
    /// A string.
    Str(String),
    /// A safe string (VAL-6).
    Safe(String),
    /// A list.
    List(Rc<Vec<Value>>),
    /// An ordered map.
    Map(Rc<OrderedMap>),
    /// A native application object.
    Object(Rc<dyn TemplateObject>),
}

impl PartialEq for Value {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Value::Null, Value::Null) => true,
            (Value::Bool(a), Value::Bool(b)) => a == b,
            (Value::Number(a), Value::Number(b)) => a == b,
            (Value::Str(a), Value::Str(b)) | (Value::Safe(a), Value::Safe(b)) => a == b,
            (Value::List(a), Value::List(b)) => a == b,
            (Value::Map(a), Value::Map(b)) => a == b,
            (Value::Object(a), Value::Object(b)) => Rc::ptr_eq(a, b),
            _ => false,
        }
    }
}

/// Value type names of `type()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueType {
    /// null
    Null,
    /// bool
    Bool,
    /// number
    Number,
    /// string
    String,
    /// list
    List,
    /// map
    Map,
    /// object
    Object,
}

impl ValueType {
    /// Name of the type.
    pub fn name(self) -> &'static str {
        match self {
            ValueType::Null => "null",
            ValueType::Bool => "bool",
            ValueType::Number => "number",
            ValueType::String => "string",
            ValueType::List => "list",
            ValueType::Map => "map",
            ValueType::Object => "object",
        }
    }
}

impl Value {
    /// A string value from its text.
    pub fn text(text: impl Into<String>) -> Value {
        Value::Str(text.into())
    }

    /// A safe string value from its text (VAL-6).
    pub fn safe_text(text: impl Into<String>) -> Value {
        Value::Safe(text.into())
    }

    /// A list value from its elements.
    pub fn list(items: Vec<Value>) -> Value {
        Value::List(Rc::new(items))
    }

    /// A map value from its entries.
    pub fn map(entries: OrderedMap) -> Value {
        Value::Map(Rc::new(entries))
    }

    /// Creates a value that retains the original application object.
    pub fn object(object: impl TemplateObject + 'static) -> Value {
        Value::Object(Rc::new(object))
    }

    /// The type of the value.
    pub fn value_type(&self) -> ValueType {
        match self {
            Value::Null => ValueType::Null,
            Value::Bool(_) => ValueType::Bool,
            Value::Number(_) => ValueType::Number,
            Value::Str(_) | Value::Safe(_) => ValueType::String,
            Value::List(_) => ValueType::List,
            Value::Map(_) => ValueType::Map,
            Value::Object(_) => ValueType::Object,
        }
    }

    /// The text of a string or safe string.
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Value::Str(text) | Value::Safe(text) => Some(text),
            _ => None,
        }
    }

    /// Whether the value is a string or a safe string.
    pub fn is_string(&self) -> bool {
        matches!(self, Value::Str(_) | Value::Safe(_))
    }

    /// EXP-33 truthiness.
    pub fn is_truthy(&self) -> bool {
        match self {
            Value::Null => false,
            Value::Bool(value) => *value,
            Value::Number(value) => *value != 0.0,
            Value::Str(text) | Value::Safe(text) => !text.is_empty(),
            Value::List(list) => !list.is_empty(),
            Value::Map(map) => !map.is_empty(),
            Value::Object(_) => true,
        }
    }
}

/// Number of Unicode code points of a string (VAL-5).
pub fn code_point_length(text: &str) -> usize {
    text.chars().count()
}

/// Compares two strings by code point sequence.
pub fn compare_code_points(a: &str, b: &str) -> Ordering {
    a.chars().cmp(b.chars())
}

fn is_ascii_space(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\r' | b'\n')
}

/// Numeric value of a string under the conversion grammar of EXP-23, or None.
pub fn parse_numeric_string(text: &str) -> Option<f64> {
    let trimmed = text.trim_matches(|c: char| c.is_ascii() && is_ascii_space(c as u8));
    let bytes = trimmed.as_bytes();
    let mut i = 0;
    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }
    let digits_start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    let integer_digits = i - digits_start;
    let mut fraction_digits = 0;
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        fraction_digits = i - start;
    }
    if integer_digits == 0 && fraction_digits == 0 {
        return None;
    }
    if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
        i += 1;
        if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
            i += 1;
        }
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return None;
        }
    }
    if i != bytes.len() {
        return None;
    }
    let parsed: f64 = trimmed.parse().ok()?;
    if parsed.is_finite() { Some(parsed) } else { None }
}

/// EXP-34, EXP-35 loose equality.
pub fn loose_equals(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(n), other) | (other, Value::Number(n)) if other.is_string() => {
            match parse_numeric_string(other.as_text().unwrap_or("")) {
                Some(parsed) => parsed == *n,
                None => false,
            }
        }
        _ => a.value_type() == b.value_type() && same_type_equals(a, b),
    }
}

/// EXP-37 strict equality.
pub fn strict_equals(a: &Value, b: &Value) -> bool {
    a.value_type() == b.value_type() && same_type_equals(a, b)
}

fn same_type_equals(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(x), Value::Bool(y)) => x == y,
        (Value::Number(x), Value::Number(y)) => x == y,
        (Value::List(x), Value::List(y)) => x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| loose_equals(p, q)),
        (Value::Map(x), Value::Map(y)) => {
            x.len() == y.len()
                && x.iter()
                    .all(|(key, value)| y.get(key).is_some_and(|other| loose_equals(value, other)))
        }
        _ => match (a.as_text(), b.as_text()) {
            (Some(x), Some(y)) => x == y,
            _ => false,
        },
    }
}

/// EXP-38 ordering; None when the pair has no order.
pub fn compare_values(a: &Value, b: &Value) -> Option<Ordering> {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.partial_cmp(y),
        _ => match (a.as_text(), b.as_text()) {
            (Some(x), Some(y)) => Some(compare_code_points(x, y)),
            _ => None,
        },
    }
}

/// Error of VAL-8 for a list or map.
#[derive(Debug)]
pub struct StringifyError;

/// VAL-8: converts a value to text.
pub fn stringify(value: &Value) -> Result<String, StringifyError> {
    match value {
        Value::Null => Ok(String::new()),
        Value::Bool(true) => Ok("true".to_string()),
        Value::Bool(false) => Ok("false".to_string()),
        Value::Number(n) => Ok(number::number_to_string(*n)),
        Value::Str(text) | Value::Safe(text) => Ok(text.to_string()),
        Value::List(_) | Value::Map(_) | Value::Object(_) => Err(StringifyError),
    }
}
