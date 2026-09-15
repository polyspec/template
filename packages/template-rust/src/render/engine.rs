//! AstProgram: template loading, caching, function registration and rendering (RT-1 to RT-6, RT-40, RT-41).

use crate::ast::Template;
use crate::error::{ErrorCode, Span, TemplateError};
use crate::functions::{Env, HostFunction};
use crate::loader::{Loaded, Loader, MapLoader, resolve_path};
use crate::parser::parse_template;
use crate::parser::scanner::{DEFAULT_DELIMITERS, Delimiters, parse_delimiters};
use crate::render::context::{DefineEntry, Frame, Limits, ParsedTemplate, RenderContext, RuntimeServices, Scope};
use crate::render::runtime_environment::RuntimeEnvironment;
use crate::render::statements::Renderer;
use crate::source::Source;
use crate::value::OrderedMap;
use crate::value::bind::{BindError, bind, bind_map};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

/// Controls when compiled template artifacts are refreshed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ArtifactRefresh {
    /// Parse source on every load.
    Dev,
    /// Reuse an artifact until the loader version changes.
    #[default]
    True,
    /// Keep the first artifact for the lifetime of the engine.
    False,
}

/// AstProgram options.
#[derive(Default)]
pub struct EngineOptions {
    /// Template loader; an empty map loader when absent.
    pub loader: Option<Box<dyn Loader>>,
    /// Host functions.
    pub functions: HashMap<String, HostFunction>,
    /// Limits; defaults when absent.
    pub limits: Option<Limits>,
    /// Delimiters as a two-character string; `{}` when absent.
    pub delimiters: Option<String>,
    /// Template artifact refresh policy.
    pub artifact_refresh: ArtifactRefresh,
}

/// A template definition given to `render` (RT-24).
#[derive(Debug, Clone, Default)]
pub struct DefineInput {
    /// Root-relative template path.
    pub template: Option<String>,
    /// Entry data.
    pub data: Option<serde_json::Value>,
    /// Pre-rendered HTML.
    pub html: Option<String>,
}

/// Render options.
#[derive(Debug, Clone, Default)]
pub struct RenderOptions {
    /// Template definitions.
    pub define: HashMap<String, DefineInput>,
    /// Environment; `Z` and the current time when absent.
    pub env: Option<Env>,
}

/// A template to render: a name resolved by the loader or a parsed template.
pub enum RenderTarget<'a> {
    /// A template name.
    Name(&'a str),
    /// A parsed template.
    Ast(&'a Template),
}

/// A complete AST or generated template program.
pub trait Program {
    /// Prepares a reusable render request.
    fn prepare(
        &self,
        target: RenderTarget<'_>,
        assign: &serde_json::Value,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, TemplateError>;

    /// Renders one request.
    fn render(&self, target: RenderTarget<'_>, assign: &serde_json::Value, options: &RenderOptions) -> Result<String, TemplateError>;
}

/// Delegates requests to one complete program.
pub struct Engine {
    program: Box<dyn Program>,
}

impl Engine {
    /// Creates an engine from an AST or generated program.
    pub fn new(program: impl Program + 'static) -> Engine {
        Engine {
            program: Box::new(program),
        }
    }

    /// Prepares a request through the selected program.
    pub fn prepare(
        &self,
        target: RenderTarget<'_>,
        assign: &serde_json::Value,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, TemplateError> {
        self.program.prepare(target, assign, options)
    }

    /// Renders a request through the selected program.
    pub fn render(&self, target: RenderTarget<'_>, assign: &serde_json::Value, options: &RenderOptions) -> Result<String, TemplateError> {
        self.program.render(target, assign, options)
    }
}

/// AST program with a loader and canonical AST evaluator.
pub struct AstProgram {
    /// The loader.
    pub loader: Box<dyn Loader>,
    /// Host functions and limits shared with generated programs.
    pub runtime: RuntimeEnvironment,
    /// Delimiters.
    pub delimiters: Delimiters,
    /// Controls when loaded template artifacts are refreshed.
    pub artifact_refresh: ArtifactRefresh,
    cache: RefCell<HashMap<String, (String, Rc<ParsedTemplate>)>>,
}

/// A render request with data, definitions and the target template prepared once.
/// Reusing it avoids rebinding JSON and rebuilding the definition registry for every render.
pub struct PreparedRender<'e> {
    render: Box<dyn Fn() -> Result<String, TemplateError> + 'e>,
}

struct AstPreparedExecution<'e> {
    engine: &'e AstProgram,
    root: Rc<OrderedMap>,
    registry: HashMap<String, DefineEntry>,
    env: Env,
    target_name: String,
    template: Rc<ParsedTemplate>,
}

impl AstProgram {
    /// Creates an engine. Panics when the delimiter option is not a delimiter pair.
    pub fn new(options: EngineOptions) -> AstProgram {
        let delimiters = match options.delimiters {
            Some(value) => parse_delimiters(&value).unwrap_or_else(|| panic!("{value:?} is not a delimiter pair")),
            None => DEFAULT_DELIMITERS,
        };
        AstProgram {
            loader: options.loader.unwrap_or_else(|| Box::new(MapLoader::new())),
            runtime: RuntimeEnvironment::new(options.limits, options.functions),
            delimiters,
            artifact_refresh: options.artifact_refresh,
            cache: RefCell::new(HashMap::new()),
        }
    }

    /// FUN-43, FUN-44: registers a host function. Returns an error message for an invalid or built-in name.
    pub fn register(&mut self, name: &str, function: HostFunction) -> Result<(), String> {
        self.runtime.register(name, function)
    }

    /// Registers one logical class function used by `Class::method(...)`.
    pub fn register_class(&mut self, class_name: &str, method: &str, function: HostFunction) -> Result<(), String> {
        self.runtime.register_class(class_name, method, function)
    }

    /// RT-9, RT-40: loads a template by name through the loader and caches it by version.
    pub fn load_template(&self, name: &str, from: Option<&Frame>, span: Option<Span>) -> Result<Rc<ParsedTemplate>, TemplateError> {
        let Some(loaded) = self.loader.load(name) else {
            let message = format!("template {name} does not exist");
            return Err(match (from, span) {
                (Some(frame), Some(span)) => {
                    TemplateError::at(ErrorCode::E_LOAD_NOT_FOUND, &frame.name, frame.lines.as_ref(), span, message)
                }
                _ => TemplateError::without_position(ErrorCode::E_LOAD_NOT_FOUND, name, message),
            });
        };
        if let Some((version, template)) = self.cache.borrow().get(name)
            && (self.artifact_refresh == ArtifactRefresh::False
                || (self.artifact_refresh == ArtifactRefresh::True && version == loaded.version()))
        {
            return Ok(Rc::clone(template));
        }
        let version = loaded.version().to_string();
        let template = match loaded {
            Loaded::Ast { ast, .. } => ParsedTemplate { ast, lines: None },
            Loaded::Source { bytes, .. } => {
                let source = Source::from_bytes(name, &bytes)?;
                let ast = parse_template(&source, self.delimiters)?;
                ParsedTemplate {
                    ast,
                    lines: Some(source.lines),
                }
            }
        };
        let template = Rc::new(template);
        self.cache.borrow_mut().insert(name.to_string(), (version, Rc::clone(&template)));
        Ok(template)
    }

    /// Prepares a render request for repeated use.
    pub fn prepare<'e>(
        &'e self,
        target: RenderTarget<'_>,
        assign: &serde_json::Value,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'e>, TemplateError> {
        let name = match target {
            RenderTarget::Name(name) => name.to_owned(),
            RenderTarget::Ast(ast) => ast.name.clone(),
        };
        let bound = (|| -> Result<(OrderedMap, HashMap<String, DefineEntry>, Env), BindError> {
            let root = bind_map(assign)?;
            let registry = bind_defines(&options.define)?;
            let env = options.env.clone().unwrap_or_else(|| Env {
                timezone: "Z".to_string(),
                now: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as f64)
                    .unwrap_or(0.0),
            });
            Ok((root, registry, env))
        })();
        let (root, registry, env) = bound.map_err(|error| TemplateError::without_position(error.code, &name, error.message))?;
        let target_name = match target {
            RenderTarget::Name(name) => match registry.get(name) {
                Some(DefineEntry::Template { template, .. }) => template.clone(),
                _ => name.to_string(),
            },
            RenderTarget::Ast(ast) => ast.name.clone(),
        };
        let template = match target {
            RenderTarget::Name(_) => self.load_template(&target_name, None, None)?,
            RenderTarget::Ast(ast) => Rc::new(ParsedTemplate {
                ast: ast.clone(),
                lines: None,
            }),
        };
        let execution = AstPreparedExecution {
            engine: self,
            root: Rc::new(root),
            registry,
            env,
            target_name,
            template,
        };
        Ok(PreparedRender {
            render: Box::new(move || execution.render()),
        })
    }

    /// Renders a template with data given as JSON.
    pub fn render(&self, target: RenderTarget<'_>, assign: &serde_json::Value, options: &RenderOptions) -> Result<String, TemplateError> {
        self.prepare(target, assign, options)?.render()
    }

    /// Renders a native value map while retaining assigned application objects.
    pub fn render_values(&self, target: RenderTarget<'_>, assign: OrderedMap, options: &RenderOptions) -> Result<String, TemplateError> {
        let name = match target {
            RenderTarget::Name(name) => name.to_owned(),
            RenderTarget::Ast(ast) => ast.name.clone(),
        };
        let registry = bind_defines(&options.define).map_err(|error| TemplateError::without_position(error.code, &name, error.message))?;
        let env = options.env.clone().unwrap_or_else(|| Env {
            timezone: "Z".to_string(),
            now: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as f64)
                .unwrap_or(0.0),
        });
        let target_name = match target {
            RenderTarget::Name(name) => match registry.get(name) {
                Some(DefineEntry::Template { template, .. }) => template.clone(),
                _ => name.to_string(),
            },
            RenderTarget::Ast(ast) => ast.name.clone(),
        };
        let template = match target {
            RenderTarget::Name(_) => self.load_template(&target_name, None, None)?,
            RenderTarget::Ast(ast) => Rc::new(ParsedTemplate {
                ast: ast.clone(),
                lines: None,
            }),
        };
        AstPreparedExecution {
            engine: self,
            root: Rc::new(assign),
            registry,
            env,
            target_name,
            template,
        }
        .render()
    }
}

impl Program for AstProgram {
    fn prepare(
        &self,
        target: RenderTarget<'_>,
        assign: &serde_json::Value,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, TemplateError> {
        AstProgram::prepare(self, target, assign, options)
    }

    fn render(&self, target: RenderTarget<'_>, assign: &serde_json::Value, options: &RenderOptions) -> Result<String, TemplateError> {
        AstProgram::render(self, target, assign, options)
    }
}

impl RuntimeServices for AstProgram {
    fn limits(&self) -> Limits {
        self.runtime.limits()
    }

    fn host_function(&self, name: &str) -> Option<&HostFunction> {
        self.runtime.host_function(name)
    }

    fn class_function(&self, class_name: &str, method: &str) -> Option<&HostFunction> {
        self.runtime.class_function(class_name, method)
    }
}

impl<'e> PreparedRender<'e> {
    /// Creates a prepared operation from compiled program state.
    pub fn new(render: impl Fn() -> Result<String, TemplateError> + 'e) -> PreparedRender<'e> {
        PreparedRender { render: Box::new(render) }
    }

    /// Renders the prepared request.
    pub fn render(&self) -> Result<String, TemplateError> {
        (self.render)()
    }
}

impl AstPreparedExecution<'_> {
    fn render(&self) -> Result<String, TemplateError> {
        let mut context = RenderContext::new(self.engine, Rc::clone(&self.root), self.env.clone(), &self.target_name);
        context.registry = self.registry.clone();
        context.enter(&self.target_name, None, None)?;
        let frame = Frame {
            name: self.template.ast.name.clone(),
            lines: self.template.lines.clone(),
            context: Rc::clone(&self.root),
        };
        let mut scope = Scope::default();
        Renderer::new(&mut context, self.engine).render_nodes(&self.template.ast.body, &frame, &mut scope)?;
        Ok(context.output)
    }
}

fn bind_defines(defines: &HashMap<String, DefineInput>) -> Result<HashMap<String, DefineEntry>, BindError> {
    let mut registry = HashMap::new();
    for (id, input) in defines {
        if let Some(html) = &input.html {
            registry.insert(id.clone(), DefineEntry::Html(html.clone()));
        } else if let Some(template) = &input.template {
            let name = resolve_path("", template).map_err(|error| BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: format!("define {id}: {}", error.0),
            })?;
            let data = match &input.data {
                None => None,
                Some(value) => match bind(value)? {
                    crate::value::Value::Map(map) => Some(map),
                    _ => {
                        return Err(BindError {
                            code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                            message: format!("define {id}: data is not a map"),
                        });
                    }
                },
            };
            registry.insert(id.clone(), DefineEntry::Template { template: name, data });
        } else {
            return Err(BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: format!("define {id}: entry needs \"template\" or \"html\""),
            });
        }
    }
    Ok(registry)
}

/// Parses template definitions from a JSON object of the `define.json` form (CNF-2).
pub fn defines_from_json(value: &serde_json::Value) -> Result<HashMap<String, DefineInput>, BindError> {
    let Some(object) = value.as_object() else {
        return Err(BindError {
            code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
            message: "define is not an object".to_string(),
        });
    };
    let mut defines = HashMap::new();
    for (id, entry) in object {
        if let Some(template) = entry.as_str() {
            defines.insert(
                id.clone(),
                DefineInput {
                    template: Some(template.to_string()),
                    data: None,
                    html: None,
                },
            );
            continue;
        }
        let Some(fields) = entry.as_object() else {
            return Err(BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: format!("define {id} is not a path or object"),
            });
        };
        defines.insert(
            id.clone(),
            DefineInput {
                template: fields.get("template").and_then(|v| v.as_str()).map(str::to_string),
                data: fields.get("data").cloned(),
                html: fields.get("html").and_then(|v| v.as_str()).map(str::to_string),
            },
        );
    }
    Ok(defines)
}

/// Parses an environment from a JSON object of the `env.json` form.
pub fn env_from_json(value: &serde_json::Value) -> Result<Env, BindError> {
    let Some(object) = value.as_object() else {
        return Err(BindError {
            code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
            message: "env is not an object".to_string(),
        });
    };
    let timezone = match object.get("timezone") {
        None => "Z".to_string(),
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(_) => {
            return Err(BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: "env.timezone is not a string".to_string(),
            });
        }
    };
    let now = match object.get("now") {
        None => std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as f64)
            .unwrap_or(0.0),
        Some(serde_json::Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(_) => {
            return Err(BindError {
                code: ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                message: "env.now is not a number".to_string(),
            });
        }
    };
    Ok(Env { timezone, now })
}
