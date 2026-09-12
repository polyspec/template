//! Render state: frames, scopes, loop metas, template definitions and limits (docs/spec/runtime.md).

use crate::ast::Template;
use crate::error::{ErrorCode, LineIndex, Span, TemplateError};
use crate::functions::Env;
use crate::render::engine::Engine;
use crate::value::{OrderedMap, Value};
use std::collections::HashMap;
use std::rc::Rc;

/// Resource limits (RT-33).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Limits {
    /// Loop iterations per render.
    pub iterations: usize,
    /// Include and block nesting depth.
    pub depth: usize,
    /// Output size in bytes.
    pub output_bytes: usize,
    /// Expression nesting depth.
    pub expression_depth: usize,
}

impl Default for Limits {
    fn default() -> Limits {
        Limits {
            iterations: 1_000_000,
            depth: 32,
            output_bytes: 16 * 1024 * 1024,
            expression_depth: 64,
        }
    }
}

/// A parsed template with the line index of its source, when parsed from source.
#[derive(Debug, Clone)]
pub struct ParsedTemplate {
    /// The AST.
    pub ast: Template,
    /// Line index, or None when the template was loaded as an AST.
    pub lines: Option<LineIndex>,
}

/// A template definition entry (RT-24).
#[derive(Debug, Clone, PartialEq)]
pub enum DefineEntry {
    /// A template entry.
    Template {
        /// Root-relative template name.
        template: String,
        /// Entry data.
        data: Option<Rc<OrderedMap>>,
    },
    /// Pre-rendered HTML.
    Html(String),
}

/// Loop meta of one active loop (RT-16).
#[derive(Debug, Clone)]
pub struct LoopMeta {
    /// 0-based index.
    pub index: usize,
    /// List index or map key.
    pub key: Value,
    /// Current element.
    pub value: Value,
    /// Whether this is the first iteration.
    pub first: bool,
    /// Whether this is the last iteration.
    pub last: bool,
    /// Element count.
    pub size: usize,
}

/// The template and context data of a rendered file (RT-11, RT-12).
#[derive(Debug, Clone)]
pub struct Frame {
    /// The template being rendered.
    pub template: Rc<ParsedTemplate>,
    /// Context data.
    pub context: Rc<OrderedMap>,
}

impl Frame {
    /// Template name.
    pub fn name(&self) -> &str {
        &self.template.ast.name
    }
}

/// Local scope and active loops of a rendered file; shared with included templates (RT-21).
#[derive(Debug, Default)]
pub struct Scope {
    /// Local variables.
    pub locals: HashMap<String, Value>,
    /// Active loops by variable name.
    pub loops: HashMap<String, Vec<LoopMeta>>,
}

impl Scope {
    /// Looks up a variable in the local scope, then in the context data.
    pub fn lookup(&self, frame: &Frame, name: &str) -> Value {
        if let Some(value) = self.locals.get(name) {
            return value.clone();
        }
        frame.context.get(name).cloned().unwrap_or(Value::Null)
    }

    /// The innermost active loop for a variable name.
    pub fn loop_meta(&self, name: &str) -> Option<&LoopMeta> {
        self.loops.get(name).and_then(|stack| stack.last())
    }
}

/// State of one render call.
pub struct RenderContext<'e> {
    /// The engine.
    pub engine: &'e Engine,
    /// Root data.
    pub root: Rc<OrderedMap>,
    /// Environment.
    pub env: Env,
    /// Entry template name.
    pub entry: String,
    /// Output buffer.
    pub output: String,
    /// Template definitions.
    pub registry: HashMap<String, DefineEntry>,
    /// Templates being rendered, entry first.
    pub chain: Vec<String>,
    /// Loop iterations so far.
    pub iterations: usize,
}

impl<'e> RenderContext<'e> {
    /// Creates a render context.
    pub fn new(engine: &'e Engine, root: Rc<OrderedMap>, env: Env, entry: &str) -> RenderContext<'e> {
        RenderContext {
            engine,
            root,
            env,
            entry: entry.to_string(),
            output: String::new(),
            registry: HashMap::new(),
            chain: Vec::new(),
            iterations: 0,
        }
    }

    /// Creates an error at a span of a frame, or without position.
    pub fn fail(&self, code: ErrorCode, frame: Option<&Frame>, span: Option<Span>, message: impl Into<String>) -> TemplateError {
        match (frame, span) {
            (Some(frame), Some(span)) => TemplateError::at(code, frame.name(), frame.template.lines.as_ref(), span, message),
            (Some(frame), None) => TemplateError::without_position(code, frame.name(), message),
            _ => TemplateError::without_position(code, &self.entry, message),
        }
    }

    /// Writes output, checking the size limit (RT-35).
    pub fn write(&mut self, text: &str, frame: &Frame, span: Span) -> Result<(), TemplateError> {
        if self.output.len() + text.len() > self.engine.limits.output_bytes {
            return Err(self.fail(
                ErrorCode::E_RUNTIME_LIMIT,
                Some(frame),
                Some(span),
                format!("output exceeds {} bytes", self.engine.limits.output_bytes),
            ));
        }
        self.output.push_str(text);
        Ok(())
    }

    /// Enters a template (RT-22, RT-23).
    pub fn enter(&mut self, name: &str, frame: Option<&Frame>, span: Option<Span>) -> Result<(), TemplateError> {
        if self.chain.iter().any(|entry| entry == name) {
            return Err(self.fail(ErrorCode::E_LOAD_CYCLE, frame, span, format!("{name} is already being rendered")));
        }
        if self.chain.len() > self.engine.limits.depth {
            return Err(self.fail(
                ErrorCode::E_RUNTIME_DEPTH,
                frame,
                span,
                format!("nesting depth exceeds {}", self.engine.limits.depth),
            ));
        }
        self.chain.push(name.to_string());
        Ok(())
    }

    /// Leaves the innermost template.
    pub fn leave(&mut self) {
        self.chain.pop();
    }

    /// Counts one loop iteration (RT-20).
    pub fn count_iteration(&mut self, frame: &Frame, span: Span) -> Result<(), TemplateError> {
        self.iterations += 1;
        if self.iterations > self.engine.limits.iterations {
            return Err(self.fail(
                ErrorCode::E_RUNTIME_LIMIT,
                Some(frame),
                Some(span),
                format!("loop iterations exceed {}", self.engine.limits.iterations),
            ));
        }
        Ok(())
    }
}
