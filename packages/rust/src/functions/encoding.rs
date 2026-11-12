//! escape, raw, json, url, nl2br, str, type (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to FUN-30).

use crate::error::ErrorCode;
use crate::escape::escape_html;
use crate::functions::helpers::{BuiltIn, FunctionContext, FunctionError, arg_string, internal, stringify_arg, type_error};
use crate::value::Value;
use crate::value::bind::to_json_value;
use polyspec_ordered_json::{StringifyOptions, stringify};

/// FUN-26 to FUN-28: compact JSON text of a value, written by the JSON serializer of ordered-json with its HTML-safe
/// escapes (FUN-27). A native object is opaque (VAL-19) and has no JSON text, so a value that is or holds one fails with
/// `E_RUNTIME_TYPE`.
pub fn to_json(value: &Value) -> Result<String, FunctionError> {
    let json = to_json_value(value).map_err(|error| match error.code {
        ErrorCode::E_DATA_UNSUPPORTED_TYPE => type_error("json does not accept a native object"),
        _ => internal(&error),
    })?;
    Ok(stringify(&json, &StringifyOptions { html_safe: Some(true) }))
}

/// FUN-29: percent-encodes every byte except the unreserved characters.
pub fn percent_encode(text: &str) -> String {
    let mut result = String::new();
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            result.push(byte as char);
        } else {
            result.push_str(&format!("%{byte:02X}"));
        }
    }
    result
}

fn escape(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::safe_text(escape_html(&stringify_arg(&args[0])?).into_owned()))
}

fn raw(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::safe_text(stringify_arg(&args[0])?))
}

fn json(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::text(to_json(&args[0])?))
}

fn url(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::text(percent_encode(&stringify_arg(&args[0])?)))
}

fn nl2br(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let text = arg_string(&args[0], "nl2br")?;
    Ok(Value::text(text.replace("\r\n", "\n").replace('\n', "<br>\n")))
}

fn str_function(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::text(stringify_arg(&args[0])?))
}

fn type_function(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::text(args[0].value_type().name().to_string()))
}

/// The encoding function group.
pub fn functions() -> Vec<(&'static str, BuiltIn)> {
    vec![
        (
            "escape",
            BuiltIn {
                min: 1,
                max: 1,
                call: escape,
            },
        ),
        ("raw", BuiltIn { min: 1, max: 1, call: raw }),
        (
            "json",
            BuiltIn {
                min: 1,
                max: 1,
                call: json,
            },
        ),
        ("url", BuiltIn { min: 1, max: 1, call: url }),
        (
            "nl2br",
            BuiltIn {
                min: 1,
                max: 1,
                call: nl2br,
            },
        ),
        (
            "str",
            BuiltIn {
                min: 1,
                max: 1,
                call: str_function,
            },
        ),
        (
            "type",
            BuiltIn {
                min: 1,
                max: 1,
                call: type_function,
            },
        ),
    ]
}
