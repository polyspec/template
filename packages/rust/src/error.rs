//! Error object and error codes as defined in docs/spec/errors.md.

use std::fmt;

/// Error codes of the specification. A variant is named after its kind in UpperCamelCase, so the snake_case of the name is
/// the kind (binding E-3); the kind, which `as_str` returns and the serialization writes, is lowercase snake_case (ERR-1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    // BEGIN GENERATED ERROR CODES
    /// The source is not valid UTF-8.
    LexInvalidUtf8,
    /// A tag has no closing `}` before the end of the file.
    ParseUnterminatedTag,
    /// A comment has no `*}` before the end of the file.
    ParseUnterminatedComment,
    /// A string literal has no closing quote before the end of the tag.
    ParseUnterminatedString,
    /// A token is not allowed by the grammar at its position, including an empty expression.
    ParseUnexpectedToken,
    /// A number literal does not match the number token.
    ParseInvalidNumber,
    /// A backslash in a string literal is followed by a character outside the escape set.
    ParseInvalidEscape,
    /// `{/}` appears with no open block.
    ParseUnexpectedClose,
    /// The file ends while a block is open.
    ParseUnclosedBlock,
    /// `{:}` or `{:? ...}` appears with no open block.
    ParseElseOutsideBlock,
    /// A second `{:}` appears in the same block.
    ParseDuplicateElse,
    /// `{:? ...}` appears after `{:}` in the same block.
    ParseElseifAfterElse,
    /// `{:? ...}` appears directly inside a loop block or an if-block.
    ParseElseifNotInIf,
    /// An assignment target or loop variable is a reserved word.
    ParseReservedName,
    /// An include or block path is not a path token.
    ParseInvalidPath,
    /// The tokens of a block tag do not match the block tag grammar.
    ParseInvalidBlockTag,
    /// The `}}` of a wrapped tag is not followed by the wrapper closer that matches the wrapper opener.
    ParseInvalidWrapper,
    /// A delimiter directive is not the first tag of the file, names a character that is not a delimiter, or has another form.
    ParseInvalidDirective,
    /// The loader has no template for the resolved name.
    LoadNotFound,
    /// An include or block renders a template that is already being rendered in the same chain.
    LoadCycle,
    /// A resolved path leaves the loader root.
    LoadOutsideRoot,
    /// The loader reports a failure for the resolved name (RT-9): a TypeScript or PHP loader throws an exception, a Go or Rust loader returns an error, or a filesystem loader cannot read an existing regular file (RT-10), or a loader result lacks a source text and an AST, or a version (RT-9).
    LoadFailed,
    /// A render needs a template of a loader that reads files (RT-77) that `prepare` or `load` did not load.
    LoadNotLoaded,
    /// A finite number has a magnitude greater than 2^53 − 1 (VAL-2).
    DataNumberRange,
    /// A number is NaN or infinite.
    DataNumberNotFinite,
    /// A string or a map key is not valid Unicode text (VAL-12 to VAL-17).
    DataInvalidUtf8,
    /// A value has a type that has no binding.
    DataUnsupportedType,
    /// Lists and maps are nested deeper than the binding depth limit, including a cyclic host structure (VAL-20).
    DataDepth,
    /// JSON text of assign data, template definitions or the environment is not one JSON document (VAL-12).
    DataInvalidJson,
    /// An operand or argument has a type the operation does not accept.
    RuntimeType,
    /// An ordering comparison has operands without an order.
    RuntimeCompare,
    /// The right operand of `/` or `%` is zero.
    RuntimeDivZero,
    /// A list, a map or a native object (VAL-19) is converted to a string.
    RuntimeStringify,
    /// A call names a function that is neither built in nor registered.
    RuntimeUnknownFunction,
    /// A call has an argument count outside the function's range.
    RuntimeArity,
    /// A legacy implementation reports an error of host code that the engine called (FUN-46, VAL-19); the Rust core passes such an error to the caller unchanged and never reports this code.
    RuntimeHostFunction,
    /// A loop meta names a loop that is not enclosing the expression.
    RuntimeUnknownLoop,
    /// `{# id}` names an id that the template definition registry does not contain.
    RuntimeBlockUndefined,
    /// `{# id path}` names an id that is registered with a different path.
    RuntimeBlockRedefined,
    /// The nesting depth of includes and blocks exceeds the limit.
    RuntimeDepth,
    /// The iteration count, the output size, the expression depth, a range size or the depth of a value that a list or map literal builds (VAL-20) exceeds its limit.
    RuntimeLimit,
    /// A delimiter option of `parse`, `analyze`, `format` or an engine is not a delimiter pair (LEX-21).
    ArgumentDelimiters,
    /// A host function name of `register` or of the engine options is not an identifier or names a built-in function (RT-5, FUN-44).
    ArgumentFunctionName,
    /// A byte range of the public `Source` of an implementation is reversed or reaches beyond the source.
    ArgumentSourceRange,
    /// An indent unit of `format` is not a run of spaces or one tab (FMT-9).
    ArgumentIndent,
    /// The text that `format` would return does not parse to the AST of the source (FMT-1).
    FormatInvariant,
    /// The HTML elements of the source do not nest, so `format` cannot indent the lines by them (FMT-12).
    FormatHtml,
    /// The text that `decode_template` reads is not JSON, or its value is not an AST of the canonical schema; the message names the JSON Pointer of the invalid node (AST-10).
    AstInvalid,
    /// The implementation failed in a way this specification does not define: a panic in Rust or Go code that the engine runs, or, in TypeScript and PHP, an error that the language runtime raises for a programming defect.
    Internal,
    // END GENERATED ERROR CODES
}

impl ErrorCode {
    /// The kind of the code, lowercase snake_case (ERR-1).
    pub fn as_str(self) -> &'static str {
        match self {
            // BEGIN GENERATED ERROR CODES
            ErrorCode::LexInvalidUtf8 => "lex_invalid_utf8",
            ErrorCode::ParseUnterminatedTag => "parse_unterminated_tag",
            ErrorCode::ParseUnterminatedComment => "parse_unterminated_comment",
            ErrorCode::ParseUnterminatedString => "parse_unterminated_string",
            ErrorCode::ParseUnexpectedToken => "parse_unexpected_token",
            ErrorCode::ParseInvalidNumber => "parse_invalid_number",
            ErrorCode::ParseInvalidEscape => "parse_invalid_escape",
            ErrorCode::ParseUnexpectedClose => "parse_unexpected_close",
            ErrorCode::ParseUnclosedBlock => "parse_unclosed_block",
            ErrorCode::ParseElseOutsideBlock => "parse_else_outside_block",
            ErrorCode::ParseDuplicateElse => "parse_duplicate_else",
            ErrorCode::ParseElseifAfterElse => "parse_elseif_after_else",
            ErrorCode::ParseElseifNotInIf => "parse_elseif_not_in_if",
            ErrorCode::ParseReservedName => "parse_reserved_name",
            ErrorCode::ParseInvalidPath => "parse_invalid_path",
            ErrorCode::ParseInvalidBlockTag => "parse_invalid_block_tag",
            ErrorCode::ParseInvalidWrapper => "parse_invalid_wrapper",
            ErrorCode::ParseInvalidDirective => "parse_invalid_directive",
            ErrorCode::LoadNotFound => "load_not_found",
            ErrorCode::LoadCycle => "load_cycle",
            ErrorCode::LoadOutsideRoot => "load_outside_root",
            ErrorCode::LoadFailed => "load_failed",
            ErrorCode::LoadNotLoaded => "load_not_loaded",
            ErrorCode::DataNumberRange => "data_number_range",
            ErrorCode::DataNumberNotFinite => "data_number_not_finite",
            ErrorCode::DataInvalidUtf8 => "data_invalid_utf8",
            ErrorCode::DataUnsupportedType => "data_unsupported_type",
            ErrorCode::DataDepth => "data_depth",
            ErrorCode::DataInvalidJson => "data_invalid_json",
            ErrorCode::RuntimeType => "runtime_type",
            ErrorCode::RuntimeCompare => "runtime_compare",
            ErrorCode::RuntimeDivZero => "runtime_div_zero",
            ErrorCode::RuntimeStringify => "runtime_stringify",
            ErrorCode::RuntimeUnknownFunction => "runtime_unknown_function",
            ErrorCode::RuntimeArity => "runtime_arity",
            ErrorCode::RuntimeHostFunction => "runtime_host_function",
            ErrorCode::RuntimeUnknownLoop => "runtime_unknown_loop",
            ErrorCode::RuntimeBlockUndefined => "runtime_block_undefined",
            ErrorCode::RuntimeBlockRedefined => "runtime_block_redefined",
            ErrorCode::RuntimeDepth => "runtime_depth",
            ErrorCode::RuntimeLimit => "runtime_limit",
            ErrorCode::ArgumentDelimiters => "argument_delimiters",
            ErrorCode::ArgumentFunctionName => "argument_function_name",
            ErrorCode::ArgumentSourceRange => "argument_source_range",
            ErrorCode::ArgumentIndent => "argument_indent",
            ErrorCode::FormatInvariant => "format_invariant",
            ErrorCode::FormatHtml => "format_html",
            ErrorCode::AstInvalid => "ast_invalid",
            ErrorCode::Internal => "internal",
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
    /// Restores a line index stored in a compiled artifact; offsets that do not start at 0 or do not increase are an error.
    pub fn try_from_starts(starts: Vec<usize>) -> Result<LineIndex, String> {
        if starts.first() != Some(&0) {
            return Err("a line index starts at byte 0".to_string());
        }
        if !starts.windows(2).all(|pair| pair[0] < pair[1]) {
            return Err("the starts of the lines increase".to_string());
        }
        Ok(LineIndex { starts })
    }

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
#[derive(Debug, Clone, PartialEq)]
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

    /// The JSON text of the error object of ERR-1: `code` (its kind), `template`, `line`, `col`, `offset`, `end` and
    /// `message`, written with polyspec-json.
    pub fn to_json(&self) -> String {
        let text = |value: &str| polyspec_json::Value::string(value).raw().to_string();
        format!(
            "{{\"code\":{},\"template\":{},\"line\":{},\"col\":{},\"offset\":{},\"end\":{},\"message\":{}}}",
            text(self.code.as_str()),
            text(&self.template),
            self.line,
            self.col,
            self.offset,
            self.end,
            text(&self.message)
        )
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

/// The failure of an operation that calls host code (FUN-46, RT-9): a template error with its kind, or the error of host
/// code, which reaches the caller unchanged: an exception of language code (`Raised`) or the error of a Rust callback
/// (`Callback`).
pub type RenderError = binding_core::Failure<TemplateError>;

/// A template error is the kind arm of a render failure.
impl From<TemplateError> for binding_core::Failure<TemplateError> {
    fn from(error: TemplateError) -> binding_core::Failure<TemplateError> {
        binding_core::Failure::Kind(error)
    }
}

/// The kind of a template error is the kind of its code (ERR-1); a template error has no HTTP status and no OS error
/// number.
impl binding_core::Kinds for TemplateError {
    fn kind(&self) -> &'static str {
        self.code.as_str()
    }

    fn status(&self) -> Option<u16> {
        None
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}

impl TemplateError {
    /// An error of an argument of an operation (ERR-15): no position, the name that the operation received.
    pub fn argument(code: ErrorCode, template: &str, message: impl Into<String>) -> TemplateError {
        TemplateError::without_position(code, template, message)
    }
}

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
            Err(TemplateError::without_position(ErrorCode::Internal, template, format!("internal failure: {reason}")).into())
        }
    }
}
