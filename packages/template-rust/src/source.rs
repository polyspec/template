//! Template source: UTF-8 validation and BOM removal (LEX-1, LEX-2). Offsets are byte offsets.

use crate::error::{ErrorCode, LineIndex, TemplateError};

/// A validated template source.
#[derive(Debug, Clone)]
pub struct Source {
    /// Template name used in errors and in the AST.
    pub name: String,
    /// Source text after BOM removal.
    pub text: String,
    /// Line index of the text.
    pub lines: LineIndex,
}

impl Source {
    /// Builds a source from bytes; rejects invalid UTF-8 and removes a leading BOM.
    pub fn from_bytes(name: &str, input: &[u8]) -> Result<Source, TemplateError> {
        if let Err(error) = std::str::from_utf8(input) {
            let invalid = error.valid_up_to();
            return Err(TemplateError::at(
                ErrorCode::E_LEX_INVALID_UTF8,
                name,
                Some(&LineIndex::of(input)),
                [invalid, invalid + 1],
                format!("invalid UTF-8 byte at offset {invalid}"),
            ));
        }
        let bytes = if input.starts_with(&[0xef, 0xbb, 0xbf]) {
            &input[3..]
        } else {
            input
        };
        let text = String::from_utf8(bytes.to_vec()).expect("validated");
        Ok(Source {
            name: name.to_string(),
            lines: LineIndex::of(bytes),
            text,
        })
    }

    /// Builds a source from a string; removes a leading BOM.
    pub fn from_text(name: &str, text: &str) -> Source {
        let stripped = text.strip_prefix('\u{feff}').unwrap_or(text);
        Source {
            name: name.to_string(),
            lines: LineIndex::of(stripped.as_bytes()),
            text: stripped.to_string(),
        }
    }

    /// The bytes of the text.
    pub fn bytes(&self) -> &[u8] {
        self.text.as_bytes()
    }

    /// Creates an error at a byte span of this source.
    pub fn error(&self, code: ErrorCode, start: usize, end: usize, message: impl Into<String>) -> TemplateError {
        TemplateError::at(code, &self.name, Some(&self.lines), [start, end], message)
    }
}
