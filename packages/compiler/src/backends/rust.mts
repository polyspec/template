import {
  baseTarget, definition, descriptor, fieldName, rustString, rustType, type BackendContext, type Descriptor, type Part, type Target,
} from '../backend-support.mts';
import { loweredTemplate, type Program } from '../ir.mts';

export const language = 'rust';

// A typed program of Rust (docs/spec/compiler.md#typed-programs): the declarations of the type manifest and a
// GeneratedProgram that checks a request against them and renders it with the AstProgram of the crate polyspec-template,
// over the ASTs of the artifact with the line index of their sources. The module holds no template control flow.

// The target writes no template body and no expression: the core executes every template.
const noCode = (): never => { throw new Error('compiler: a typed program of Rust emits no template code'); };

export function createTarget(_input: { program: Program }): Target {
  return {
    ...baseTarget(language), toValue: noCode, loopMeta: noCode, memberCall: noCode, classCall: noCode, index: noCode, call: noCode,
    unary: noCode, binary: noCode, ternary: noCode, list: noCode, map: noCode, block: noCode, ifBlock: noCode, ifNode: noCode,
    forNode: noCode, include: noCode, templateBody: () => '',
  };
}

/** The name of the function that checks a value of the record `name`. */
const recordCheck = (name: string): string => `generated_check_${name.replace(/[A-Z]/g, (letter, at: number) => `${at === 0 ? '' : '_'}${letter.toLowerCase()}`).replace(/[^a-z0-9_]/g, '_')}`;

/**
 * A Rust expression of `Result<(), String>` that checks the `&Value` expression `value` against the manifest type `type`,
 * where the Rust variable `path` is the path of the value in the request; the message is that of ERR-13:
 * `<path> is required` or `<path> is not <expected>`.
 */
function checkOf(type: Descriptor, value: string): string {
  if (type.optional) return `match ${value} { Value::Null => Ok(()), other => ${checkOf({ ...type, optional: false }, 'other')} }`;
  if (type.kind === 'list') return `match ${value} { Value::List(items) => items.iter().enumerate().try_for_each(|(index, item)| { let path = &format!("{path}[{index}]"); ${checkOf(type.item, 'item')} }), other => Err(generated_type_error(other, path, "a list")) }`;
  if (type.kind === 'map') return `match ${value} { Value::Map(map) => map.iter().try_for_each(|(key, item)| { let path = &format!("{path}.{key}"); ${checkOf(type.value, 'item')} }), other => Err(generated_type_error(other, path, "an object")) }`;
  if (type.kind === 'record') return `${recordCheck(type.name)}(${value}, path)`;
  if (type.kind === 'string') return `match ${value} { text if text.as_text().is_some() => Ok(()), other => Err(generated_type_error(other, path, "a string")) }`;
  if (type.kind === 'number') return `match ${value} { Value::Number(_) => Ok(()), other => Err(generated_type_error(other, path, "a number")) }`;
  if (type.kind === 'boolean') return `match ${value} { Value::Bool(_) => Ok(()), other => Err(generated_type_error(other, path, "a boolean")) }`;
  if (type.kind === 'null') return `match ${value} { Value::Null => Ok(()), other => Err(generated_type_error(other, path, "null")) }`;
  // any: every value, null included.
  return `{ let _: (&Value, &str) = (${value}, path); Ok::<(), String>(()) }`;
}

// A typed program declares its whole API, and a host calls the part that it needs, so an item that it does not call is no
// dead code of the host.
const API = '#[allow(dead_code, reason = "a typed program declares its whole API; a host calls the part that it needs")]';

const fieldsCheck = (members: Record<string, string>): string => Object.entries(members)
  .map(([key, type]) => `{ let path = &format!("{path}.${key}"); let value = match map.get(${rustString(key)}) { Some(value) => value, None => &Value::Null }; ${checkOf(descriptor(type), 'value')}?; }`)
  .join(' ');

const recordCheckCode = (name: string, members: Record<string, string>): string =>
  `fn ${recordCheck(name)}(input: &Value, path: &str) -> Result<(), String> { let Value::Map(map) = input else { return Err(generated_type_error(input, path, "an object")); }; let _: &polyspec_template::OrderedMap = map; ${fieldsCheck(members)} Ok(()) }`;

/** A typed structure with the conversion of its fields to the value model, in the order of the manifest (VAL-21). */
const recordType = (name: string, members: Record<string, string>): string => {
  const fields = Object.entries(members);
  return `${API}
#[derive(Clone, Debug, Default)] pub struct ${name} { ${fields.map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }
impl GeneratedValue for ${name} { fn to_value(&self) -> Value { let ${fields.length > 0 ? 'mut ' : ''}map = polyspec_template::OrderedMap::new(); ${fields.map(([key]) => `map.insert(${rustString(key)}.to_string(), self.${key}.to_value());`).join(' ')} Value::map(map) } }`;
};

export function emitDeclarations(context: BackendContext): Part[] {
  const { program, manifest } = context;
  const fields: Record<string, string> = program.dynamicRoot ? {} : manifest.fields;
  const records = Object.entries(manifest.records).map(([name, members]) => definition(name, recordType(name, members), new RegExp(`\\b${name}\\b`)));
  return [
    `// Generated by @polyspec/template-compiler. DO NOT EDIT.
use polyspec_template::polyspec_json::Value as JsonValue;
use polyspec_template::{AstProgram, BoundMap, EngineOptions, MapLoader, PreparedRender, RenderError, RenderOptions, RenderTarget, TemplateError, Value};
${recordType('Assign', fields)}`,
    ...records,
  ];
}

export function emitRuntime(context: BackendContext): Part[] {
  return [
    `/// A typed value in the value model of the runtime (VAL-21).
${API}
pub trait GeneratedValue { fn to_value(&self) -> Value; }
impl GeneratedValue for Value { fn to_value(&self) -> Value { self.clone() } }
impl GeneratedValue for String { fn to_value(&self) -> Value { Value::text(self.clone()) } }
impl GeneratedValue for f64 { fn to_value(&self) -> Value { Value::Number(*self) } }
impl GeneratedValue for bool { fn to_value(&self) -> Value { Value::Bool(*self) } }
impl<T: GeneratedValue> GeneratedValue for Option<T> { fn to_value(&self) -> Value { match self { Some(value) => value.to_value(), None => Value::Null } } }
impl<T: GeneratedValue> GeneratedValue for Vec<T> { fn to_value(&self) -> Value { Value::list(self.iter().map(T::to_value).collect()) } }`,
    definition('OrderedMap', `/// The entries of a typed map in their order.
${API}
#[derive(Clone, Debug, Default)] pub struct OrderedMap<K, V> { pub entries: Vec<(K, V)> }
impl<V: GeneratedValue> GeneratedValue for OrderedMap<String, V> { fn to_value(&self) -> Value { let mut map = polyspec_template::OrderedMap::new(); for (key, value) in &self.entries { map.insert(key.clone(), value.to_value()); } Value::map(map) } }`, /(?<![:\w])OrderedMap</),
    `fn generated_type_error(input: &Value, path: &str, expected: &str) -> String { if matches!(input, Value::Null) { format!("{path} is required") } else { format!("{path} is not {expected}") } }`,
    ...Object.entries(context.manifest.records).map(([name, members]) => definition(recordCheck(name), recordCheckCode(name, members))),
  ];
}

export function emitTemplates(context: BackendContext): string {
  const graph = context.graph;
  if (graph === undefined) throw new Error('compiler: the Rust target needs the ASTs of the source graph');
  // The canonical AST JSON of each template and the line starts of its source, as the artifact records them.
  const entries = [...graph.templates].map(([name, ast]) => `    (${rustString(name)}, ${rustString(JSON.stringify(ast))}, &[${(graph.lines.get(name) ?? [0]).join(', ')}]),`);
  return `/// The templates of the program: name, AST JSON and the starts of the lines of the source.
const TEMPLATES: &[(&str, &str, &[usize])] = &[
${entries.join('\n')}
];`;
}

/** The check of the definitions of a request: declared ids, their form and the types of their data. */
function definitionsCheck(program: Program): string {
  const cases = [...program.definitions].map(([id, declared]) => {
    const inputs = declared.template ? [...loweredTemplate(program, declared.template).inputs] : [];
    const dataCheck = inputs.map(([name, type]) => `if let Some(value) = map.get(${rustString(name)}) { let path = &format!("define.{id}.data.${name}"); ${checkOf(descriptor(type.source), 'value')}?; }`).join('\n');
    const data = ` else if let Some(data) = &input.data { match polyspec_template::bind_data(data) { Ok(Value::Map(${dataCheck ? 'map' : '_'})) => { ${dataCheck} } Ok(_) => return Err(format!("define.{id}.data is not an object")), Err(error) => return Err(error.message) } }`;
    return `            ${rustString(id)} => { if input.html.is_some() { if ${declared.html ? 'false' : 'true'} || input.template.is_some() || input.data.is_some() { return Err(format!("define.{id} has an invalid html entry")); } } else if input.template.as_deref() != Some(${rustString(declared.template ?? '')}) { return Err(format!("define.{id} has an invalid template")); }${declared.template ? data : ''} }`;
  });
  // Without a declared definition every entry of a request fails, so the check fails on the first one.
  if (cases.length === 0) return `fn generated_check_definitions(define: &std::collections::HashMap<String, polyspec_template::DefineInput>) -> Result<(), String> {
    match define.keys().next() {
        Some(id) => Err(format!("define.{id} is not declared")),
        None => Ok(()),
    }
}`;
  return `fn generated_check_definitions(define: &std::collections::HashMap<String, polyspec_template::DefineInput>) -> Result<(), String> {
    for (id, input) in define {
        let _: &polyspec_template::DefineInput = input;
        match id.as_str() {
${cases.join('\n')}
            _ => return Err(format!("define.{id} is not declared")),
        }
    }
    Ok(())
}`;
}

export function emitEntry(context: BackendContext): string {
  const { program } = context;
  const fields: Record<string, string> = program.dynamicRoot ? {} : context.manifest.fields;
  return `${definitionsCheck(program)}
// An assign that is not a map is the data error of RT-44, which the render reports.
fn generated_check_assign(input: &Value) -> Result<(), String> { let path = "assign"; let _: &str = path; match input { Value::Null => Ok(()), Value::Map(map) => { let _: &polyspec_template::OrderedMap = map; ${fieldsCheck(fields)} Ok(()) } _ => Ok(()) } }

/// The failure of a typed program: a request that its declarations reject (ERR-13), or the failure of the render.
#[derive(Debug)]
pub enum GeneratedError {
    /// A value of the request does not have its declared type, or a definition is not declared.
    Argument(String),
    /// The render failed.
    Render(RenderError),
}
impl From<RenderError> for GeneratedError { fn from(error: RenderError) -> GeneratedError { GeneratedError::Render(error) } }
impl From<TemplateError> for GeneratedError { fn from(error: TemplateError) -> GeneratedError { GeneratedError::Render(RenderError::Kind(error)) } }
impl std::fmt::Display for GeneratedError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { GeneratedError::Argument(message) => formatter.write_str(message), GeneratedError::Render(error) => write!(formatter, "{error}") }
    }
}
impl std::error::Error for GeneratedError {}

/// The typed program: its templates render with the AstProgram of the runtime (docs/spec/compiler.md#typed-programs).
pub struct GeneratedProgram { program: AstProgram }
${API}
impl GeneratedProgram {
    /// The program over the templates of the artifact; the loader of \`options\` is replaced by the templates.
    pub fn new(options: EngineOptions) -> Result<GeneratedProgram, GeneratedError> {
        let mut loader = MapLoader::new();
        for (name, ast, lines) in TEMPLATES {
            let ast = polyspec_template::decode_template(ast)?;
            loader.set_ast_lines(name, lines.to_vec(), ast).map_err(GeneratedError::Argument)?;
        }
        Ok(GeneratedProgram { program: AstProgram::new(EngineOptions { loader: Some(Box::new(loader)), ..options })? })
    }
    /// The AST program, to register host functions.
    pub fn program_mut(&mut self) -> &mut AstProgram { &mut self.program }
    /// Renders a request whose assign is JSON data, after checking it against the declarations.
    pub fn render(&self, target: &str, assign: &JsonValue, options: &RenderOptions) -> Result<String, GeneratedError> {
        let root = polyspec_template::bind_json(assign).map_err(|error| TemplateError::without_position(error.code, target, error.message))?;
        generated_check_assign(&root).map_err(GeneratedError::Argument)?;
        generated_check_definitions(&options.define).map_err(GeneratedError::Argument)?;
        Ok(self.program.render(RenderTarget::Name(target), assign, options)?)
    }
    /// Prepares a request whose assign is JSON data for repeated renders, after checking it against the declarations.
    pub fn prepare(&self, target: &str, assign: &JsonValue, options: &RenderOptions) -> Result<PreparedRender<'_>, GeneratedError> {
        let root = polyspec_template::bind_json(assign).map_err(|error| TemplateError::without_position(error.code, target, error.message))?;
        generated_check_assign(&root).map_err(GeneratedError::Argument)?;
        generated_check_definitions(&options.define).map_err(GeneratedError::Argument)?;
        Ok(self.program.prepare(RenderTarget::Name(target), assign, options)?)
    }
    /// Renders a request whose assign is a bound map (VAL-22), after checking it against the declarations.
    pub fn render_bound(&self, target: &str, assign: &BoundMap, options: &RenderOptions) -> Result<String, GeneratedError> {
        generated_check_assign(&Value::Map(polyspec_template::bound_root(assign))).map_err(GeneratedError::Argument)?;
        generated_check_definitions(&options.define).map_err(GeneratedError::Argument)?;
        Ok(self.program.render_bound(RenderTarget::Name(target), assign, options)?)
    }
    /// Prepares a request whose assign is a bound map (VAL-22), after checking it against the declarations.
    pub fn prepare_bound(&self, target: &str, assign: &BoundMap, options: &RenderOptions) -> Result<PreparedRender<'_>, GeneratedError> {
        generated_check_assign(&Value::Map(polyspec_template::bound_root(assign))).map_err(GeneratedError::Argument)?;
        generated_check_definitions(&options.define).map_err(GeneratedError::Argument)?;
        Ok(self.program.prepare_bound(RenderTarget::Name(target), assign, options)?)
    }
    /// Renders a request whose assign is a map of values that the host built, native objects included (VAL-13, VAL-18),
    /// after checking it against the declarations.
    pub fn render_values(&self, target: &str, assign: polyspec_template::OrderedMap, options: &RenderOptions) -> Result<String, GeneratedError> {
        let root = polyspec_template::bind_values(&assign).map_err(|error| TemplateError::without_position(error.code, target, error.message))?;
        generated_check_assign(&Value::map(root)).map_err(GeneratedError::Argument)?;
        generated_check_definitions(&options.define).map_err(GeneratedError::Argument)?;
        Ok(self.program.render_values(RenderTarget::Name(target), assign, options)?)
    }
    /// Renders a request whose assign is the typed \`Assign\`.
    pub fn render_assign(&self, target: &str, assign: &Assign, options: &RenderOptions) -> Result<String, GeneratedError> {
        generated_check_definitions(&options.define).map_err(GeneratedError::Argument)?;
        let Value::Map(map) = assign.to_value() else { return Err(GeneratedError::Argument("assign is not an object".to_string())); };
        Ok(self.program.render_values(RenderTarget::Name(target), (*map).clone(), options)?)
    }
}`;
}
