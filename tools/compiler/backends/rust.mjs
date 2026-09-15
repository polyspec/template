import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'rust';

const rustSpan = span => `[${span.join(', ')}]`;
const rustLines = lines => `LineIndex::from_starts(vec![${lines.join(', ')}])`;
const rustSymbol = (prefix, name) => prefix + name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('');
const rustInput = name => rustSymbol('Input', name);
const rustDefinitionData = name => rustSymbol('DefinitionData', name);
const unaryVariant = { '!': 'polyspec_template::ast::UnaryOp::Not', '-': 'polyspec_template::ast::UnaryOp::Negate' };
const binaryVariant = {
  '+': 'polyspec_template::ast::BinaryOp::Add', '-': 'polyspec_template::ast::BinaryOp::Subtract', '*': 'polyspec_template::ast::BinaryOp::Multiply',
  '/': 'polyspec_template::ast::BinaryOp::Divide', '%': 'polyspec_template::ast::BinaryOp::Remainder', '==': 'polyspec_template::ast::BinaryOp::Equal',
  '!=': 'polyspec_template::ast::BinaryOp::NotEqual', '===': 'polyspec_template::ast::BinaryOp::StrictEqual',
  '!==': 'polyspec_template::ast::BinaryOp::StrictNotEqual', '<': 'polyspec_template::ast::BinaryOp::Less', '>': 'polyspec_template::ast::BinaryOp::Greater',
  '<=': 'polyspec_template::ast::BinaryOp::LessEqual', '>=': 'polyspec_template::ast::BinaryOp::GreaterEqual', in: 'polyspec_template::ast::BinaryOp::In',
};

export function createTarget({ program }) {
  const target = baseTarget(language);
  target.convert = (value, _source, destination) => `generated_result::<${rustType(destination.source)}>(&${value})?`;
  target.literal = value => value === null ? 'Value::Null' : typeof value === 'string' ? `Value::text(${quote(value)})` : typeof value === 'number' ? `Value::Number(${value}f64)` : `Value::Bool(${value})`;
  target.var = (name, _type, node) => program.dynamicRoot ? node.scope ? `scope.lookup(&frame, ${quote(name)})` : `runtime.member(&Value::Map(Rc::clone(root_data)), ${quote(name)})` : `generated_value(&assign.${name})?`;
  target.local = name => `scope.lookup(&frame, ${quote(name)})`;
  target.member = (object, key) => `runtime.member(&${object}, ${quote(key)})`;
  target.set = (name, value, level) => indent(level, `scope.locals.insert(${quote(name)}.to_string(), ${value});`);
  target.text = (value, level, node) => indent(level, `context.write(${quote(value)}, &frame, ${rustSpan(node.span)})?;`);
  target.echo = (expression, level, node) => indent(level, `let escaped = runtime.escape(context, &${expression}, &frame, ${rustSpan(node.expr.span)})?; context.write(&escaped, &frame, ${rustSpan(node.span)})?;`);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `{ let definition = definitions.${fieldName(node.id)}.as_ref();
let Some(html) = definition.and_then(|value| value.html.as_ref()) else { return Err(runtime.error(context, &frame, ${rustSpan(node.span)}, ErrorCode::E_RUNTIME_BLOCK_UNDEFINED, ${quote(`define ${node.id} is not registered`)})); };
context.write(html, &frame, ${rustSpan(node.span)})?;
}`);
    const defaults = node.inputs.filter(item => item.root).map(item => `input.${fieldName(item.name)} = ${target.convert(emitExpression(item.root, target), item.root.valueType, item.valueType)};`).join('\n');
    const defined = node.inputs.map(item => `if let Some(value) = data.${fieldName(item.name)}.clone() { input.${fieldName(item.name)} = value; }`).join('\n');
    const scoped = node.inputs.filter(item => item.scope).map(item => `input.${fieldName(item.name)} = ${target.convert(emitExpression(item.scope, target), item.scope.valueType, item.valueType)};`).join('\n');
    const call = `${functionName(node.target)}(assign, definitions, input, context, runtime, root_data, &mut block_scope)`;
    const mutable = node.inputs.length > 0 ? 'mut ' : '';
    const dataMerge = node.inputs.length > 0 ? `if let Some(data) = definition.as_ref().and_then(|value| value.data.as_ref()) {\n${indent(1, defined)}\n}` : '';
    if (node.id === null) return indent(n, `{ let ${mutable}input = ${rustInput(node.target)}::default();
${defaults}
${scoped}
let mut block_scope = Scope::default();
context.enter(${quote(node.target)}, Some(&frame), Some(${rustSpan(node.span)}))?;
let rendered = ${call};
context.leave();
rendered?;
}`);
    const field = fieldName(node.id);
    const registration = node.path === null
      ? `if definitions.${field}.is_none() { return Err(runtime.error(context, &frame, ${rustSpan(node.span)}, ErrorCode::E_RUNTIME_BLOCK_UNDEFINED, ${quote(`define ${node.id} is not registered`)})); }`
      : `if definitions.${field}.is_none() { definitions.${field} = Some(Definition { template: Some(${quote(node.target)}.to_string()), html: None, data: None }); } else if definitions.${field}.as_ref().is_some_and(|value| value.html.is_some() || value.template.as_deref() != Some(${quote(node.target)})) { return Err(runtime.error(context, &frame, ${rustSpan(node.span)}, ErrorCode::E_RUNTIME_BLOCK_REDEFINED, ${quote(`define ${node.id} is registered with a different template`)})); }`;
    return indent(n, `{ ${registration}
let definition = definitions.${field}.clone();
if let Some(html) = definition.as_ref().and_then(|value| value.html.as_ref()) { context.write(html, &frame, ${rustSpan(node.span)})?; } else {
    let ${mutable}input = ${rustInput(node.target)}::default();
${indent(1, defaults)}
${indent(1, dataMerge)}
${indent(1, scoped)}
    let mut block_scope = Scope::default();
    context.enter(${quote(node.target)}, Some(&frame), Some(${rustSpan(node.span)}))?;
    let rendered = ${call};
    context.leave();
    rendered?;
}
}`);
  };
  target.ifBlock = (node, n) => indent(n, `if definitions.${fieldName(node.id)}.is_some() {
${emitNodes(node.body, target, n + 1)}
}${node.otherwise ? ` else {
${emitNodes(node.otherwise, target, n + 1)}
}` : ''}`);
  target.loopMeta = (loop, field, node) => `generated_loop_meta(runtime, context, scope, &frame, ${rustSpan(node.span)}, ${quote(loop)}, ${quote(field)})?`;
  target.index = (object, index) => `runtime.index(&${object}, &${index})`;
  target.memberCall = (object, method, args, node) => `runtime.member_call(context, &${object}, ${quote(method)}, vec![${args.join(', ')}], &frame, ${rustSpan(node.span)})?`;
  target.classCall = (className, method, args, node) => `runtime.class_call(context, ${quote(className)}, ${quote(method)}, vec![${args.join(', ')}], &frame, ${rustSpan(node.span)})?`;
  target.call = (name, args, node) => `runtime.call(context, ${quote(name)}, vec![${args.join(', ')}], &frame, ${rustSpan(node.span)})?`;
  target.unary = (operator, operand, node) => `runtime.unary(context, ${unaryVariant[operator]}, &${operand}, &frame, ${rustSpan(node.span)})?`;
  target.binary = (operator, left, right, node) => {
    if (operator === '&&') return `{ let left = ${left}; Value::Bool(if !runtime.truthy(&left) { false } else { runtime.truthy(&${right}) }) }`;
    if (operator === '||') return `{ let left = ${left}; Value::Bool(if runtime.truthy(&left) { true } else { runtime.truthy(&${right}) }) }`;
    if (operator === '??') return `{ let left = ${left}; if !matches!(left, Value::Null) { left } else { ${right} } }`;
    return `runtime.binary(context, ${binaryVariant[operator]}, &${left}, &${right}, &frame, ${rustSpan(node.span)})?`;
  };
  target.ternary = (test, thenValue, elseValue) => `if runtime.truthy(&${test}) { ${thenValue} } else { ${elseValue} }`;
  target.list = items => `{ let mut result = Vec::new(); ${items.map(item => item.spread ? `result.extend(runtime.list_spread(context, &${item.value}, &frame, ${rustSpan(item.span)})?);` : `result.push(${item.value});`).join(' ')} Value::list(result) }`;
  target.map = entries => `{ let mut result = RuntimeOrderedMap::new(); ${entries.map(item => item.spread ? `for (key, value) in runtime.map_spread(context, &${item.value}, &frame, ${rustSpan(item.span)})?.iter() { result.insert(key.clone(), value.clone()); }` : `result.insert(runtime.stringify(context, &${item.value[0]}, &frame, ${rustSpan(item.node.key.span)})?, ${item.value[1]});`).join(' ')} Value::map(result) }`;
  target.ifNode = (node, n, scope = []) => node.branches.map((branch, index) => `${'    '.repeat(n)}${index ? '} else if' : 'if'} runtime.truthy(&${emitExpression(branch.test, target)}) {
${emitNodes(branch.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {
${emitNodes(node.otherwise, target, n + 1, scope)}
${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const iterable = emitExpression(node.iter, target);
    return indent(n, `{ let entries = runtime.entries(context, &${iterable}, &frame, ${rustSpan(node.span)})?;
let ${name}_size = entries.len();
let ${name}_last_index = entries.len().saturating_sub(1);
let ${name}_previous = scope.locals.get(${quote(node.name)}).cloned();
for (${name}_index_raw, (${name}_key, ${name}_value)) in entries.iter().cloned().enumerate() {
    scope.locals.insert(${quote(node.name)}.to_string(), ${name}_value.clone());
    scope.loops.entry(${quote(node.name)}.to_string()).or_default().push(polyspec_template::render::context::LoopMeta { index: ${name}_index_raw, key: ${name}_key, value: ${name}_value, first: ${name}_index_raw == 0, last: ${name}_index_raw == ${name}_last_index, size: ${name}_size });
    context.iterations += 1;
    runtime.limit(context, "iteration", context.iterations, &frame, ${rustSpan(node.span)})?;
${emitNodes(node.body, target, n + 1)}
    scope.loops.get_mut(${quote(node.name)}).expect("generated loop stack").pop();
}
if scope.loops.get(${quote(node.name)}).is_some_and(Vec::is_empty) { scope.loops.remove(${quote(node.name)}); }
if let Some(previous) = ${name}_previous { scope.locals.insert(${quote(node.name)}.to_string(), previous); } else { scope.locals.remove(${quote(node.name)}); }${node.empty ? `
if entries.is_empty() {
${emitNodes(node.empty, target, n + 1)}
}` : ''}
}`);
  };
  target.include = (node, n) => indent(n, `context.enter(${quote(node.target)}, Some(&frame), Some(${rustSpan(node.span)}))?;
let rendered = ${functionName(node.target)}(assign, definitions, ${rustInput(node.target)} { ${node.inputs.map(item => `${fieldName(item.name)}: ${target.convert(emitExpression(item.value, target), item.value.valueType, item.valueType)}`).join(', ')} }, context, runtime, root_data, scope);
context.leave();
rendered?;`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const rustRecords = Object.entries(records).map(([name, members]) => `#[derive(Clone, Default, Deserialize, Serialize)] pub struct ${name} { ${Object.entries(members).map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }`).join('\n');
  const inputTypes = templateBodies.map(template => `#[derive(Clone, Default, Deserialize, Serialize)] pub struct ${rustInput(template.name)} { ${[...template.inputs].map(([name, type]) => `pub ${fieldName(name)}: ${rustType(type.source)}`).join(', ')} }`).join('\n');
  const definitionDataTypes = templateBodies.map(template => `#[derive(Clone, Default, Deserialize, Serialize)] pub struct ${rustDefinitionData(template.name)} { ${[...template.inputs].map(([name, type]) => `pub ${fieldName(name)}: Option<${rustType(type.source)}>`).join(', ')} }`).join('\n');
  const definitionsType = `#[derive(Clone, Deserialize, Serialize)] pub struct Definition<T> { pub template: Option<String>, pub html: Option<String>, pub data: Option<T> }\n#[derive(Clone, Default, Deserialize, Serialize)] pub struct Definitions { ${[...program.definitions].map(([name, definition]) => `pub ${fieldName(name)}: Option<Definition<${definition.template ? rustDefinitionData(definition.template) : '()'}>>`).join(', ')} }`;
  const assignType = program.dynamicRoot ? '#[derive(Clone, Default, Deserialize, Serialize)] pub struct Assign {}' : `#[derive(Clone, Default, Deserialize, Serialize)] pub struct Assign {\n${Object.entries(fields).map(([name, type]) => `    pub ${name}: ${rustType(type)},`).join('\n')}\n}`;
  return `// Generated.\nuse polyspec_template::{ErrorCode, OrderedMap as RuntimeOrderedMap, PreparedRender, Program, RenderOptions, RenderTarget, RuntimeEnvironment, TemplateError, Value, bind, to_json_value};\nuse polyspec_template::error::{LineIndex, Span};\nuse polyspec_template::render::context::{Frame, RenderContext, Scope};\nuse polyspec_template::render::runtime_bindings::RuntimeBindings;\nuse serde::{Deserialize, Deserializer, Serialize, Serializer};\nuse serde::de::{DeserializeOwned, MapAccess, Visitor};\nuse serde::ser::SerializeMap;\nuse serde_json::{Map as JsonMap, Value as JsonValue};\nuse std::collections::HashMap;\nuse std::fmt;\nuse std::rc::Rc;\n${rustRecords}\n${assignType}\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}\npub struct ArtifactManifest { pub schema: u32, pub mode: String, pub target: String, pub entry: String, pub source_digest: String, pub type_digest: String, pub contract_digest: String, pub files: HashMap<String, String> }`;
}

export function emitRuntime() {
  return `type GeneratedValue = JsonValue;
#[derive(Clone)] struct OrderedEntry<K, V> { key: K, value: V }
#[derive(Clone, Default)] pub struct OrderedMap<K, V> { entries: Vec<OrderedEntry<K, V>> }
impl<K: PartialEq, V> OrderedMap<K, V> { fn new() -> Self { Self { entries: Vec::new() } } fn set(&mut self, key: K, value: V) { if let Some(entry) = self.entries.iter_mut().find(|entry| entry.key == key) { entry.value = value; } else { self.entries.push(OrderedEntry { key, value }); } } fn get(&self, key: &K) -> Option<&V> { self.entries.iter().find(|entry| &entry.key == key).map(|entry| &entry.value) } fn entries(&self) -> &Vec<OrderedEntry<K, V>> { &self.entries } }
impl<K: Serialize, V: Serialize> Serialize for OrderedMap<K, V> { fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> { let mut map = serializer.serialize_map(Some(self.entries.len()))?; for entry in &self.entries { map.serialize_entry(&entry.key, &entry.value)?; } map.end() } }
struct OrderedMapVisitor<K, V>(std::marker::PhantomData<(K, V)>);
impl<'de, K, V> Visitor<'de> for OrderedMapVisitor<K, V> where K: Deserialize<'de> + PartialEq, V: Deserialize<'de> { type Value = OrderedMap<K, V>; fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result { formatter.write_str("an ordered object") } fn visit_map<A: MapAccess<'de>>(self, mut access: A) -> Result<Self::Value, A::Error> { let mut result = OrderedMap::new(); while let Some((key, value)) = access.next_entry()? { result.set(key, value); } Ok(result) } }
impl<'de, K, V> Deserialize<'de> for OrderedMap<K, V> where K: Deserialize<'de> + PartialEq, V: Deserialize<'de> { fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> { deserializer.deserialize_map(OrderedMapVisitor(std::marker::PhantomData)) } }
fn generated_conversion_error(message: impl Into<String>) -> TemplateError { TemplateError::without_position(ErrorCode::E_RUNTIME_TYPE, "generated", message) }
fn generated_value<T: Serialize>(input: &T) -> Result<Value, TemplateError> { let json = serde_json::to_value(input).map_err(|error| generated_conversion_error(error.to_string()))?; bind(&json).map_err(|error| generated_conversion_error(error.message)) }
fn generated_result<T: DeserializeOwned>(input: &Value) -> Result<T, TemplateError> { serde_json::from_value(to_json_value(input)).map_err(|error| generated_conversion_error(error.to_string())) }
fn generated_loop_meta(runtime: &RuntimeBindings, context: &RenderContext<'_>, scope: &Scope, frame: &Frame, span: Span, name: &str, field: &str) -> Result<Value, TemplateError> { let meta = scope.loop_meta(name).ok_or_else(|| runtime.error(context, frame, span, ErrorCode::E_RUNTIME_UNKNOWN_LOOP, format!("loop {name} is not active")))?; Ok(match field { "index_" => Value::Number(meta.index as f64), "size_" => Value::Number(meta.size as f64), "first_" => Value::Bool(meta.first), "last_" => Value::Bool(meta.last), "key_" => meta.key.clone(), "value_" => meta.value.clone(), _ => return Err(runtime.error(context, frame, span, ErrorCode::E_RUNTIME_UNKNOWN_LOOP, format!("loop {name} has no metadata {field}"))) }) }`;
}

export function emitTemplates(context) {
  return context.templateBodies.map(template => {
    const typed = context.program.templates.get(template.name);
    return `fn ${template.function}(assign: &Assign, definitions: &mut Definitions, input: ${rustInput(template.name)}, context: &mut RenderContext<'_>, runtime: &RuntimeBindings, root_data: &Rc<RuntimeOrderedMap>, scope: &mut Scope) -> Result<(), TemplateError> { let _ = (&assign, &definitions, &input, &runtime, &scope); let frame = Frame { name: ${quote(template.name)}.to_string(), lines: Some(${rustLines(typed.lines)}), context: Rc::clone(root_data) };\n${[...template.inputs].map(([name]) => `scope.locals.insert(${quote(name)}.to_string(), generated_value(&input.${fieldName(name)})?);`).join('\n')}\n${template.body}\n Ok(()) }`;
  }).join('\n');
}

export function emitEntry(context) {
  const dispatch = context.templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${quote(template.name)} => ${template.function}(assign, definitions, ${rustInput(template.name)}::default(), context, runtime, root_data, scope),`).join('\n');
  const definitionCases = [...context.program.definitions].map(([id, definition]) => `            ${quote(id)} => { if let Some(html) = &input.html { if ${definition.html ? 'false' : 'true'} || input.template.is_some() || input.data.is_some() { return Err(generated_error(name, format!("define.{id} has an invalid html entry"))); } plain.insert(id.clone(), serde_json::json!({"html": html})); targets.insert(id.clone(), GeneratedTarget { target: None, html: Some(html.clone()) }); } else { if input.template.as_deref() != Some(${quote(definition.template ?? '')}) { return Err(generated_error(name, format!("define.{id} has an invalid template"))); } plain.insert(id.clone(), serde_json::json!({"template": input.template, "data": input.data})); targets.insert(id.clone(), GeneratedTarget { target: Some(${quote(definition.template ?? '')}.to_string()), html: None }); } },`).join('\n');
  const bindAssign = context.program.dynamicRoot ? 'Assign::default()' : 'serde_json::from_value(assign.clone()).map_err(|error| generated_error(name, error.to_string()))?';
  const nativeRender = context.program.dynamicRoot
    ? `pub fn render_values(&self, target: RenderTarget<'_>, assign: RuntimeOrderedMap, options: &RenderOptions) -> Result<String, TemplateError> { let RenderTarget::Name(name) = target else { return Err(generated_error(${quote(context.program.entry)}, "native generated target must be a template name".to_string())); }; let root_data = Rc::new(assign); let typed_assign = Assign::default(); let (definitions, targets) = generated_bind_definitions(name, &options.define)?; let resolved = targets.get(name); let target_name = resolved.and_then(|value| value.target.clone()).unwrap_or_else(|| name.to_string()); let html = resolved.and_then(|value| value.html.clone()); let env = options.env.clone().unwrap_or_else(|| polyspec_template::Env { timezone: "Z".to_string(), now: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_secs() as f64).unwrap_or(0.0) }); let mut context = RenderContext::new(&self.runtime, Rc::clone(&root_data), env, &target_name); let runtime = RuntimeBindings::new(); let mut scope = Scope::default(); let mut render_definitions = definitions; context.enter(&target_name, None, None)?; let result = if let Some(html) = &html { let frame = Frame { name: target_name.clone(), lines: None, context: Rc::clone(&root_data) }; context.write(html, &frame, [0, 0]) } else { render_template(&target_name, &typed_assign, &mut render_definitions, &mut context, &runtime, &root_data, &mut scope) }; context.leave(); result?; Ok(context.output) }`
    : `pub fn render_values(&self, _target: RenderTarget<'_>, _assign: RuntimeOrderedMap, _options: &RenderOptions) -> Result<String, TemplateError> { Err(generated_error(${quote(context.program.entry)}, "native generated rendering requires a dynamic root".to_string())) }`;
  return `fn render_template(target: &str, assign: &Assign, definitions: &mut Definitions, context: &mut RenderContext<'_>, runtime: &RuntimeBindings, root_data: &Rc<RuntimeOrderedMap>, scope: &mut Scope) -> Result<(), TemplateError> { match target {\n${dispatch}\n        _ => Err(context.fail(ErrorCode::E_LOAD_NOT_FOUND, None, None, format!("template {target} does not exist"))),\n} }\nfn generated_error(template: &str, message: String) -> TemplateError { TemplateError::without_position(ErrorCode::E_DATA_UNSUPPORTED_TYPE, template, message) }\nstruct GeneratedTarget { target: Option<String>, html: Option<String> }\nfn generated_bind_definitions(name: &str, input: &HashMap<String, polyspec_template::DefineInput>) -> Result<(Definitions, HashMap<String, GeneratedTarget>), TemplateError> { let mut plain = JsonMap::new(); let mut targets = HashMap::new(); let _ = (&mut plain, &mut targets, &input); for (id, input) in input { let _ = input; match id.as_str() {\n${definitionCases}\n            _ => return Err(generated_error(name, format!("define.{id} is not declared"))),\n        } } let definitions = serde_json::from_value(JsonValue::Object(plain)).map_err(|error| generated_error(name, error.to_string()))?; Ok((definitions, targets)) }\npub struct GeneratedProgram { pub runtime: RuntimeEnvironment }\nimpl GeneratedProgram { pub fn new(runtime: RuntimeEnvironment) -> GeneratedProgram { GeneratedProgram { runtime } } ${nativeRender} }\nimpl Program for GeneratedProgram { fn prepare(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<PreparedRender<'_>, TemplateError> { let RenderTarget::Name(name) = target else { return Err(generated_error(${quote(context.program.entry)}, "generated target must be a template name".to_string())); }; let typed_assign: Assign = ${bindAssign}; let root_data = Rc::new(polyspec_template::value::bind::bind_map(assign).map_err(|error| TemplateError::without_position(error.code, name, error.message))?); let (definitions, targets) = generated_bind_definitions(name, &options.define)?; let resolved = targets.get(name); let target_name = resolved.and_then(|value| value.target.clone()).unwrap_or_else(|| name.to_string()); let html = resolved.and_then(|value| value.html.clone()); let env = options.env.clone().unwrap_or_else(|| polyspec_template::Env { timezone: "Z".to_string(), now: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_secs() as f64).unwrap_or(0.0) }); Ok(PreparedRender::new(move || { let mut context = RenderContext::new(&self.runtime, Rc::clone(&root_data), env.clone(), &target_name); let runtime = RuntimeBindings::new(); let mut scope = Scope::default(); let mut render_definitions = definitions.clone(); context.enter(&target_name, None, None)?; let result = if let Some(html) = &html { let frame = Frame { name: target_name.clone(), lines: None, context: Rc::clone(&root_data) }; context.write(html, &frame, [0, 0]) } else { render_template(&target_name, &typed_assign, &mut render_definitions, &mut context, &runtime, &root_data, &mut scope) }; context.leave(); result?; Ok(context.output) })) } fn render(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<String, TemplateError> { self.prepare(target, assign, options)?.render() } }`;
}
