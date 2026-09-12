//! escape, raw, json, url, nl2br, str, type (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to FUN-30).

use crate::escape::escape_html;
use crate::functions::helpers::{BuiltIn, FunctionContext, FunctionError, arg_string, stringify_arg};
use crate::value::Value;
use crate::value::number::number_to_string;

fn json_string(text: &str) -> String {
    let mut result = String::from("\"");
    for char in text.chars() {
        match char {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            '\u{8}' => result.push_str("\\b"),
            '\u{c}' => result.push_str("\\f"),
            '<' => result.push_str("\\u003c"),
            '>' => result.push_str("\\u003e"),
            '&' => result.push_str("\\u0026"),
            '\u{2028}' => result.push_str("\\u2028"),
            '\u{2029}' => result.push_str("\\u2029"),
            other if (other as u32) < 0x20 => result.push_str(&format!("\\u{:04x}", other as u32)),
            other => result.push(other),
        }
    }
    result.push('"');
    result
}

/// FUN-26 to FUN-28: compact JSON text of a value.
pub fn to_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(true) => "true".to_string(),
        Value::Bool(false) => "false".to_string(),
        Value::Number(number) => number_to_string(*number),
        Value::Str(text) | Value::Safe(text) => json_string(text),
        Value::List(list) => format!("[{}]", list.iter().map(to_json).collect::<Vec<_>>().join(",")),
        Value::Map(map) => {
            let parts: Vec<String> = map
                .iter()
                .map(|(key, value)| format!("{}:{}", json_string(key), to_json(value)))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
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
    Ok(Value::text(to_json(&args[0])))
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
