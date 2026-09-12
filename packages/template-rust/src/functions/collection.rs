//! keys, values, first, last, reverse, slice, sort, join, range, default (FUN-14, FUN-15, FUN-31 to FUN-36).

use crate::error::ErrorCode;
use crate::functions::helpers::{
    BuiltIn, FunctionContext, FunctionError, arg_integer, arg_list, arg_number, arg_string, optional, stringify_arg, type_error,
};
use crate::value::{Value, compare_values};
use std::rc::Rc;

/// Maximum element count of `range` (FUN-14).
pub const RANGE_LIMIT: usize = 1_000_000;

fn lookup_path(value: &Value, path: &str) -> Value {
    let mut current = value;
    for segment in path.split('.') {
        current = match current {
            Value::Map(map) => match map.get(segment) {
                Some(next) => next,
                None => return Value::Null,
            },
            Value::List(list) if is_index(segment) => match list.get(segment.parse::<usize>().unwrap_or(usize::MAX)) {
                Some(next) => next,
                None => return Value::Null,
            },
            _ => return Value::Null,
        };
    }
    current.clone()
}

fn is_index(segment: &str) -> bool {
    segment == "0" || (segment.starts_with(|c: char| c.is_ascii_digit() && c != '0') && segment.bytes().all(|b| b.is_ascii_digit()))
}

fn sort_list(list: &[Value], key: Option<&str>) -> Result<Vec<Value>, FunctionError> {
    let keyed: Vec<(usize, Value, &Value)> = list
        .iter()
        .enumerate()
        .map(|(index, item)| {
            (
                index,
                match key {
                    Some(path) => lookup_path(item, path),
                    None => item.clone(),
                },
                item,
            )
        })
        .collect();
    let all_numbers = keyed.iter().all(|(_, sort_key, _)| matches!(sort_key, Value::Number(_)));
    let all_strings = keyed.iter().all(|(_, sort_key, _)| sort_key.is_string());
    if !all_numbers && !all_strings {
        return Err(type_error("sort requires all numbers or all strings"));
    }
    let mut sorted = keyed;
    sorted.sort_by(|a, b| compare_values(&a.1, &b.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));
    Ok(sorted.into_iter().map(|(_, _, item)| item.clone()).collect())
}

fn keys(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    match &args[0] {
        Value::Map(map) => Ok(Value::list(map.keys().map(|key| Value::text(key.clone())).collect())),
        Value::List(list) => Ok(Value::list((0..list.len()).map(|index| Value::Number(index as f64)).collect())),
        _ => Err(type_error("keys requires a map or a list")),
    }
}

fn values(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    match &args[0] {
        Value::Map(map) => Ok(Value::list(map.values().cloned().collect())),
        Value::List(list) => Ok(Value::List(Rc::clone(list))),
        _ => Err(type_error("values requires a map or a list")),
    }
}

fn first(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    match &args[0] {
        Value::List(list) => Ok(list.first().cloned().unwrap_or(Value::Null)),
        value if value.is_string() => Ok(value
            .as_text()
            .and_then(|t| t.chars().next())
            .map(|c| Value::text(c.to_string()))
            .unwrap_or(Value::Null)),
        _ => Err(type_error("first requires a list or a string")),
    }
}

fn last(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    match &args[0] {
        Value::List(list) => Ok(list.last().cloned().unwrap_or(Value::Null)),
        value if value.is_string() => Ok(value
            .as_text()
            .and_then(|t| t.chars().last())
            .map(|c| Value::text(c.to_string()))
            .unwrap_or(Value::Null)),
        _ => Err(type_error("last requires a list or a string")),
    }
}

fn reverse(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    match &args[0] {
        Value::List(list) => Ok(Value::list(list.iter().rev().cloned().collect())),
        value if value.is_string() => Ok(Value::text(value.as_text().unwrap_or("").chars().rev().collect::<String>())),
        _ => Err(type_error("reverse requires a list or a string")),
    }
}

fn slice(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let value = &args[0];
    let (items, is_list): (Vec<Value>, bool) = match value {
        Value::List(list) => ((**list).clone(), true),
        other if other.is_string() => (
            other.as_text().unwrap_or("").chars().map(|c| Value::text(c.to_string())).collect(),
            false,
        ),
        _ => return Err(type_error("slice requires a list or a string")),
    };
    let length = items.len() as i64;
    let mut from = arg_integer(&args[1])?;
    if from < 0 {
        from = (from + length).max(0);
    }
    if from >= length {
        return Ok(if is_list {
            Value::list(Vec::new())
        } else {
            Value::text(String::new())
        });
    }
    let mut count = match optional(args, 2) {
        Some(value) => arg_integer(value)?,
        None => length - from,
    };
    if count < 0 {
        count = 0;
    }
    let end = (from + count).min(length) as usize;
    let part = &items[from as usize..end];
    if is_list {
        Ok(Value::list(part.to_vec()))
    } else {
        Ok(Value::text(part.iter().filter_map(|v| v.as_text()).collect::<String>()))
    }
}

fn sort(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let list = arg_list(&args[0], "sort")?;
    let key = match optional(args, 1) {
        Some(value) => Some(arg_string(value, "sort")?),
        None => None,
    };
    Ok(Value::list(sort_list(list, key.as_deref())?))
}

fn join(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let list = arg_list(&args[0], "join")?;
    let separator = match optional(args, 1) {
        Some(value) => arg_string(value, "join")?,
        None => ",".to_string(),
    };
    let parts = list.iter().map(stringify_arg).collect::<Result<Vec<_>, _>>()?;
    Ok(Value::text(parts.join(&separator)))
}

fn range(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let start = arg_number(&args[0])?;
    let end = arg_number(&args[1])?;
    let increment = match optional(args, 2) {
        Some(value) => arg_number(value)?,
        None => 1.0,
    };
    if increment == 0.0 {
        return Err(type_error("range requires a non-zero step"));
    }
    let count = ((end - start) / increment).floor() + 1.0;
    if count > RANGE_LIMIT as f64 {
        return Err(FunctionError {
            code: ErrorCode::E_RUNTIME_LIMIT,
            message: format!("range would produce more than {RANGE_LIMIT} elements"),
        });
    }
    let mut result = Vec::new();
    let mut index = 0.0;
    while index < count {
        result.push(Value::Number(start + index * increment));
        index += 1.0;
    }
    Ok(Value::list(result))
}

fn default(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(if args[0].is_truthy() { args[0].clone() } else { args[1].clone() })
}

/// The collection function group.
pub fn functions() -> Vec<(&'static str, BuiltIn)> {
    vec![
        (
            "keys",
            BuiltIn {
                min: 1,
                max: 1,
                call: keys,
            },
        ),
        (
            "values",
            BuiltIn {
                min: 1,
                max: 1,
                call: values,
            },
        ),
        (
            "first",
            BuiltIn {
                min: 1,
                max: 1,
                call: first,
            },
        ),
        (
            "last",
            BuiltIn {
                min: 1,
                max: 1,
                call: last,
            },
        ),
        (
            "reverse",
            BuiltIn {
                min: 1,
                max: 1,
                call: reverse,
            },
        ),
        (
            "slice",
            BuiltIn {
                min: 2,
                max: 3,
                call: slice,
            },
        ),
        (
            "sort",
            BuiltIn {
                min: 1,
                max: 2,
                call: sort,
            },
        ),
        (
            "join",
            BuiltIn {
                min: 1,
                max: 2,
                call: join,
            },
        ),
        (
            "range",
            BuiltIn {
                min: 2,
                max: 3,
                call: range,
            },
        ),
        (
            "default",
            BuiltIn {
                min: 2,
                max: 2,
                call: default,
            },
        ),
    ]
}
