//! JSON text parsing that preserves document order and applies VAL-2, VAL-12 and VAL-20.

use crate::error::ErrorCode;
use crate::value::Value;
use crate::value::bind::{BindError, bind, check_level, check_number};

/// Parses JSON bytes into a template value. Invalid UTF-8 is `E_DATA_INVALID_UTF8`; a syntax
/// error is `E_DATA_UNSUPPORTED_TYPE`.
pub fn parse_json_bytes(bytes: &[u8]) -> Result<Value, BindError> {
    let text = std::str::from_utf8(bytes).map_err(|error| BindError {
        code: ErrorCode::E_DATA_INVALID_UTF8,
        message: format!("invalid UTF-8 at byte {}", error.valid_up_to()),
    })?;
    parse_json(text)
}

/// Parses JSON text into a template value.
pub fn parse_json(text: &str) -> Result<Value, BindError> {
    bind(&read_json(text)?)
}

/// Parses JSON text into a `serde_json::Value` after the checks of VAL-2, VAL-12 and VAL-20, in
/// document order: a number outside the binding range, a `\u` escape that leaves a surrogate
/// unpaired and arrays or objects nested deeper than the limit fail at the first occurrence. The
/// checks run before `serde_json` reads the text, so a deep document never reaches the recursion
/// limit of `serde_json`. A syntax error is `E_DATA_UNSUPPORTED_TYPE`.
pub fn read_json(text: &str) -> Result<serde_json::Value, BindError> {
    check_json(text)?;
    serde_json::from_str(text).map_err(|error| BindError {
        code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        message: format!("invalid JSON: {error}"),
    })
}

/// Applies the checks of [`read_json`] without building a value. A caller that parses the text
/// with `serde_json` itself calls this first.
pub fn check_json(text: &str) -> Result<(), BindError> {
    let bytes = text.as_bytes();
    let mut level = 0usize;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'[' | b'{' => {
                level += 1;
                check_level(level)?;
            }
            b']' | b'}' => level = level.saturating_sub(1),
            b'"' => index = check_string(bytes, index + 1)?,
            b'-' | b'0'..=b'9' => {
                let start = index;
                while index + 1 < bytes.len() && matches!(bytes[index + 1], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
                    index += 1;
                }
                // The token is ASCII, so the slice is valid UTF-8; a malformed token is left to the parser.
                if let Some(value) = std::str::from_utf8(&bytes[start..=index])
                    .ok()
                    .and_then(|literal| literal.parse::<f64>().ok())
                {
                    check_number(value)?;
                }
            }
            _ => {}
        }
        index += 1;
    }
    Ok(())
}

/// Checks the escapes of one string that starts after its opening quote and returns the index of
/// its closing quote, or the end of the text.
fn check_string(bytes: &[u8], start: usize) -> Result<usize, BindError> {
    let mut index = start;
    let mut pending_high = false;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => break,
            b'\\' if bytes.get(index + 1) == Some(&b'u') => {
                let unit = bytes
                    .get(index + 2..index + 6)
                    .and_then(|hex| std::str::from_utf8(hex).ok())
                    .and_then(|hex| u16::from_str_radix(hex, 16).ok());
                match unit {
                    Some(unit) if (0xd800..=0xdbff).contains(&unit) => {
                        if pending_high {
                            return Err(unpaired());
                        }
                        pending_high = true;
                    }
                    Some(unit) if (0xdc00..=0xdfff).contains(&unit) => {
                        if !pending_high {
                            return Err(unpaired());
                        }
                        pending_high = false;
                    }
                    _ => {
                        if pending_high {
                            return Err(unpaired());
                        }
                    }
                }
                index += 6;
                continue;
            }
            b'\\' => {
                if pending_high {
                    return Err(unpaired());
                }
                index += 2;
                continue;
            }
            _ => {
                if pending_high {
                    return Err(unpaired());
                }
            }
        }
        index += 1;
    }
    if pending_high {
        return Err(unpaired());
    }
    Ok(index)
}

fn unpaired() -> BindError {
    BindError {
        code: ErrorCode::E_DATA_INVALID_UTF8,
        message: "a \\u escape leaves a surrogate unpaired".to_string(),
    }
}
