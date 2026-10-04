//! Template language implementation: lexer, parser, renderer, functions and the command line contract.
//!
//! The specification is in `docs/spec/` of the repository. `parse` produces the AST of one template,
//! `Engine::render` renders a template name or a parsed template with JSON assign data and template definitions;
//! `bind` checks data once and `Engine::render_bound` renders the bound map without checking it again.

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

pub use ast::{Comment, Expr, Node, Template};
pub use error::{ArgumentError, ErrorCode, RequestError, TemplateError, internal_boundary};
pub use functions::{Env, FunctionContext, HostFunction};
pub use loader::{FsLoader, Loaded, Loader, MapLoader, resolve_path};
pub use render::context::{Limits, ParsedTemplate};
pub use render::engine::{
    ArtifactRefresh, AstProgram, DefineInput, Engine, EngineOptions, PreparedRender, Program, RenderOptions, RenderTarget,
    defines_from_json, env_from_json,
};
pub use render::runtime_environment::RuntimeEnvironment;
pub use value::bind::{BindError, bind_json, bind_value, bind_values, to_json_value, value_from_json};
pub use value::bound::{BindInput, BoundMap, DefineData, bind, bind_data, bound_root, merge};
pub use value::json::{parse_json, parse_json_bytes, read_json};
pub use value::{HostError, MAX_DEPTH, OrderedMap, TemplateObject, Value};

use parser::scanner::{DEFAULT_DELIMITERS, parse_delimiters};

/// Parse options.
#[derive(Debug, Clone, Default)]
pub struct ParseOptions {
    /// Delimiters as a two-character string; `{}` when absent.
    pub delimiters: Option<String>,
}

/// RT-2: parses one template source without loading other templates. A panic is `E_INTERNAL` (ERR-13).
pub fn parse(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, TemplateError> {
    internal_boundary(name, || parse_source(source, name, options))
}

fn parse_source(source: &[u8], name: &str, options: &ParseOptions) -> Result<Template, TemplateError> {
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
    parser::parse_template(&parsed, delimiters)
}
