//! HTML escaping (RT-32, FUN-10).

use std::borrow::Cow;

fn replacement(byte: u8) -> Option<&'static str> {
    match byte {
        b'&' => Some("&amp;"),
        b'<' => Some("&lt;"),
        b'>' => Some("&gt;"),
        b'"' => Some("&quot;"),
        b'\'' => Some("&#39;"),
        _ => None,
    }
}

/// Replaces `& < > " '` with their character references. Text that needs no replacement is
/// borrowed, so the common case copies nothing.
pub fn escape_html(text: &str) -> Cow<'_, str> {
    let bytes = text.as_bytes();
    let Some(first) = bytes.iter().position(|&byte| replacement(byte).is_some()) else {
        return Cow::Borrowed(text);
    };
    let mut result = String::with_capacity(text.len() + 16);
    result.push_str(&text[..first]);
    for (offset, &byte) in bytes.iter().enumerate().skip(first) {
        match replacement(byte) {
            Some(entity) => result.push_str(entity),
            None => result.push_str(&text[offset..offset + 1]),
        }
    }
    Cow::Owned(result)
}
