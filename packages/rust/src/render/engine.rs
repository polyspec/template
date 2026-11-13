//! AstProgram: template loading, caching, function registration and rendering (RT-1 to RT-6, RT-40, RT-41).

use crate::ast::{Node, Template};
use crate::error::{ErrorCode, LineIndex, RenderError, Span, TemplateError, internal_boundary};
use crate::functions::{ContractFunction, Env, HostFunction, contract_host_function};
use crate::loader::{LoadError, Loaded, Loader, MapLoader, resolve_path};
use crate::parser::parse_template;
use crate::parser::scanner::{DEFAULT_DELIMITERS, Delimiters, parse_delimiters};
use crate::render::context::{DefineEntry, Frame, Limits, ParsedTemplate, RenderContext, RuntimeServices, Scope};
use crate::render::runtime_environment::RuntimeEnvironment;
use crate::render::statements::Renderer;
use crate::source::Source;
use crate::value::bind::{BindError, bind_json, bind_map, bind_values, value_from_json};
use crate::value::bound::{BoundMap, bind_data, bound_root};
use crate::value::{OrderedMap, Value};
use binding_core::Io;
use polyspec_json::{Kind as JsonKind, Value as JsonValue};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::{Mutex, PoisonError};

/// Controls when compiled template artifacts are refreshed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRefresh {
    /// Parse source on every load.
    Dev,
    /// Reuse an artifact until the loader version changes.
    True,
    /// Keep the first artifact for the lifetime of the engine.
    False,
}

/// The refresh policy of an engine whose options name none (RT-40, `engine_options.artifact_refresh` of the interface
/// contract): reuse an artifact until the loader version changes.
pub const DEFAULT_ARTIFACT_REFRESH: ArtifactRefresh = ArtifactRefresh::True;

impl Default for ArtifactRefresh {
    fn default() -> ArtifactRefresh {
        DEFAULT_ARTIFACT_REFRESH
    }
}

/// The host functions of the options of a program by their names, in the form of the interface contract: the type of
/// `engine_options.functions`, a `map` of the function type of `engine.register` (RT-5, CNF-20).
pub type Functions = binding_core::OrderedMap<ContractFunction>;

/// AstProgram options. `'a` is the lifetime of the loader, the callback that the record `engine_options` of the
/// interface contract holds (CNF-20).
#[derive(Default)]
pub struct EngineOptions<'a> {
    /// Template loader; an empty map loader when absent.
    pub loader: Option<Box<dyn Loader + 'a>>,
    /// Host functions by their names (RT-5); `None` is no function.
    pub functions: Option<Functions>,
    /// Limits; defaults when absent.
    pub limits: Option<Limits>,
    /// Delimiters as a two-character string; `{}` when absent.
    pub delimiters: Option<String>,
    /// Template artifact refresh policy. `None` is [`DEFAULT_ARTIFACT_REFRESH`].
    pub artifact_refresh: Option<ArtifactRefresh>,
}

/// A template definition given to `render` (RT-24).
#[derive(Debug, Clone, Default)]
pub struct DefineInput {
    /// Root-relative template path.
    pub template: Option<String>,
    /// Entry data as a value that is bound like assign data, so it may hold native objects (VAL-11, VAL-13).
    pub data: Option<Value>,
    /// Entry data as a bound map, which is not bound again (VAL-22). A definition gives `data` or `bound`, not both.
    pub bound: Option<BoundMap>,
    /// Pre-rendered HTML.
    pub html: Option<String>,
}

/// The template definitions of a render by their identifiers, in the order in which they were given: the type of
/// `render_options.define` of the interface contract, a `map<define_input>` (RT-24, CNF-20).
pub type Definitions = binding_core::OrderedMap<DefineInput>;

/// Render options.
#[derive(Debug, Clone, Default)]
pub struct RenderOptions {
    /// Template definitions; `None` is no definition (RT-4).
    pub define: Option<Definitions>,
    /// Environment; `Z` and the current time when absent.
    pub env: Option<Env>,
}

/// The current time in seconds since the Unix epoch; a clock before the epoch is an error, not zero.
fn current_time() -> Result<f64, BindError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as f64)
        .map_err(|error| BindError {
            code: ErrorCode::Internal,
            message: format!("system clock is before the Unix epoch: {error}"),
        })
}

impl RenderOptions {
    /// The environment of the render: the given one, or `Z` and the current time.
    fn environment(&self) -> Result<Env, BindError> {
        match self.env.clone() {
            Some(env) => Ok(env),
            None => Ok(Env {
                timezone: "Z".to_string(),
                now: current_time()?,
            }),
        }
    }
}

/// The assign of one request: JSON data that is bound, or a bound map that is not bound again (VAL-22).
enum Root<'a> {
    Json(&'a JsonValue),
    Bound(&'a BoundMap),
}

/// A template to render: a name resolved by the loader or a parsed template.
pub enum RenderTarget<'a> {
    /// A template name.
    Name(&'a str),
    /// A parsed template.
    Ast(&'a Template),
}

impl RenderTarget<'_> {
    /// The name of the template: the name that the loader resolves, or the name of the parsed template.
    fn name(&self) -> String {
        match self {
            RenderTarget::Name(name) => (*name).to_owned(),
            RenderTarget::Ast(ast) => ast.name.clone(),
        }
    }
}

/// A complete AST or generated template program.
pub trait Program: Send + Sync {
    /// Prepares a reusable render request.
    fn prepare(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<PreparedRender<'_>, RenderError>;

    /// Renders one request.
    fn render(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<String, RenderError>;

    /// Prepares a reusable render request whose assign is a bound map, which is not bound again (VAL-22).
    fn prepare_bound(
        &self,
        target: RenderTarget<'_>,
        assign: &BoundMap,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, RenderError>;

    /// Renders one request whose assign is a bound map, which is not bound again (VAL-22).
    fn render_bound(&self, target: RenderTarget<'_>, assign: &BoundMap, options: &RenderOptions) -> Result<String, RenderError>;
}

/// Delegates requests to one complete program.
pub struct Engine {
    program: Box<dyn Program>,
}

/// The bound root, the definition registry and the environment of one request.
struct BoundRequest {
    root: Arc<OrderedMap>,
    registry: HashMap<String, DefineEntry>,
    env: Env,
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
        assign: &JsonValue,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, RenderError> {
        self.program.prepare(target, assign, options)
    }

    /// Renders a request through the selected program.
    pub fn render(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<String, RenderError> {
        self.program.render(target, assign, options)
    }

    /// Prepares a request whose assign is a bound map through the selected program (VAL-22).
    pub fn prepare_bound(
        &self,
        target: RenderTarget<'_>,
        assign: &BoundMap,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, RenderError> {
        self.program.prepare_bound(target, assign, options)
    }

    /// Renders a request whose assign is a bound map through the selected program (VAL-22).
    pub fn render_bound(&self, target: RenderTarget<'_>, assign: &BoundMap, options: &RenderOptions) -> Result<String, RenderError> {
        self.program.render_bound(target, assign, options)
    }
}

/// AST program with a loader and canonical AST evaluator.
pub struct AstProgram {
    /// The loader.
    pub loader: Box<dyn Loader>,
    /// Host functions and limits shared with generated programs.
    pub runtime: RuntimeEnvironment,
    /// Delimiters.
    pub(crate) delimiters: Delimiters,
    /// Controls when loaded template artifacts are refreshed.
    pub artifact_refresh: ArtifactRefresh,
    cache: Mutex<HashMap<String, Cached>>,
}

/// A template in the cache of a program: loaded with its version, or the failure of its load in `prepare` or `load`,
/// which a render reports as it would have loaded it then (RT-77): a failure of the loader at the tag that names the
/// template, an error of its source, such as a parse error, as it is.
enum Cached {
    Template(String, Arc<ParsedTemplate>),
    Failed(TemplateError),
}

/// A render request with data, definitions and the target template prepared once.
/// Reusing it avoids rebinding JSON and rebuilding the definition registry for every render.
pub struct PreparedRender<'e> {
    name: String,
    render: Box<dyn Fn() -> Result<String, RenderError> + Send + Sync + 'e>,
}

struct AstPreparedExecution<'e> {
    engine: &'e AstProgram,
    root: Arc<OrderedMap>,
    registry: HashMap<String, DefineEntry>,
    env: Env,
    target_name: String,
    template: Arc<ParsedTemplate>,
}

impl AstProgram {
    /// The name of the template that a target renders, through the definitions, and the template itself.
    fn resolve_target(
        &self,
        target: RenderTarget<'_>,
        registry: &HashMap<String, DefineEntry>,
        io: bool,
    ) -> Result<(String, Arc<ParsedTemplate>), RenderError> {
        let target_name = match target {
            RenderTarget::Name(name) => match registry.get(name) {
                Some(DefineEntry::Template { template, .. }) => template.clone(),
                _ => name.to_string(),
            },
            RenderTarget::Ast(ast) => ast.name.clone(),
        };
        let template = match target {
            RenderTarget::Name(_) if io => self.load_template(&target_name, None, None)?,
            RenderTarget::Name(_) => self.render_template(&target_name, None, None)?,
            RenderTarget::Ast(ast) => Arc::new(ParsedTemplate {
                ast: ast.clone(),
                lines: None,
            }),
        };
        Ok((target_name, template))
    }

    /// Creates an engine. A delimiter option that is not a delimiter pair is an argument error (ERR-13). The program
    /// keeps the loader of the options, so the options hold a loader of the lifetime `'static`.
    pub fn new(options: EngineOptions<'static>) -> Result<AstProgram, TemplateError> {
        let delimiters = match options.delimiters {
            Some(value) => parse_delimiters(&value)
                .ok_or_else(|| TemplateError::argument(ErrorCode::ArgumentDelimiters, "", format!("{value:?} is not a delimiter pair")))?,
            None => DEFAULT_DELIMITERS,
        };
        let mut runtime = RuntimeEnvironment::new(options.limits, HashMap::new())?;
        // RT-5: each function of the options is added as `register_function` adds it (FUN-43, FUN-44).
        if let Some(functions) = options.functions {
            for (name, function) in functions {
                runtime
                    .register(&name, contract_host_function(function))
                    .map_err(|message| TemplateError::argument(ErrorCode::ArgumentFunctionName, "", message))?;
            }
        }
        Ok(AstProgram {
            // RT-5: a program without a loader has an empty map loader.
            loader: match options.loader {
                Some(loader) => loader,
                None => Box::new(MapLoader::new()),
            },
            runtime,
            delimiters,
            // RT-40: a program whose options name no policy has the default policy.
            artifact_refresh: match options.artifact_refresh {
                Some(policy) => policy,
                None => DEFAULT_ARTIFACT_REFRESH,
            },
            cache: Mutex::new(HashMap::new()),
        })
    }

    /// FUN-43, FUN-44: registers a host function. A name that is not an identifier or names a built-in function is
    /// `argument_function_name` (ERR-15).
    pub fn register(&mut self, name: &str, function: HostFunction) -> Result<(), TemplateError> {
        self.runtime
            .register(name, function)
            .map_err(|message| TemplateError::argument(ErrorCode::ArgumentFunctionName, "", message))
    }

    /// Registers one logical class function used by `Class::method(...)`. A class or method name that is not an
    /// identifier is `argument_function_name` (ERR-15).
    pub fn register_class(&mut self, class_name: &str, method: &str, function: HostFunction) -> Result<(), TemplateError> {
        self.runtime
            .register_class(class_name, method, function)
            .map_err(|message| TemplateError::argument(ErrorCode::ArgumentFunctionName, "", message))
    }

    /// FUN-43, FUN-44: registers a host function in the form of the interface contract (binding GN-6d), the core path
    /// of `engine.register`; it is registered as `register` registers a host function.
    pub fn register_function(&mut self, name: &str, function: ContractFunction) -> Result<(), TemplateError> {
        self.register(name, contract_host_function(function))
    }

    /// Registers one logical class function in the form of the interface contract (binding GN-6d), the core path of
    /// `engine.register_class`; it is registered as `register_class` registers a host function.
    pub fn register_class_function(&mut self, class_name: &str, method: &str, function: ContractFunction) -> Result<(), TemplateError> {
        self.register_class(class_name, method, contract_host_function(function))
    }

    /// RT-9, RT-40: loads a template by name through the loader and caches it by version.
    pub fn load_template(&self, name: &str, from: Option<&Frame>, span: Option<Span>) -> Result<Arc<ParsedTemplate>, RenderError> {
        let fail = |code: ErrorCode, message: String| {
            RenderError::Kind(match (from, span) {
                (Some(frame), Some(span)) => TemplateError::at(code, &frame.name, frame.lines.as_ref(), span, message),
                _ => TemplateError::without_position(code, name, message),
            })
        };
        let loaded = match self.loader.load(name) {
            Ok(Some(loaded)) => loaded,
            Ok(None) => return Err(fail(ErrorCode::LoadNotFound, format!("template {name} does not exist"))),
            // RT-9: a load that the loader judges failed is load_failed with its cause, at the tag that names the template.
            Err(LoadError::Kind(error)) if error.code == ErrorCode::LoadFailed => {
                return Err(fail(
                    ErrorCode::LoadFailed,
                    format!("template {name} cannot be loaded: {}", error.message),
                ));
            }
            // Another kind of a loader, such as a data error of the value that it built, is reported at the tag too.
            Err(LoadError::Kind(error)) => return Err(fail(error.code, error.message)),
            // RT-9, FUN-46: the error of a host loader reaches the caller unchanged.
            Err(error @ (LoadError::Raised(_) | LoadError::Callback(_))) => return Err(error),
        };
        // RT-9: a loaded template holds a non-empty version; the type holds a source or an AST.
        if loaded.version().is_empty() {
            return Err(fail(
                ErrorCode::LoadFailed,
                format!("template {name} cannot be loaded: the loader returned no version"),
            ));
        }
        // A cache that a panic of another render poisoned fails the load as internal instead of serving what it holds.
        let poisoned = |error: PoisonError<_>| fail(ErrorCode::Internal, format!("the template cache cannot be read: {error}"));
        if let Some(Cached::Template(version, template)) = self.cache.lock().map_err(poisoned)?.get(name)
            && (self.artifact_refresh == ArtifactRefresh::False
                || (self.artifact_refresh == ArtifactRefresh::True && version == loaded.version()))
        {
            return Ok(Arc::clone(template));
        }
        let version = loaded.version().to_string();
        let template = match loaded {
            Loaded::Ast { ast, lines, .. } => ParsedTemplate {
                ast,
                // RT-9: the line starts that a loader gives with an AST start at 0 and increase.
                lines: match lines {
                    Some(starts) => Some(
                        LineIndex::try_from_starts(starts)
                            .map_err(|cause| fail(ErrorCode::LoadFailed, format!("template {name} cannot be loaded: {cause}")))?,
                    ),
                    None => None,
                },
            },
            Loaded::Source { bytes, .. } => {
                let source = Source::from_bytes(name, &bytes)?;
                let ast = parse_template(&source, self.delimiters)?;
                ParsedTemplate {
                    ast,
                    lines: Some(source.lines),
                }
            }
        };
        let template = Arc::new(template);
        self.cache
            .lock()
            .map_err(|error| fail(ErrorCode::Internal, format!("the template cache cannot be written: {error}")))?
            .insert(name.to_string(), Cached::Template(version, Arc::clone(&template)));
        Ok(template)
    }

    /// RT-77: the template that a render needs. A loader that reads files is not called: the template comes from the
    /// cache that `prepare` or `load` filled, a failure of its load there is reported at the tag, and a name that they
    /// did not load is `load_not_loaded`. A loader of host code is called (RT-9).
    pub(crate) fn render_template(&self, name: &str, from: Option<&Frame>, span: Option<Span>) -> Result<Arc<ParsedTemplate>, RenderError> {
        if !self.loader.blocking_io() {
            return self.load_template(name, from, span);
        }
        let fail = |code: ErrorCode, message: String| {
            RenderError::Kind(match (from, span) {
                (Some(frame), Some(span)) => TemplateError::at(code, &frame.name, frame.lines.as_ref(), span, message),
                _ => TemplateError::without_position(code, name, message),
            })
        };
        let cache = self
            .cache
            .lock()
            .map_err(|error| fail(ErrorCode::Internal, format!("the template cache cannot be read: {error}")))?;
        match cache.get(name) {
            Some(Cached::Template(_, template)) => Ok(Arc::clone(template)),
            Some(Cached::Failed(error)) if matches!(error.code, ErrorCode::LoadNotFound | ErrorCode::LoadFailed) => {
                Err(fail(error.code, error.message.clone()))
            }
            Some(Cached::Failed(error)) => Err(RenderError::Kind(error.clone())),
            None => Err(fail(
                ErrorCode::LoadNotLoaded,
                format!("template {name} is not loaded: a loader that reads files is called by prepare and load only (RT-77)"),
            )),
        }
    }

    /// RT-77: loads the template of a target and every template that its include and block tags name, by their path or
    /// by a template definition of `options.define`, transitively, into the cache that a render reads. It reads files
    /// with a loader that reads files: call it where blocking I/O is expected. The target itself must load; a template
    /// that another names and that fails to load fails the render that reaches it, at its tag. The token `Io` proves that
    /// the call runs where blocking I/O is allowed (binding I-2 (4), B-5 (a)).
    pub fn load(&self, _io: Io, target: RenderTarget<'_>, options: &RenderOptions) -> Result<(), RenderError> {
        let name = target.name();
        internal_boundary(&name, || {
            let registry =
                bind_defines(options.define.as_ref()).map_err(|error| TemplateError::without_position(error.code, &name, error.message))?;
            let (target_name, template) = self.resolve_target(target, &registry, true)?;
            self.preload(&target_name, &template, &registry)
        })
    }

    /// Loads the templates that a loaded template names, transitively (RT-77); does nothing for a loader of host code,
    /// which a render calls.
    fn preload(&self, name: &str, template: &ParsedTemplate, registry: &HashMap<String, DefineEntry>) -> Result<(), RenderError> {
        if !self.loader.blocking_io() {
            return Ok(());
        }
        let mut pending: Vec<String> = registry
            .values()
            .filter_map(|entry| match entry {
                DefineEntry::Template { template, .. } => Some(template.clone()),
                DefineEntry::Html(_) => None,
            })
            .collect();
        named_templates(name, &template.ast.body, &mut pending);
        let mut seen = std::collections::HashSet::from([name.to_string()]);
        while let Some(next) = pending.pop() {
            if !seen.insert(next.clone()) {
                continue;
            }
            match self.load_template(&next, None, None) {
                Ok(loaded) => named_templates(&next, &loaded.ast.body, &mut pending),
                Err(RenderError::Kind(error)) => {
                    self.cache
                        .lock()
                        .map_err(|lock| {
                            TemplateError::without_position(
                                ErrorCode::Internal,
                                &next,
                                format!("the template cache cannot be written: {lock}"),
                            )
                        })?
                        .insert(next, Cached::Failed(error));
                }
                Err(other) => return Err(other),
            }
        }
        Ok(())
    }

    /// Prepares a render request for repeated use. It loads the templates with the loader (RT-77), so it takes the token
    /// `Io`, which proves that the call runs where blocking I/O is allowed (binding I-2 (4), B-5 (a)).
    pub fn prepare<'e>(
        &'e self,
        _io: Io,
        target: RenderTarget<'_>,
        assign: &JsonValue,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'e>, RenderError> {
        self.prepare_root(target, Root::Json(assign), options)
    }

    /// Prepares a render request whose assign is a bound map, which is not bound again (VAL-22). It takes the token `Io`
    /// as `prepare` does.
    pub fn prepare_bound<'e>(
        &'e self,
        _io: Io,
        target: RenderTarget<'_>,
        assign: &BoundMap,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'e>, RenderError> {
        self.prepare_root(target, Root::Bound(assign), options)
    }

    /// The preparation of `prepare` and `prepare_bound`, which the trait `Program` calls for a caller that holds no
    /// token, such as `Engine` and a generated program over a map loader.
    fn prepare_root<'e>(
        &'e self,
        target: RenderTarget<'_>,
        assign: Root<'_>,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'e>, RenderError> {
        let name = target.name();
        internal_boundary(&name, || self.prepare_request(&name, target, assign, options, true))
    }

    fn prepare_request<'e>(
        &'e self,
        name: &str,
        target: RenderTarget<'_>,
        assign: Root<'_>,
        options: &RenderOptions,
        io: bool,
    ) -> Result<PreparedRender<'e>, RenderError> {
        let bound = (|| -> Result<BoundRequest, BindError> {
            let root = match assign {
                Root::Json(json) => Arc::new(bind_map(json)?),
                Root::Bound(bound) => bound_root(bound),
            };
            let registry = bind_defines(options.define.as_ref())?;
            let env = options.environment()?;
            Ok(BoundRequest { root, registry, env })
        })();
        let BoundRequest { root, registry, env } =
            bound.map_err(|error| TemplateError::without_position(error.code, name, error.message))?;
        let (target_name, template) = self.resolve_target(target, &registry, io)?;
        if io {
            self.preload(&target_name, &template, &registry)?;
        }
        let execution = AstPreparedExecution {
            engine: self,
            root,
            registry,
            env,
            target_name,
            template,
        };
        Ok(PreparedRender::new(name, move || execution.render()))
    }

    /// Renders a template with data given as JSON.
    /// RT-77: with a loader that reads files, the templates come from what `prepare` or `load` loaded.
    pub fn render(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<String, RenderError> {
        let name = target.name();
        internal_boundary(&name, || {
            self.prepare_request(&name, target, Root::Json(assign), options, false)?.render()
        })
    }

    /// Renders a template whose assign is a bound map, which is not bound again (VAL-22).
    pub fn render_bound(&self, target: RenderTarget<'_>, assign: &BoundMap, options: &RenderOptions) -> Result<String, RenderError> {
        let name = target.name();
        internal_boundary(&name, || {
            self.prepare_request(&name, target, Root::Bound(assign), options, false)?.render()
        })
    }

    /// Renders a native value map while retaining assigned native objects. The map is bound
    /// under VAL-13: numbers, depth and safe strings are checked like every other host value.
    pub fn render_values(&self, target: RenderTarget<'_>, assign: OrderedMap, options: &RenderOptions) -> Result<String, RenderError> {
        let name = target.name();
        internal_boundary(&name, || self.render_bound_values(&name, target, &assign, options))
    }

    fn render_bound_values(
        &self,
        name: &str,
        target: RenderTarget<'_>,
        assign: &OrderedMap,
        options: &RenderOptions,
    ) -> Result<String, RenderError> {
        let bind_failure = |error: BindError| TemplateError::without_position(error.code, name, error.message);
        let assign = bind_values(assign).map_err(bind_failure)?;
        let registry = bind_defines(options.define.as_ref()).map_err(bind_failure)?;
        let env = options.environment().map_err(bind_failure)?;
        let (target_name, template) = self.resolve_target(target, &registry, false)?;
        AstPreparedExecution {
            engine: self,
            root: Arc::new(assign),
            registry,
            env,
            target_name,
            template,
        }
        .render()
    }
}

impl Program for AstProgram {
    fn prepare(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<PreparedRender<'_>, RenderError> {
        self.prepare_root(target, Root::Json(assign), options)
    }

    fn render(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<String, RenderError> {
        AstProgram::render(self, target, assign, options)
    }

    fn prepare_bound(
        &self,
        target: RenderTarget<'_>,
        assign: &BoundMap,
        options: &RenderOptions,
    ) -> Result<PreparedRender<'_>, RenderError> {
        self.prepare_root(target, Root::Bound(assign), options)
    }

    fn render_bound(&self, target: RenderTarget<'_>, assign: &BoundMap, options: &RenderOptions) -> Result<String, RenderError> {
        AstProgram::render_bound(self, target, assign, options)
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
    /// Creates a prepared operation for the entry template `name` from compiled program state.
    pub fn new(name: &str, render: impl Fn() -> Result<String, RenderError> + Send + Sync + 'e) -> PreparedRender<'e> {
        PreparedRender {
            name: name.to_string(),
            render: Box::new(render),
        }
    }

    /// Renders the prepared request. A panic during the render is `internal` (ERR-13).
    pub fn render(&self) -> Result<String, RenderError> {
        internal_boundary(&self.name, || (self.render)())
    }
}

impl AstPreparedExecution<'_> {
    fn render(&self) -> Result<String, RenderError> {
        let mut context = RenderContext::new(self.engine, Arc::clone(&self.root), self.env.clone(), &self.target_name);
        context.registry = self.registry.clone();
        context.enter(&self.target_name, None, None)?;
        let frame = Frame {
            name: self.template.ast.name.clone(),
            lines: self.template.lines.clone(),
            context: Arc::clone(&self.root),
        };
        let mut scope = Scope::default();
        Renderer::new(&mut context, self.engine).render_nodes(&self.template.ast.body, &frame, &mut scope)?;
        Ok(context.output)
    }
}

fn bind_defines(defines: Option<&Definitions>) -> Result<HashMap<String, DefineEntry>, BindError> {
    let mut registry = HashMap::new();
    // RT-4: an omitted `define` is an empty map.
    let Some(defines) = defines else {
        return Ok(registry);
    };
    for (id, input) in defines.iter() {
        if let Some(html) = &input.html {
            registry.insert(id.to_string(), DefineEntry::Html(html.clone()));
        } else if let Some(template) = &input.template {
            let name = resolve_path("", template).map_err(|error| BindError {
                code: ErrorCode::DataUnsupportedType,
                message: format!("define {id}: {}", error.message),
            })?;
            let bound = bind_data(input.data.as_ref(), input.bound.as_ref()).map_err(|error| BindError {
                code: error.code,
                message: format!("define {id}: {}", error.message),
            })?;
            let data = match bound {
                None => None,
                Some(Value::Map(map)) => Some(map),
                Some(_) => {
                    return Err(BindError {
                        code: ErrorCode::DataUnsupportedType,
                        message: format!("define {id}: data is not a map"),
                    });
                }
            };
            registry.insert(id.to_string(), DefineEntry::Template { template: name, data });
        } else {
            return Err(BindError {
                code: ErrorCode::DataUnsupportedType,
                message: format!("define {id}: entry needs \"template\" or \"html\""),
            });
        }
    }
    Ok(registry)
}

/// Parses template definitions from a JSON object of the `define.json` form (CNF-2). The data of
/// an entry is bound as its own value (VAL-11, VAL-20). An entry field of another JSON type is
/// data_unsupported_type; an absent field is absent.
pub fn defines_from_json(value: &JsonValue) -> Result<Definitions, BindError> {
    let object = json_object(value, "define is not an object")?;
    let mut defines = Definitions::new();
    for (key, entry) in object.iter() {
        let id = json_text(key)?;
        if entry.kind() == JsonKind::String {
            defines.insert(
                id,
                DefineInput {
                    template: Some(json_text(entry)?),
                    data: None,
                    bound: None,
                    html: None,
                },
            );
            continue;
        }
        let fields = json_object(entry, &format!("define {id} is not a path or object"))?;
        let text_field = |name: &str| -> Result<Option<String>, BindError> {
            match fields.get(name).map_err(|error| json_internal(&error))? {
                None => Ok(None),
                Some(field) if field.kind() == JsonKind::String => Ok(Some(json_text(field)?)),
                Some(_) => Err(BindError {
                    code: ErrorCode::DataUnsupportedType,
                    message: format!("define {id}: {name} is not a string"),
                }),
            }
        };
        let data = match fields.get("data").map_err(|error| json_internal(&error))? {
            None => None,
            Some(data) => Some(bind_json(data)?),
        };
        defines.insert(
            id.clone(),
            DefineInput {
                template: text_field("template")?,
                data,
                bound: None,
                html: text_field("html")?,
            },
        );
    }
    Ok(defines)
}

/// The members of a JSON object, or data_unsupported_type with `message` for a value of another kind (RT-4).
fn json_object<'v>(value: &'v JsonValue, message: &str) -> Result<&'v polyspec_json::OrderedMap, BindError> {
    if value.kind() != JsonKind::Object {
        return Err(BindError {
            code: ErrorCode::DataUnsupportedType,
            message: message.to_string(),
        });
    }
    value.members().map_err(|error| json_internal(&error))
}

/// The text of a JSON string whose kind was matched; an unpaired surrogate is data_invalid_utf8 (VAL-12).
fn json_text(value: &JsonValue) -> Result<String, BindError> {
    match value_from_json(value)? {
        Value::Str(text) => Ok(text),
        _ => Err(BindError {
            code: ErrorCode::Internal,
            message: "internal failure: a JSON string is not a string value".to_string(),
        }),
    }
}

/// A failure of an accessor of a JSON value whose kind was matched first: a broken invariant, internal.
fn json_internal(error: &polyspec_json::Error) -> BindError {
    BindError {
        code: ErrorCode::Internal,
        message: format!("internal failure: {error}"),
    }
}

/// Parses an environment from a JSON object of the `env.json` form (RT-4, FUN-42): `timezone` is a string and `now` a
/// number of the value model (VAL-2); an absent `timezone` is `Z` and an absent `now` is the current time.
pub fn env_from_json(value: &JsonValue) -> Result<Env, BindError> {
    let object = json_object(value, "env is not an object")?;
    let timezone = match object.get("timezone").map_err(|error| json_internal(&error))? {
        None => "Z".to_string(),
        Some(text) if text.kind() == JsonKind::String => json_text(text)?,
        Some(_) => {
            return Err(BindError {
                code: ErrorCode::DataUnsupportedType,
                message: "env.timezone is not a string".to_string(),
            });
        }
    };
    let now = match object.get("now").map_err(|error| json_internal(&error))? {
        None => current_time()?,
        Some(number) if number.kind() == JsonKind::Number => match bind_json(number)? {
            Value::Number(now) => now,
            _ => {
                return Err(BindError {
                    code: ErrorCode::Internal,
                    message: "internal failure: a JSON number is not a number value".to_string(),
                });
            }
        },
        Some(_) => {
            return Err(BindError {
                code: ErrorCode::DataUnsupportedType,
                message: "env.now is not a number".to_string(),
            });
        }
    };
    Ok(Env { timezone, now })
}

/// The names of the templates that the include and block tags of `nodes` name by a path, resolved against the template
/// `name` (RT-77); a path that leaves the root is reported by the render that reaches its tag.
fn named_templates(name: &str, nodes: &[Node], names: &mut Vec<String>) {
    for node in nodes {
        match node {
            Node::Include { path, .. } | Node::Block { path: Some(path), .. } => {
                if let Ok(resolved) = resolve_path(name, path) {
                    names.push(resolved);
                }
            }
            Node::If { branches, r#else, .. } => {
                for branch in branches {
                    named_templates(name, &branch.body, names);
                }
                if let Some(body) = r#else {
                    named_templates(name, body, names);
                }
            }
            Node::For { body, empty, .. } => {
                named_templates(name, body, names);
                if let Some(body) = empty {
                    named_templates(name, body, names);
                }
            }
            Node::IfBlock { body, r#else, .. } => {
                named_templates(name, body, names);
                if let Some(body) = r#else {
                    named_templates(name, body, names);
                }
            }
            Node::Text { .. } | Node::Echo { .. } | Node::Set { .. } | Node::Block { path: None, .. } => {}
        }
    }
}
