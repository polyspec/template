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
mod ast_json;
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
    pub use crate::ast_json::encode_expr;
    pub use crate::expr::vectors::{ExpressionToken, evaluate_expression, parse_expression, tokenize_expression};
}

/// The fault injection points of the crate (binding design G-5, X-1; docs/spec/errors.md#fault-injection-points), which
/// the interface contract names in `faults`. A point does nothing unless the feature `fault-test` is on.
pub mod fault {
    /// An open block that the parser of a block tag finds missing: the kind `internal`, which no input reaches (X-1).
    #[doc(hidden)]
    pub const INTERNAL: &str = "template.internal";
    /// A formatted text that parses to another AST than its source: the kind `format_invariant`, which no input reaches
    /// (FMT-1).
    #[doc(hidden)]
    pub const FORMAT_INVARIANT: &str = "template.format_invariant";
}

pub use ast::{BinaryOp, Comment, Expr, IfBranch, LiteralValue, LoopMetaField, MapEntry, Node, ScopeItem, Template, UnaryOp};
pub use ast_json::{decode_template, encode_template};
pub use error::{ErrorCode, LineIndex, RenderError, Span, TemplateError, internal_boundary};
pub use format::{FormatOptions, Formatted, IndentUnit, TemplateBlocks, format, format_bytes};
pub use functions::{Env, FunctionContext, HostFunction};
pub use loader::{FsLoader, LoadError, Loaded, Loader, MapLoader, resolve_path};
pub use render::context::{DefineEntry, Frame, Limits, LoopMeta, ParsedTemplate, RenderContext, RuntimeServices, Scope};
pub use render::engine::{
    ArtifactRefresh, AstProgram, DefineInput, Engine, EngineOptions, PreparedRender, Program, RenderOptions, RenderTarget,
    defines_from_json, env_from_json,
};
pub use render::runtime_bindings::{RuntimeBindings, RuntimeEntry};
pub use render::runtime_environment::RuntimeEnvironment;
pub use value::bind::{BindError, bind_json, bind_map, bind_value, bind_values, to_json_value, value_from_json};
pub use value::bound::{BindInput, BoundMap, DefineData, bind, bind_data, bound_root, merge};
pub use value::host::{HostObject, ValueOut, value_in, value_out};
pub use value::json::{parse_json, parse_json_bytes, read_json};
pub use value::{HostError, MAX_DEPTH, OrderedMap, TemplateObject, Value, ValueType};

pub use sdk_source::Source;

/// The JSON library of the JSON values that the crate reads and writes (VAL-12, FUN-26).
pub use polyspec_json;

pub use parser::{PrefixAnalysis, SyntaxTag, SyntaxToken, TagKind, TemplateAnalysis, TokenKind};

use parser::scanner::{DEFAULT_DELIMITERS, Delimiters, parse_delimiters};

/// Parse options.
#[derive(Debug, Clone, Default)]
pub struct ParseOptions {
    /// Delimiters as a two-character string; `{}` when absent.
    pub delimiters: Option<String>,
}

/// RT-2: parses one template source without loading other templates. A delimiter option that is not a
/// delimiter pair is an argument error, and a panic is `internal` (ERR-13).
pub fn parse(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, TemplateError> {
    internal_boundary(name, || parse_source(source, name, options))
}

fn parse_source(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, TemplateError> {
    let parsed = source::Source::from_bytes(name, source)?;
    parser::parse_template(&parsed, option_delimiters(options, name)?)
}

/// EDT-8: parses one template like [`parse`] and also returns the tags the parser accepted, with their kind and body
/// ranges, and the class of every part of them. Offsets are byte offsets after a leading BOM, as in AST spans.
pub fn analyze(source: &[u8], name: &str, options: &ParseOptions) -> Result<TemplateAnalysis, TemplateError> {
    internal_boundary(name, || {
        let parsed = source::Source::from_bytes(name, source)?;
        parser::analyze_template(&parsed, option_delimiters(options, name)?)
    })
}

/// EDT-11: accepted tags and tokens before the first parser error. Invalid
/// UTF-8 and delimiter options reject the operation at the SDK boundary.
pub fn analyze_prefix(source: &[u8], name: &str, options: &ParseOptions) -> Result<PrefixAnalysis, TemplateError> {
    internal_boundary(name, || {
        let delimiters = option_delimiters(options, name)?;
        let parsed = source::Source::from_bytes(name, source)?;
        Ok(parser::analyze_template_prefix(&parsed, delimiters))
    })
}

fn option_delimiters(options: &ParseOptions, name: &str) -> Result<Delimiters, TemplateError> {
    match &options.delimiters {
        Some(value) => parse_delimiters(value)
            .ok_or_else(|| TemplateError::argument(ErrorCode::ArgumentDelimiters, name, format!("{value:?} is not a delimiter pair"))),
        None => Ok(DEFAULT_DELIMITERS),
    }
}
