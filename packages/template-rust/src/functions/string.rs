//! upper, lower, trim, replace, split, truncate, contains, starts_with, ends_with, length (FUN-12, FUN-13).

use crate::functions::helpers::{BuiltIn, FunctionContext, FunctionError, arg_integer, arg_string, optional, type_error};
use crate::value::{Value, code_point_length, loose_equals};

fn upper(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::text(arg_string(&args[0], "upper")?.to_ascii_uppercase()))
}

fn lower(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::text(arg_string(&args[0], "lower")?.to_ascii_lowercase()))
}

fn trim(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let text = arg_string(&args[0], "trim")?;
    let chars = match optional(args, 1) {
        Some(value) => arg_string(value, "trim")?,
        None => " \t\r\n".to_string(),
    };
    let set: Vec<char> = chars.chars().collect();
    Ok(Value::text(text.trim_matches(|c| set.contains(&c)).to_string()))
}

fn replace(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let text = arg_string(&args[0], "replace")?;
    let from = arg_string(&args[1], "replace")?;
    let to = arg_string(&args[2], "replace")?;
    Ok(Value::text(if from.is_empty() { text } else { text.replace(&from, &to) }))
}

fn split(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let text = arg_string(&args[0], "split")?;
    let separator = arg_string(&args[1], "split")?;
    if separator.is_empty() {
        return Err(type_error("split requires a non-empty separator"));
    }
    Ok(Value::list(
        text.split(separator.as_str()).map(|part| Value::text(part.to_string())).collect(),
    ))
}

fn truncate(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let text = arg_string(&args[0], "truncate")?;
    let limit = arg_integer(&args[1])?;
    let suffix = match optional(args, 2) {
        Some(value) => arg_string(value, "truncate")?,
        None => "...".to_string(),
    };
    let points: Vec<char> = text.chars().collect();
    if (points.len() as i64) > limit {
        let kept: String = points.iter().take(limit.max(0) as usize).collect();
        return Ok(Value::text(format!("{kept}{suffix}")));
    }
    Ok(Value::text(text))
}

fn contains(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let haystack = &args[0];
    let needle = &args[1];
    if let Some(text) = haystack.as_text() {
        let Some(part) = needle.as_text() else {
            return Err(type_error("contains requires a string needle for a string haystack"));
        };
        return Ok(Value::Bool(text.contains(part)));
    }
    if let Value::List(list) = haystack {
        return Ok(Value::Bool(list.iter().any(|item| loose_equals(item, needle))));
    }
    Err(type_error("contains requires a string or a list"))
}

fn starts_with(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Bool(
        arg_string(&args[0], "starts_with")?.starts_with(&arg_string(&args[1], "starts_with")?),
    ))
}

fn ends_with(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Bool(
        arg_string(&args[0], "ends_with")?.ends_with(&arg_string(&args[1], "ends_with")?),
    ))
}

fn length(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    match &args[0] {
        Value::Null => Ok(Value::Number(0.0)),
        Value::Str(text) | Value::Safe(text) => Ok(Value::Number(code_point_length(text) as f64)),
        Value::List(list) => Ok(Value::Number(list.len() as f64)),
        Value::Map(map) => Ok(Value::Number(map.len() as f64)),
        _ => Err(type_error("length requires a string, list, map or null")),
    }
}

/// The string function group.
pub fn functions() -> Vec<(&'static str, BuiltIn)> {
    vec![
        (
            "upper",
            BuiltIn {
                min: 1,
                max: 1,
                call: upper,
            },
        ),
        (
            "lower",
            BuiltIn {
                min: 1,
                max: 1,
                call: lower,
            },
        ),
        (
            "trim",
            BuiltIn {
                min: 1,
                max: 2,
                call: trim,
            },
        ),
        (
            "replace",
            BuiltIn {
                min: 3,
                max: 3,
                call: replace,
            },
        ),
        (
            "split",
            BuiltIn {
                min: 2,
                max: 2,
                call: split,
            },
        ),
        (
            "truncate",
            BuiltIn {
                min: 2,
                max: 3,
                call: truncate,
            },
        ),
        (
            "contains",
            BuiltIn {
                min: 2,
                max: 2,
                call: contains,
            },
        ),
        (
            "starts_with",
            BuiltIn {
                min: 2,
                max: 2,
                call: starts_with,
            },
        ),
        (
            "ends_with",
            BuiltIn {
                min: 2,
                max: 2,
                call: ends_with,
            },
        ),
        (
            "length",
            BuiltIn {
                min: 1,
                max: 1,
                call: length,
            },
        ),
    ]
}
