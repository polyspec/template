//! JSON text parsing that preserves document order and applies VAL-2, VAL-12 and VAL-20. The JSON reader is the one of
//! ordered-json; this module adds the value checks of the data model and reports the first violation in document order.

use crate::error::ErrorCode;
use crate::value::Value;
use crate::value::bind::{BindError, bind_json, check_level, check_number};
use polyspec_ordered_json::{Error as JsonError, ParseOptions, parse};

/// Parses JSON bytes into a template value. Invalid UTF-8 is `data_invalid_utf8`; text that is
/// not one JSON document is `data_invalid_json` (VAL-12).
pub fn parse_json_bytes(bytes: &[u8]) -> Result<Value, BindError> {
    let text = std::str::from_utf8(bytes).map_err(|error| BindError {
        code: ErrorCode::E_DATA_INVALID_UTF8,
        message: format!("invalid UTF-8 at byte {}", error.valid_up_to()),
    })?;
    parse_json(text)
}

/// Parses JSON text into a template value.
pub fn parse_json(text: &str) -> Result<Value, BindError> {
    bind_json(&read_json(text)?)
}

/// Parses JSON text into an ordered-json value with the checks of VAL-2, VAL-12 and VAL-20, in document order: a number
/// outside the binding range, a `\u` escape that leaves a surrogate unpaired, arrays or objects nested deeper than the
/// limit and text that is not one JSON document (`data_invalid_json`) fail at the first occurrence. The parser stops
/// at the 65th level of nesting (VAL-20), so a deep document is never read further.
pub fn read_json(text: &str) -> Result<polyspec_ordered_json::Value, BindError> {
    let checked = check_values(text);
    let depth = match u64::try_from(crate::value::MAX_DEPTH) {
        Ok(depth) => depth,
        Err(error) => {
            return Err(BindError {
                code: ErrorCode::E_INTERNAL,
                message: format!("the depth limit does not fit u64: {error}"),
            });
        }
    };
    let parsed = parse(
        text.as_bytes(),
        &ParseOptions {
            max_depth: Some(depth),
            reject_duplicates: Some(false),
        },
    );
    match (parsed, checked) {
        (Ok(value), Ok(())) => Ok(value),
        (Ok(_), Err((_, error))) => Err(error),
        (Err(error), Ok(())) => Err(json_failure(&error)),
        // VAL-12: the first violation in document order; a value check and a rejection of the grammar at the same
        // token are reported as the value check, which names its rule.
        (Err(error), Err((offset, checked))) => match error.offset() {
            Some(at) if at < offset => Err(json_failure(&error)),
            _ => Err(checked),
        },
    }
}

/// VAL-12, VAL-20: a document that the JSON reader rejects is `data_invalid_json`, a document nested deeper than the
/// limit is `data_depth`, and an error that is not a rejection of the text is a broken invariant, `internal`.
fn json_failure(error: &JsonError) -> BindError {
    let code = match error {
        JsonError::MaximumDepthExceeded { .. } => ErrorCode::E_DATA_DEPTH,
        JsonError::InvalidUtf8 { .. } => ErrorCode::E_DATA_INVALID_UTF8,
        _ if error.offset().is_some() => ErrorCode::E_DATA_INVALID_JSON,
        _ => ErrorCode::E_INTERNAL,
    };
    BindError {
        code,
        message: format!("invalid JSON: {error}"),
    }
}

/// Applies the value checks of [`read_json`] without building a value and returns the byte offset
/// of the first violating token with its error.
fn check_values(text: &str) -> Result<(), (u64, BindError)> {
    check_tokens(text).map_err(|(offset, error)| match u64::try_from(offset) {
        Ok(offset) => (offset, error),
        // An offset beyond u64 is beyond every rejection of the reader.
        Err(_) => (u64::MAX, error),
    })
}

fn check_tokens(text: &str) -> Result<(), (usize, BindError)> {
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
                if let Ok(Ok(value)) = std::str::from_utf8(&bytes[start..=index]).map(|literal| literal.parse::<f64>()) {
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
                // Not four hex digits is no unit: the escape is then judged by the rest of this check, as before.
                let unit = match bytes
                    .get(index + 2..index + 6)
                    .map(|hex| std::str::from_utf8(hex).map(|hex| u16::from_str_radix(hex, 16)))
                {
                    Some(Ok(Ok(unit))) => Some(unit),
                    _ => None,
                };
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
