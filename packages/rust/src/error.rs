//! Error object and error codes as defined in docs/spec/errors.md.

use serde::Serialize;
use std::fmt;

/// Error codes of the specification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[expect(
    non_camel_case_types,
    reason = "the variants are the error codes of the specification by their exact names"
)]
pub enum ErrorCode {
    // BEGIN GENERATED ERROR CODES
    /// The source is not valid UTF-8.
    E_LEX_INVALID_UTF8,
    /// A tag has no closing `}` before the end of the file.
    E_PARSE_UNTERMINATED_TAG,
    /// A comment has no `*}` before the end of the file.
    E_PARSE_UNTERMINATED_COMMENT,
    /// A string literal has no closing quote before the end of the tag.
    E_PARSE_UNTERMINATED_STRING,
    /// A token is not allowed by the grammar at its position, including an empty expression.
    E_PARSE_UNEXPECTED_TOKEN,
    /// A number literal does not match the number token.
    E_PARSE_INVALID_NUMBER,
    /// A backslash in a string literal is followed by a character outside the escape set.
    E_PARSE_INVALID_ESCAPE,
    /// `{/}` appears with no open block.
    E_PARSE_UNEXPECTED_CLOSE,
    /// The file ends while a block is open.
    E_PARSE_UNCLOSED_BLOCK,
    /// `{:}` or `{:? ...}` appears with no open block.
    E_PARSE_ELSE_OUTSIDE_BLOCK,
    /// A second `{:}` appears in the same block.
    E_PARSE_DUPLICATE_ELSE,
    /// `{:? ...}` appears after `{:}` in the same block.
    E_PARSE_ELSEIF_AFTER_ELSE,
    /// `{:? ...}` appears directly inside a loop block or an if-block.
    E_PARSE_ELSEIF_NOT_IN_IF,
    /// An assignment target or loop variable is a reserved word.
    E_PARSE_RESERVED_NAME,
    /// An include or block path is not a path token.
    E_PARSE_INVALID_PATH,
    /// The tokens of a block tag do not match the block tag grammar.
    E_PARSE_INVALID_BLOCK_TAG,
    /// The `}}` of a wrapped tag is not followed by the wrapper closer that matches the wrapper opener.
    E_PARSE_INVALID_WRAPPER,
    /// A delimiter directive is not the first tag of the file, names a character that is not a delimiter, or has another form.
    E_PARSE_INVALID_DIRECTIVE,
    /// The loader has no template for the resolved name.
    E_LOAD_NOT_FOUND,
    /// An include or block renders a template that is already being rendered in the same chain.
    E_LOAD_CYCLE,
    /// A resolved path leaves the loader root.
    E_LOAD_OUTSIDE_ROOT,
    /// The loader reports a failure for the resolved name (RT-9): a TypeScript or PHP loader throws an exception, a Go or Rust loader returns an error, or a filesystem loader cannot read an existing regular file (RT-10).
    E_LOAD_FAILED,
    /// A finite number has a magnitude greater than 2^53 − 1 (VAL-2).
    E_DATA_NUMBER_RANGE,
    /// A number is NaN or infinite.
    E_DATA_NUMBER_NOT_FINITE,
    /// A string or a map key is not valid Unicode text (VAL-12 to VAL-17).
    E_DATA_INVALID_UTF8,
    /// A value has a type that has no binding.
    E_DATA_UNSUPPORTED_TYPE,
    /// Lists and maps are nested deeper than the binding depth limit, including a cyclic host structure (VAL-20).
    E_DATA_DEPTH,
    /// JSON text of assign data, template definitions or the environment is not one JSON document (VAL-12).
    E_DATA_INVALID_JSON,
    /// An operand or argument has a type the operation does not accept.
    E_RUNTIME_TYPE,
    /// An ordering comparison has operands without an order.
    E_RUNTIME_COMPARE,
    /// The right operand of `/` or `%` is zero.
    E_RUNTIME_DIV_ZERO,
    /// A list or map is converted to a string.
    E_RUNTIME_STRINGIFY,
    /// A call names a function that is neither built in nor registered.
    E_RUNTIME_UNKNOWN_FUNCTION,
    /// A call has an argument count outside the function's range.
    E_RUNTIME_ARITY,
    /// Host code that the engine called reported an error (FUN-46, VAL-14, VAL-19): a registered function, a logical class function, an instance method, a member accessor, or `jsonSerialize()`.
    E_RUNTIME_HOST_FUNCTION,
    /// A loop meta names a loop that is not enclosing the expression.
    E_RUNTIME_UNKNOWN_LOOP,
    /// `{# id}` names an id that the template definition registry does not contain.
    E_RUNTIME_BLOCK_UNDEFINED,
    /// `{# id path}` names an id that is registered with a different path.
    E_RUNTIME_BLOCK_REDEFINED,
    /// The nesting depth of includes and blocks exceeds the limit.
    E_RUNTIME_DEPTH,
    /// The iteration count, the output size, the expression depth, a range size or the depth of a value that a list or map literal builds (VAL-20) exceeds its limit.
    E_RUNTIME_LIMIT,
    /// The implementation failed in a way this specification does not define: a panic in Rust or Go code that the engine runs, or, in TypeScript and PHP, an error that the language runtime raises for a programming defect.
    E_INTERNAL,
    // END GENERATED ERROR CODES
}

impl ErrorCode {
    /// The code as its specification name.
    pub fn as_str(self) -> &'static str {
        match self {
            // BEGIN GENERATED ERROR CODES
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
            ErrorCode::E_LOAD_FAILED => "E_LOAD_FAILED",
            ErrorCode::E_DATA_NUMBER_RANGE => "E_DATA_NUMBER_RANGE",
            ErrorCode::E_DATA_NUMBER_NOT_FINITE => "E_DATA_NUMBER_NOT_FINITE",
            ErrorCode::E_DATA_INVALID_UTF8 => "E_DATA_INVALID_UTF8",
            ErrorCode::E_DATA_UNSUPPORTED_TYPE => "E_DATA_UNSUPPORTED_TYPE",
            ErrorCode::E_DATA_DEPTH => "E_DATA_DEPTH",
            ErrorCode::E_DATA_INVALID_JSON => "E_DATA_INVALID_JSON",
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
            ErrorCode::E_INTERNAL => "E_INTERNAL",
            // END GENERATED ERROR CODES
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

/// A request that does not match what a program declares, such as the declared types of the `assign`
/// or the definition data of a generated program (ERR-13). It is not an ERR-1 error: it passes to the
/// host unchanged and carries no error code or template position.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArgumentError {
    /// Free text that names the member of the request.
    pub message: String,
}

impl fmt::Display for ArgumentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ArgumentError {}

/// The failure of a request to a program: an ERR-1 error or an argument error of the request (ERR-13).
#[derive(Debug, Clone, PartialEq)]
pub enum RequestError {
    /// An ERR-1 error of parsing, binding or rendering.
    Template(TemplateError),
    /// A request that does not match what the program declares.
    Argument(ArgumentError),
}

impl From<TemplateError> for RequestError {
    fn from(error: TemplateError) -> RequestError {
        RequestError::Template(error)
    }
}

impl From<ArgumentError> for RequestError {
    fn from(error: ArgumentError) -> RequestError {
        RequestError::Argument(error)
    }
}

impl fmt::Display for RequestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RequestError::Template(error) => error.fmt(f),
            RequestError::Argument(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for RequestError {}

/// Runs one public operation and reports a panic as `E_INTERNAL` for `template` (ERR-12, ERR-13).
///
/// The operations of the engine return their errors as values; a panic is an implementation
/// defect or a panic of a host callback. Catching it here keeps the host process alive, also when
/// the host is a foreign runtime that cannot unwind, such as the PHP extension.
pub fn internal_boundary<T, E: From<TemplateError>>(template: &str, operation: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation)) {
        Ok(result) => result,
        Err(payload) => {
            let reason = payload
                .downcast_ref::<&str>()
                .map(|text| (*text).to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "a panic without a message".to_string());
            Err(TemplateError::without_position(ErrorCode::E_INTERNAL, template, format!("internal failure: {reason}")).into())
        }
    }
}
