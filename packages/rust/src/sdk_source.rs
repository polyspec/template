//! Public source context; parsing keeps its implementation source private.

use crate::{ArgumentError, ErrorCode, LineIndex, Span, TemplateError};

/// Validated UTF-8 source with native byte-index projection (LEX-24).
#[derive(Debug, Clone)]
pub struct Source {
    inner: crate::source::Source,
}

impl Source {
    /// Validates bytes and removes exactly one leading byte order mark.
    pub fn from_bytes(name: &str, bytes: &[u8]) -> Result<Source, TemplateError> {
        Ok(Source {
            inner: crate::source::Source::from_bytes(name, bytes)?,
        })
    }

    /// Captures UTF-8 text using the same normalization as the byte constructor.
    pub fn from_text(name: &str, text: &str) -> Result<Source, TemplateError> {
        Self::from_bytes(name, text.as_bytes())
    }

    /// Template name supplied to the constructor.
    pub fn name(&self) -> &str {
        &self.inner.name
    }

    /// Text after removal of the leading byte order mark.
    pub fn text(&self) -> &str {
        &self.inner.text
    }

    /// UTF-8 bytes of the normalized text.
    pub fn bytes(&self) -> &[u8] {
        self.inner.bytes()
    }

    /// Byte offsets of line starts.
    pub fn lines(&self) -> &LineIndex {
        &self.inner.lines
    }

    /// Number of native byte indexes, excluding the end position.
    pub fn length(&self) -> usize {
        self.inner.text.len()
    }

    /// Maps a native byte index, including the end position, to a byte offset.
    pub fn byte_at(&self, index: usize) -> Result<usize, ArgumentError> {
        if index > self.length() {
            return Err(ArgumentError {
                message: "index is outside the source".into(),
            });
        }
        Ok(index)
    }

    /// Maps a half-open native range to its byte span.
    pub fn span(&self, start: usize, end: usize) -> Result<Span, ArgumentError> {
        if start > end {
            return Err(ArgumentError {
                message: "source range is reversed".into(),
            });
        }
        Ok([self.byte_at(start)?, self.byte_at(end)?])
    }

    /// Creates a template error at a supplied byte span, including an EOF span.
    pub fn error(&self, code: ErrorCode, start: usize, end: usize, message: impl Into<String>) -> TemplateError {
        self.inner.error(code, start, end, message)
    }
}
