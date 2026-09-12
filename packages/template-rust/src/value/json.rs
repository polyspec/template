//! JSON text parsing that preserves document order and applies the number rules of VAL-12.

use crate::error::ErrorCode;
use crate::value::Value;
use crate::value::bind::{BindError, bind};

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
    let parsed: serde_json::Value = serde_json::from_str(text).map_err(|error| BindError {
        code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
        message: format!("invalid JSON: {error}"),
    })?;
    bind(&parsed)
}
