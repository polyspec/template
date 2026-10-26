//! Template language implementation: lexer, parser, renderer, functions and the command line contract.
//!
//! The specification is in `docs/spec/` of the repository. `parse` produces the AST of one template,
//! `Engine::render` renders a template name or a parsed template with JSON assign data and template definitions;
//! `bind` checks data once and `Engine::render_bound` renders the bound map without checking it again.
//!
//! Built-in implementations are private. Generated programs call `RuntimeBindings`,
//! and host callbacks use the public `FunctionContext` and `HostFunction` types.

#![deny(missing_docs)]

pub mod artifact;
mod ast;
mod error;
mod escape;
mod expr;
mod format;
mod functions;
pub mod loader;
pub mod page_cache;
mod parser;
mod render;
mod sdk_source;
mod source;
mod value;

mod sha256;

/// Native conformance harness bridge, enabled only for repository test targets.
#[cfg(feature = "__test_support")]
pub mod __test_support {
    pub use crate::expr::vectors::{ExpressionToken, evaluate_expression, parse_expression, tokenize_expression};
    pub use crate::format::invariant::{without_line_indentation, without_spans};
}

pub use ast::{
    AstDecodeError, BinaryOp, Comment, Expr, IfBranch, LiteralValue, LoopMetaField, MapEntry, Node, ScopeItem, Template, UnaryOp,
    decode_template,
};
pub use error::{ArgumentError, ErrorCode, LineIndex, RequestError, Span, TemplateError, internal_boundary};
pub use format::{FormatError, FormatErrorReason, FormatOptions, Formatted, IndentUnit, TemplateBlocks, format, format_bytes};
pub use functions::{Env, FunctionContext, HostFunction};
pub use loader::{FsLoader, Loaded, Loader, MapLoader, resolve_path};
pub use render::context::{DefineEntry, Frame, Limits, LoopMeta, ParsedTemplate, RenderContext, RuntimeServices, Scope};
pub use render::engine::{
    ArtifactRefresh, AstProgram, DefineInput, Engine, EngineOptions, PreparedRender, Program, RenderOptions, RenderTarget,
    defines_from_json, env_from_json,
};
pub use render::runtime_bindings::{RuntimeBindings, RuntimeEntry};
pub use render::runtime_environment::RuntimeEnvironment;
pub use value::bind::{BindError, bind_json, bind_map, bind_value, bind_values, to_json_value, value_from_json};
pub use value::bound::{BindInput, BoundMap, DefineData, bind, bind_data, bound_root, merge};
pub use value::json::{parse_json, parse_json_bytes, read_json};
pub use value::{HostError, MAX_DEPTH, OrderedMap, TemplateObject, Value, ValueType};

pub use sdk_source::Source;

pub use parser::{PrefixAnalysis, SyntaxTag, SyntaxToken, TagKind, TemplateAnalysis, TokenKind};

use parser::scanner::{DEFAULT_DELIMITERS, Delimiters, parse_delimiters};

/// Parse options.
#[derive(Debug, Clone, Default)]
pub struct ParseOptions {
    /// Delimiters as a two-character string; `{}` when absent.
    pub delimiters: Option<String>,
}

/// RT-2: parses one template source without loading other templates. A delimiter option that is not a
/// delimiter pair is an argument error, and a panic is `E_INTERNAL` (ERR-13).
pub fn parse(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, RequestError> {
    internal_boundary(name, || parse_source(source, name, options))
}

fn parse_source(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, RequestError> {
    let parsed = source::Source::from_bytes(name, source)?;
    Ok(parser::parse_template(&parsed, option_delimiters(options)?)?)
}

/// EDT-8: parses one template like [`parse`] and also returns the tags the parser accepted, with their kind and body
/// ranges, and the class of every part of them. Offsets are byte offsets after a leading BOM, as in AST spans.
pub fn analyze(source: &[u8], name: &str, options: &ParseOptions) -> Result<TemplateAnalysis, RequestError> {
    internal_boundary(name, || {
        let parsed = source::Source::from_bytes(name, source)?;
        Ok(parser::analyze_template(&parsed, option_delimiters(options)?)?)
    })
}

/// EDT-11: accepted tags and tokens before the first parser error. Invalid
/// UTF-8 and delimiter options reject the operation at the SDK boundary.
pub fn analyze_prefix(source: &[u8], name: &str, options: &ParseOptions) -> Result<PrefixAnalysis, RequestError> {
    internal_boundary(name, || {
        let delimiters = option_delimiters(options)?;
        let parsed = source::Source::from_bytes(name, source)?;
        Ok(parser::analyze_template_prefix(&parsed, delimiters))
    })
}

fn option_delimiters(options: &ParseOptions) -> Result<Delimiters, ArgumentError> {
    match &options.delimiters {
        Some(value) => parse_delimiters(value).ok_or_else(|| ArgumentError {
            message: format!("{value:?} is not a delimiter pair"),
        }),
        None => Ok(DEFAULT_DELIMITERS),
    }
}
