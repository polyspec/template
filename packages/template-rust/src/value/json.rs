//! JSON text parsing that preserves document order and applies VAL-2, VAL-12 and VAL-20.

use crate::error::ErrorCode;
use crate::value::Value;
use crate::value::bind::{BindError, bind, check_level, check_number};

/// Parses JSON bytes into a template value. Invalid UTF-8 is `E_DATA_INVALID_UTF8`; text that is
/// not one JSON document is `E_DATA_INVALID_JSON` (VAL-12).
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

/// Parses JSON text into a `serde_json::Value` with the checks of VAL-2, VAL-12 and VAL-20, in
/// document order: a number outside the binding range, a `\u` escape that leaves a surrogate
/// unpaired, arrays or objects nested deeper than the limit and text that is not one JSON document
/// (`E_DATA_INVALID_JSON`) fail at the first occurrence. The value checks run before `serde_json`
/// reads the text, so a deep document never reaches the recursion limit of `serde_json`.
pub fn read_json(text: &str) -> Result<serde_json::Value, BindError> {
    if let Err((offset, error)) = check_values(text) {
        // The check stops at the start of the first violating token; a syntax error before that
        // token is the earlier violation. The token starts with an ASCII byte, so the offset is a
        // character boundary.
        if let Err(syntax) = serde_json::from_str::<serde::de::IgnoredAny>(&text[..offset])
            && syntax.classify() != serde_json::error::Category::Eof
        {
            return Err(invalid_json(&syntax));
        }
        return Err(error);
    }
    serde_json::from_str(text).map_err(|error| invalid_json(&error))
}

/// VAL-12: a document that `serde_json` rejects is `E_DATA_INVALID_JSON`.
fn invalid_json(error: &serde_json::Error) -> BindError {
    BindError {
        code: ErrorCode::E_DATA_INVALID_JSON,
        message: format!("invalid JSON: {error}"),
    }
}

/// Applies the value checks of [`read_json`] without building a value and returns the byte offset
/// of the first violating token with its error.
fn check_values(text: &str) -> Result<(), (usize, BindError)> {
    let bytes = text.as_bytes();
    let mut level = 0usize;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'[' | b'{' => {
                level += 1;
                check_level(level).map_err(|error| (index, error))?;
            }
            b']' | b'}' => level = level.saturating_sub(1),
            b'"' => {
                let start = index;
                index = check_string(bytes, index + 1).map_err(|error| (start, error))?;
            }
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
                    check_number(value).map_err(|error| (start, error))?;
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
