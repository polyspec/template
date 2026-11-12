//! Error object and error codes as defined in docs/spec/errors.md.

use serde::Serialize;
use std::fmt;

/// Error codes of the specification. A variant is named `E_` and its kind in capitals; the kind, which `as_str` returns and
/// the serialization writes, is lowercase snake_case (ERR-1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[expect(non_camel_case_types, reason = "ERR-1: a variant is the kind of its code in capitals")]
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
    /// The loader reports a failure for the resolved name (RT-9): a TypeScript or PHP loader throws an exception, a Go or Rust loader returns an error, or a filesystem loader cannot read an existing regular file (RT-10), or a loader result lacks a source text and an AST, or a version (RT-9).
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
    /// A list, a map or a native object (VAL-19) is converted to a string.
    E_RUNTIME_STRINGIFY,
    /// A call names a function that is neither built in nor registered.
    E_RUNTIME_UNKNOWN_FUNCTION,
    /// A call has an argument count outside the function's range.
    E_RUNTIME_ARITY,
    /// Host code that the engine called reported an error (FUN-46, VAL-19): a registered function, a logical class function, an instance method, a member accessor, or `jsonSerialize()`.
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

impl Serialize for ErrorCode {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl ErrorCode {
    /// The kind of the code, lowercase snake_case (ERR-1).
    pub fn as_str(self) -> &'static str {
        match self {
            // BEGIN GENERATED ERROR CODES
            ErrorCode::E_LEX_INVALID_UTF8 => "lex_invalid_utf8",
            ErrorCode::E_PARSE_UNTERMINATED_TAG => "parse_unterminated_tag",
            ErrorCode::E_PARSE_UNTERMINATED_COMMENT => "parse_unterminated_comment",
            ErrorCode::E_PARSE_UNTERMINATED_STRING => "parse_unterminated_string",
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN => "parse_unexpected_token",
            ErrorCode::E_PARSE_INVALID_NUMBER => "parse_invalid_number",
            ErrorCode::E_PARSE_INVALID_ESCAPE => "parse_invalid_escape",
            ErrorCode::E_PARSE_UNEXPECTED_CLOSE => "parse_unexpected_close",
            ErrorCode::E_PARSE_UNCLOSED_BLOCK => "parse_unclosed_block",
            ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK => "parse_else_outside_block",
            ErrorCode::E_PARSE_DUPLICATE_ELSE => "parse_duplicate_else",
            ErrorCode::E_PARSE_ELSEIF_AFTER_ELSE => "parse_elseif_after_else",
            ErrorCode::E_PARSE_ELSEIF_NOT_IN_IF => "parse_elseif_not_in_if",
            ErrorCode::E_PARSE_RESERVED_NAME => "parse_reserved_name",
            ErrorCode::E_PARSE_INVALID_PATH => "parse_invalid_path",
            ErrorCode::E_PARSE_INVALID_BLOCK_TAG => "parse_invalid_block_tag",
            ErrorCode::E_PARSE_INVALID_WRAPPER => "parse_invalid_wrapper",
            ErrorCode::E_PARSE_INVALID_DIRECTIVE => "parse_invalid_directive",
            ErrorCode::E_LOAD_NOT_FOUND => "load_not_found",
            ErrorCode::E_LOAD_CYCLE => "load_cycle",
            ErrorCode::E_LOAD_OUTSIDE_ROOT => "load_outside_root",
            ErrorCode::E_LOAD_FAILED => "load_failed",
            ErrorCode::E_DATA_NUMBER_RANGE => "data_number_range",
            ErrorCode::E_DATA_NUMBER_NOT_FINITE => "data_number_not_finite",
            ErrorCode::E_DATA_INVALID_UTF8 => "data_invalid_utf8",
            ErrorCode::E_DATA_UNSUPPORTED_TYPE => "data_unsupported_type",
            ErrorCode::E_DATA_DEPTH => "data_depth",
            ErrorCode::E_DATA_INVALID_JSON => "data_invalid_json",
            ErrorCode::E_RUNTIME_TYPE => "runtime_type",
            ErrorCode::E_RUNTIME_COMPARE => "runtime_compare",
            ErrorCode::E_RUNTIME_DIV_ZERO => "runtime_div_zero",
            ErrorCode::E_RUNTIME_STRINGIFY => "runtime_stringify",
            ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION => "runtime_unknown_function",
            ErrorCode::E_RUNTIME_ARITY => "runtime_arity",
            ErrorCode::E_RUNTIME_HOST_FUNCTION => "runtime_host_function",
            ErrorCode::E_RUNTIME_UNKNOWN_LOOP => "runtime_unknown_loop",
            ErrorCode::E_RUNTIME_BLOCK_UNDEFINED => "runtime_block_undefined",
            ErrorCode::E_RUNTIME_BLOCK_REDEFINED => "runtime_block_redefined",
            ErrorCode::E_RUNTIME_DEPTH => "runtime_depth",
            ErrorCode::E_RUNTIME_LIMIT => "runtime_limit",
            ErrorCode::E_INTERNAL => "internal",
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

/// Runs one public operation and reports a panic as `internal` for `template` (ERR-12, ERR-13).
///
/// The operations of the engine return their errors as values; a panic is an implementation
/// defect or a panic of a host callback. Catching it here keeps the host process alive, also when
/// the host is a foreign runtime that cannot unwind, such as the PHP extension.
pub fn internal_boundary<T, E: From<TemplateError>>(template: &str, operation: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation)) {
        Ok(result) => result,
        Err(payload) => {
            // ERR-13: the message of the panic when it has one; a payload of another type has no text to report.
            let reason = match (payload.downcast_ref::<&str>(), payload.downcast_ref::<String>()) {
                (Some(text), _) => (*text).to_string(),
                (None, Some(text)) => text.clone(),
                (None, None) => "a panic without a message".to_string(),
            };
            Err(TemplateError::without_position(ErrorCode::E_INTERNAL, template, format!("internal failure: {reason}")).into())
        }
    }
}
