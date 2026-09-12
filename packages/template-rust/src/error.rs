//! Error object and error codes as defined in docs/spec/errors.md.

use serde::Serialize;
use std::fmt;

/// Error codes of the specification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[allow(non_camel_case_types, missing_docs)]
pub enum ErrorCode {
    E_LEX_INVALID_UTF8,
    E_PARSE_UNTERMINATED_TAG,
    E_PARSE_UNTERMINATED_COMMENT,
    E_PARSE_UNTERMINATED_STRING,
    E_PARSE_UNEXPECTED_TOKEN,
    E_PARSE_INVALID_NUMBER,
    E_PARSE_INVALID_ESCAPE,
    E_PARSE_UNEXPECTED_CLOSE,
    E_PARSE_UNCLOSED_BLOCK,
    E_PARSE_ELSE_OUTSIDE_BLOCK,
    E_PARSE_DUPLICATE_ELSE,
    E_PARSE_ELSEIF_AFTER_ELSE,
    E_PARSE_ELSEIF_NOT_IN_IF,
    E_PARSE_RESERVED_NAME,
    E_PARSE_INVALID_PATH,
    E_PARSE_INVALID_BLOCK_TAG,
    E_PARSE_INVALID_WRAPPER,
    E_PARSE_INVALID_DIRECTIVE,
    E_LOAD_NOT_FOUND,
    E_LOAD_CYCLE,
    E_LOAD_OUTSIDE_ROOT,
    E_DATA_NUMBER_RANGE,
    E_DATA_NUMBER_NOT_FINITE,
    E_DATA_INVALID_UTF8,
    E_DATA_UNSUPPORTED_TYPE,
    E_RUNTIME_TYPE,
    E_RUNTIME_COMPARE,
    E_RUNTIME_DIV_ZERO,
    E_RUNTIME_STRINGIFY,
    E_RUNTIME_UNKNOWN_FUNCTION,
    E_RUNTIME_ARITY,
    E_RUNTIME_HOST_FUNCTION,
    E_RUNTIME_UNKNOWN_LOOP,
    E_RUNTIME_BLOCK_UNDEFINED,
    E_RUNTIME_BLOCK_REDEFINED,
    E_RUNTIME_DEPTH,
    E_RUNTIME_LIMIT,
}

impl ErrorCode {
    /// The code as its specification name.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::E_LEX_INVALID_UTF8 => "E_LEX_INVALID_UTF8",
            ErrorCode::E_PARSE_UNTERMINATED_TAG => "E_PARSE_UNTERMINATED_TAG",
            ErrorCode::E_PARSE_UNTERMINATED_COMMENT => "E_PARSE_UNTERMINATED_COMMENT",
            ErrorCode::E_PARSE_UNTERMINATED_STRING => "E_PARSE_UNTERMINATED_STRING",
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN => "E_PARSE_UNEXPECTED_TOKEN",
            ErrorCode::E_PARSE_INVALID_NUMBER => "E_PARSE_INVALID_NUMBER",
            ErrorCode::E_PARSE_INVALID_ESCAPE => "E_PARSE_INVALID_ESCAPE",
            ErrorCode::E_PARSE_UNEXPECTED_CLOSE => "E_PARSE_UNEXPECTED_CLOSE",
            ErrorCode::E_PARSE_UNCLOSED_BLOCK => "E_PARSE_UNCLOSED_BLOCK",
            ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK => "E_PARSE_ELSE_OUTSIDE_BLOCK",
            ErrorCode::E_PARSE_DUPLICATE_ELSE => "E_PARSE_DUPLICATE_ELSE",
            ErrorCode::E_PARSE_ELSEIF_AFTER_ELSE => "E_PARSE_ELSEIF_AFTER_ELSE",
            ErrorCode::E_PARSE_ELSEIF_NOT_IN_IF => "E_PARSE_ELSEIF_NOT_IN_IF",
            ErrorCode::E_PARSE_RESERVED_NAME => "E_PARSE_RESERVED_NAME",
            ErrorCode::E_PARSE_INVALID_PATH => "E_PARSE_INVALID_PATH",
            ErrorCode::E_PARSE_INVALID_BLOCK_TAG => "E_PARSE_INVALID_BLOCK_TAG",
            ErrorCode::E_PARSE_INVALID_WRAPPER => "E_PARSE_INVALID_WRAPPER",
            ErrorCode::E_PARSE_INVALID_DIRECTIVE => "E_PARSE_INVALID_DIRECTIVE",
            ErrorCode::E_LOAD_NOT_FOUND => "E_LOAD_NOT_FOUND",
            ErrorCode::E_LOAD_CYCLE => "E_LOAD_CYCLE",
            ErrorCode::E_LOAD_OUTSIDE_ROOT => "E_LOAD_OUTSIDE_ROOT",
            ErrorCode::E_DATA_NUMBER_RANGE => "E_DATA_NUMBER_RANGE",
            ErrorCode::E_DATA_NUMBER_NOT_FINITE => "E_DATA_NUMBER_NOT_FINITE",
            ErrorCode::E_DATA_INVALID_UTF8 => "E_DATA_INVALID_UTF8",
            ErrorCode::E_DATA_UNSUPPORTED_TYPE => "E_DATA_UNSUPPORTED_TYPE",
            ErrorCode::E_RUNTIME_TYPE => "E_RUNTIME_TYPE",
            ErrorCode::E_RUNTIME_COMPARE => "E_RUNTIME_COMPARE",
            ErrorCode::E_RUNTIME_DIV_ZERO => "E_RUNTIME_DIV_ZERO",
            ErrorCode::E_RUNTIME_STRINGIFY => "E_RUNTIME_STRINGIFY",
            ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION => "E_RUNTIME_UNKNOWN_FUNCTION",
            ErrorCode::E_RUNTIME_ARITY => "E_RUNTIME_ARITY",
            ErrorCode::E_RUNTIME_HOST_FUNCTION => "E_RUNTIME_HOST_FUNCTION",
            ErrorCode::E_RUNTIME_UNKNOWN_LOOP => "E_RUNTIME_UNKNOWN_LOOP",
            ErrorCode::E_RUNTIME_BLOCK_UNDEFINED => "E_RUNTIME_BLOCK_UNDEFINED",
            ErrorCode::E_RUNTIME_BLOCK_REDEFINED => "E_RUNTIME_BLOCK_REDEFINED",
            ErrorCode::E_RUNTIME_DEPTH => "E_RUNTIME_DEPTH",
            ErrorCode::E_RUNTIME_LIMIT => "E_RUNTIME_LIMIT",
        }
    }
}

/// A byte span `[start, end)`.
pub type Span = [usize; 2];

/// Byte offsets of line starts, used to convert a byte offset into line and column (ERR-2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    /// Restores a verified line index stored in a compiled artifact.
    pub fn from_starts(starts: Vec<usize>) -> LineIndex {
        assert!(starts.first() == Some(&0), "a line index must start at byte zero");
        assert!(starts.windows(2).all(|pair| pair[0] < pair[1]), "line starts must increase");
        LineIndex { starts }
    }

    /// Builds the line index of a byte sequence.
    pub fn of(bytes: &[u8]) -> LineIndex {
        let mut starts = vec![0];
        for (i, byte) in bytes.iter().enumerate() {
            if *byte == b'\n' {
                starts.push(i + 1);
            }
        }
        LineIndex { starts }
    }

    /// 1-based line and byte column of a byte offset.
    pub fn position(&self, offset: usize) -> (usize, usize) {
        let mut low = 0;
        let mut high = self.starts.len() - 1;
        while low < high {
            let mid = (low + high).div_ceil(2);
            if self.starts[mid] <= offset {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        (low + 1, offset - self.starts[low] + 1)
    }
}

/// The error object of ERR-1.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TemplateError {
    /// Error code.
    pub code: ErrorCode,
    /// Name of the template in which the error is located.
    pub template: String,
    /// 1-based line, or 0 when the error has no position.
    pub line: usize,
    /// 1-based byte column, or 0 when the error has no position.
    pub col: usize,
    /// Start byte offset of the related token or node.
    pub offset: usize,
    /// End byte offset of the related token or node.
    pub end: usize,
    /// Free text.
    pub message: String,
}

impl TemplateError {
    /// Creates an error located at a byte span of a template with a known line index.
    pub fn at(code: ErrorCode, template: &str, lines: Option<&LineIndex>, span: Span, message: impl Into<String>) -> TemplateError {
        let (line, col) = match lines {
            Some(lines) => lines.position(span[0]),
            None => (0, 0),
        };
        TemplateError {
            code,
            template: template.to_string(),
            line,
            col,
            offset: span[0],
            end: span[1],
            message: message.into(),
        }
    }

    /// Creates an error without a source position (ERR-5, ERR-6).
    pub fn without_position(code: ErrorCode, template: &str, message: impl Into<String>) -> TemplateError {
        TemplateError {
            code,
            template: template.to_string(),
            line: 0,
            col: 0,
            offset: 0,
            end: 0,
            message: message.into(),
        }
    }
}

impl fmt::Display for TemplateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} in {} at {}:{}: {}",
            self.code.as_str(),
            self.template,
            self.line,
            self.col,
            self.message
        )
    }
}

impl std::error::Error for TemplateError {}
