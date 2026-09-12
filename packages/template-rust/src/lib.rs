//! Template language implementation: lexer, parser, renderer, functions and the command line contract.
//!
//! The specification is in `docs/spec/` of the repository. `parse` produces the AST of one template,
//! `Engine::render` renders a template name or a parsed template with JSON assign data and template definitions.

#![deny(missing_docs)]

pub mod ast;
pub mod error;
pub mod escape;
pub mod expr;
pub mod functions;
pub mod loader;
pub mod page_cache;
pub mod parser;
pub mod render;
pub mod source;
pub mod value;

pub use ast::{Expr, Node, Template};
pub use error::{ErrorCode, TemplateError};
pub use functions::{Env, FunctionContext, HostFunction};
pub use loader::{FsLoader, Loaded, Loader, MapLoader, resolve_path};
pub use render::context::{Limits, ParsedTemplate};
pub use render::engine::{
    ArtifactRefresh, CompileMode, CompileOptions, DefineInput, Engine, EngineOptions, GeneratedRenderer, PreparedRender, RenderOptions, RenderTarget, defines_from_json, env_from_json,
};
pub use value::bind::{BindError, bind, to_json_value};
pub use value::json::{parse_json, parse_json_bytes};
pub use value::{OrderedMap, Value};

use parser::scanner::{DEFAULT_DELIMITERS, parse_delimiters};

/// Parse options.
#[derive(Debug, Clone, Default)]
pub struct ParseOptions {
    /// Delimiters as a two-character string; `{}` when absent.
    pub delimiters: Option<String>,
    /// Accept single-brace comment wrappers when enabled.
    pub legacy_wrappers: bool,
}

/// RT-2: parses one template source without loading other templates.
pub fn parse(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, TemplateError> {
    let delimiters = match &options.delimiters {
        Some(value) => parse_delimiters(value).ok_or_else(|| {
            TemplateError::without_position(
                ErrorCode::E_PARSE_INVALID_DIRECTIVE,
                name,
                format!("{value:?} is not a delimiter pair"),
            )
        })?,
        None => DEFAULT_DELIMITERS,
    };
    let parsed = source::Source::from_bytes(name, source)?;
    parser::parse_template(&parsed, delimiters, options.legacy_wrappers)
}
