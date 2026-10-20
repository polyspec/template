import type { Span } from '@polyspec/template';
import {
  baseTarget, definition, descriptor, emitExpression, emitNodes, fieldName, functionName, indent, rustString, rustType,
  type BackendContext, type Descriptor, type Part, type Target,
} from '../backend-support.mts';
import { loweredTemplate, type BlockInput, type Expr, type ExprOf, type Program, type ValueType } from '../ir.mts';

export const language = 'rust';

const rustSpan = (span: Span): string => `[${span.join(', ')}]`;
const rustLines = (lines: number[]): string => `LineIndex::from_starts(vec![${lines.join(', ')}])`;
const rustSymbol = (prefix: string, name: string): string => prefix + name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join('');
const rustInput = (name: string): string => rustSymbol('Input', name);
const rustDefinitionData = (name: string): string => rustSymbol('DefinitionData', name);
// A typed value of generated Rust is read from a canonical Value into the Rust type of its destination.
// A runtime conversion names the value by the input that it fills (ERR-13 paths name request values only).
const convert = (value: string, destination: ValueType, name: string): string => `generated_result::<${rustType(destination.source)}>(&${value}, ${rustString(name)})?`;
const unaryVariant: Record<ExprOf<'unary'>['operator'], string> = { '!': 'polyspec_template::ast::UnaryOp::Not', '-': 'polyspec_template::ast::UnaryOp::Negate' };
const binaryVariant: Record<Exclude<ExprOf<'binary'>['operator'], '&&' | '||' | '??'>, string> = {
  '+': 'polyspec_template::ast::BinaryOp::Add', '-': 'polyspec_template::ast::BinaryOp::Subtract', '*': 'polyspec_template::ast::BinaryOp::Multiply',
  '/': 'polyspec_template::ast::BinaryOp::Divide', '%': 'polyspec_template::ast::BinaryOp::Remainder', '==': 'polyspec_template::ast::BinaryOp::Equal',
  '!=': 'polyspec_template::ast::BinaryOp::NotEqual', '===': 'polyspec_template::ast::BinaryOp::StrictEqual',
  '!==': 'polyspec_template::ast::BinaryOp::StrictNotEqual', '<': 'polyspec_template::ast::BinaryOp::Less', '>': 'polyspec_template::ast::BinaryOp::Greater',
  '<=': 'polyspec_template::ast::BinaryOp::LessEqual', '>=': 'polyspec_template::ast::BinaryOp::GreaterEqual', in: 'polyspec_template::ast::BinaryOp::In',
};

export function createTarget({ program }: { program: Program }): Target {
  const target: Target = {
  ...baseTarget(language),
  literal: value => value === null ? 'Value::Null' : typeof value === 'string' ? `Value::text(${rustString(value)})` : typeof value === 'number' ? `Value::Number(${value}f64)` : `Value::Bool(${value})`,
  var: (name, _type, node) => program.dynamicRoot ? node.scope ? `scope.lookup(&frame, ${rustString(name)})` : `runtime.member(context, &Value::Map(Rc::clone(root_data)), ${rustString(name)}, &frame, ${rustSpan(node.span)})?` : `generated_value(&assign.${name})?`,
  local: name => `scope.lookup(&frame, ${rustString(name)})`,
  // Generated Rust reads every typed value as a canonical Value, so a value needs no conversion.
  toValue: value => value,
  member: (object, key, _owner, node) => `runtime.member(context, &${object}, ${rustString(key)}, &frame, ${rustSpan(node.span)})?`,
  set: (name, value, level) => indent(level, `scope.locals.insert(${rustString(name)}.to_string(), ${value});`),
  text: (value, level, node) => indent(level, `context.write(${rustString(value)}, &frame, ${rustSpan(node.span)})?;`),
  echo: (expression, level, node) => indent(level, `let escaped = runtime.escape(context, &${expression}, &frame, ${rustSpan(node.expr.span)})?; context.write(&escaped, &frame, ${rustSpan(node.span)})?;`),
  block: (node, n) => {
    if (node.target === null) return indent(n, `{ let definition = definitions.${fieldName(node.id)}.as_ref();
let Some(html) = definition.and_then(|value| value.html.as_ref()) else { return Err(runtime.error(context, &frame, ${rustSpan(node.span)}, ErrorCode::E_RUNTIME_BLOCK_UNDEFINED, ${rustString(`define ${node.id} is not registered`)})); };
context.write(html, &frame, ${rustSpan(node.span)})?;
}`);
    const value = (item: BlockInput, expression: Expr | null): [string, string][] => expression === null ? [] : [[fieldName(item.name), convert(emitExpression(expression, target), item.valueType, item.name)]];
    const defaults = node.inputs.flatMap(item => value(item, item.root));
    const scopedFields = node.inputs.flatMap(item => value(item, item.scope));
    // Definition data replaces each field that it holds, one `if let` chain per field.
    const dataMerge = node.id !== null ? node.inputs.map(item => `if let Some(data) = definition.as_ref().and_then(|value| value.data.as_ref()) && let Some(value) = data.${fieldName(item.name)}.clone() { input.${fieldName(item.name)} = value; }`) : [];
    // The input starts as a struct expression, never as a default value that assignments then change
    // (clippy::field_reassign_with_default); a scoped field is assigned after the defaults and the data.
    const initial = defaults.length > 0 || dataMerge.length > 0 ? defaults : scopedFields;
    const assigned = initial === scopedFields ? [] : scopedFields;
    const fields = initial.map(([name, expression]) => `${name}: ${expression}`);
    const rest = initial.length < node.inputs.length ? '..Default::default()' : '';
    const construct = fields.length === 0 ? `${rustInput(node.target)}::default()` : `${rustInput(node.target)} { ${[...fields, rest].filter(Boolean).join(', ')} }`;
    const mutable = dataMerge.length > 0 || assigned.length > 0 ? 'mut ' : '';
    const inputLines = [`let ${mutable}input = ${construct};`, ...dataMerge, ...assigned.map(([name, expression]) => `input.${name} = ${expression};`)].join('\n');
    const call = `${functionName(node.target)}(assign, definitions, input, context, runtime, root_data, &mut block_scope)`;
    if (node.id === null) return indent(n, `{ ${inputLines}
let mut block_scope = Scope::default();
context.enter(${rustString(node.target)}, Some(&frame), Some(${rustSpan(node.span)}))?;
let rendered = ${call};
context.leave();
rendered?;
}`);
    const field = fieldName(node.id);
    const registration = node.path === null
      ? `if definitions.${field}.is_none() { return Err(runtime.error(context, &frame, ${rustSpan(node.span)}, ErrorCode::E_RUNTIME_BLOCK_UNDEFINED, ${rustString(`define ${node.id} is not registered`)})); }`
      : `if definitions.${field}.is_none() { definitions.${field} = Some(Definition { template: Some(${rustString(node.target)}.to_string()), ..Default::default() }); } else if definitions.${field}.as_ref().is_some_and(|value| value.html.is_some() || value.template.as_deref() != Some(${rustString(node.target)})) { return Err(runtime.error(context, &frame, ${rustSpan(node.span)}, ErrorCode::E_RUNTIME_BLOCK_REDEFINED, ${rustString(`define ${node.id} is registered with a different template`)})); }`;
    return indent(n, `{ ${registration}
let definition = definitions.${field}.clone();
if let Some(html) = definition.as_ref().and_then(|value| value.html.as_ref()) { context.write(html, &frame, ${rustSpan(node.span)})?; } else {
${indent(1, inputLines)}
    let mut block_scope = Scope::default();
    context.enter(${rustString(node.target)}, Some(&frame), Some(${rustSpan(node.span)}))?;
    let rendered = ${call};
    context.leave();
    rendered?;
}
}`);
  },
  ifBlock: (node, n) => indent(n, `if definitions.${fieldName(node.id)}.is_some() {
${emitNodes(node.body, target, n + 1)}
}${node.otherwise ? ` else {
${emitNodes(node.otherwise, target, n + 1)}
}` : ''}`),
  loopMeta: (loop, field, node) => `generated_loop_meta(runtime, context, scope, &frame, ${rustSpan(node.span)}, ${rustString(loop)}, ${rustString(field)})?`,
  index: (object, index, _owner, node) => `runtime.index(context, &${object}, &${index}, &frame, ${rustSpan(node.span)})?`,
  memberCall: (object, method, args, node) => `runtime.member_call(context, &${object}, ${rustString(method)}, vec![${args.join(', ')}], &frame, ${rustSpan(node.span)})?`,
  classCall: (className, method, args, node) => `runtime.class_call(context, ${rustString(className)}, ${rustString(method)}, vec![${args.join(', ')}], &frame, ${rustSpan(node.span)})?`,
  call: (name, args, node) => `runtime.call(context, ${rustString(name)}, vec![${args.join(', ')}], &frame, ${rustSpan(node.span)})?`,
  unary: (operator, operand, node) => `runtime.unary(context, ${unaryVariant[operator]}, &${operand}, &frame, ${rustSpan(node.span)})?`,
  binary: (operator, left, right, node) => {
    if (operator === '&&') return `{ let left = ${left}; Value::Bool(if !runtime.truthy(&left) { false } else { runtime.truthy(&${right}) }) }`;
    if (operator === '||') return `{ let left = ${left}; Value::Bool(if runtime.truthy(&left) { true } else { runtime.truthy(&${right}) }) }`;
    if (operator === '??') return `{ let left = ${left}; if !matches!(left, Value::Null) { left } else { ${right} } }`;
    return `runtime.binary(context, ${binaryVariant[operator]}, &${left}, &${right}, &frame, ${rustSpan(node.span)})?`;
  },
  ternary: (test, thenValue, elseValue) => `if runtime.truthy(&${test}) { ${thenValue} } else { ${elseValue} }`,
  // An empty list literal binds no mutable vector, so the generated module compiles without warnings.
  list: (items, _type, node) => items.length === 0 ? `runtime.depth(context, Value::list(Vec::new()), &frame, ${rustSpan(node.span)})?` : `{ let mut result = Vec::new(); ${items.map(item => item.spread ? `result.extend(runtime.list_spread(context, &${item.value}, &frame, ${rustSpan(item.span)})?);` : `result.push(${item.value});`).join(' ')} runtime.depth(context, Value::list(result), &frame, ${rustSpan(node.span)})? }`,
  map: (entries, _type, node) => `{ let mut result = RuntimeOrderedMap::new(); ${entries.map(item => item.spread ? `for (key, value) in runtime.map_spread(context, &${item.value}, &frame, ${rustSpan(item.span)})?.iter() { result.insert(key.clone(), value.clone()); }` : `result.insert(runtime.stringify(context, &${item.value[0]}, &frame, ${rustSpan(item.node.key.span)})?, ${item.value[1]});`).join(' ')} runtime.depth(context, Value::map(result), &frame, ${rustSpan(node.span)})? }`,
  ifNode: (node, n) => node.branches.map((branch, index) => `${'    '.repeat(n)}${index ? '} else if' : 'if'} runtime.truthy(&${emitExpression(branch.test, target)}) {
${emitNodes(branch.body, target, n + 1)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {
${emitNodes(node.otherwise, target, n + 1)}
${'    '.repeat(n)}}` : ''}`,
  forNode: (node, n) => {
    const name = fieldName(node.name);
    const iterable = emitExpression(node.iter, target);
    return indent(n, `{ let entries = runtime.entries(context, &${iterable}, &frame, ${rustSpan(node.span)})?;
let ${name}_size = entries.len();
let ${name}_last_index = entries.len().saturating_sub(1);
let ${name}_previous = scope.locals.get(${rustString(node.name)}).cloned();
for (${name}_index_raw, (${name}_key, ${name}_value)) in entries.iter().cloned().enumerate() {
    scope.locals.insert(${rustString(node.name)}.to_string(), ${name}_value.clone());
    scope.loops.entry(${rustString(node.name)}.to_string()).or_default().push(polyspec_template::render::context::LoopMeta { index: ${name}_index_raw, key: ${name}_key, value: ${name}_value, first: ${name}_index_raw == 0, last: ${name}_index_raw == ${name}_last_index, size: ${name}_size });
    context.iterations += 1;
    runtime.limit(context, "iteration", context.iterations, &frame, ${rustSpan(node.span)})?;
${emitNodes(node.body, target, n + 1)}
    scope.loops.get_mut(${rustString(node.name)}).expect("generated loop stack").pop();
}
if scope.loops.get(${rustString(node.name)}).is_some_and(Vec::is_empty) { scope.loops.remove(${rustString(node.name)}); }
if let Some(previous) = ${name}_previous { scope.locals.insert(${rustString(node.name)}.to_string(), previous); } else { scope.locals.remove(${rustString(node.name)}); }${node.empty ? `
if entries.is_empty() {
${emitNodes(node.empty, target, n + 1)}
}` : ''}
}`);
  },
  include: (node, n) => indent(n, `context.enter(${rustString(node.target)}, Some(&frame), Some(${rustSpan(node.span)}))?;
let rendered = ${functionName(node.target)}(assign, definitions, ${rustInput(node.target)} { ${node.inputs.map(item => `${fieldName(item.name)}: ${convert(emitExpression(item.value, target), item.valueType, item.name)}`).join(', ')} }, context, runtime, root_data, scope);
context.leave();
rendered?;`),
  };
  return target;
}

/** What the templates of a program use, so the program declares nothing else (T24.29, T24.31). */
interface RustUsage {
  /** Whether a value is converted back to a Value: a read of a typed root field or a template input. */
  toValue: boolean;
  /** Whether a block reads the template of a definition, which only a registration by path does. */
  definitionTemplate: boolean;
  /** Whether a block merges the data of a definition into its input. */
  definitionData: boolean;
  /** The fields of the root that a template reads. */
  readFields: Set<string>;
}

function rustUsage(context: BackendContext): RustUsage {
  const bodies = context.templateBodies.map(template => template.body).join('\n');
  return {
    toValue: /\bgenerated_value\(|\.to_value\(\)/.test(bodies) || context.templateBodies.some(template => template.inputs.size > 0),
    definitionTemplate: /\bvalue\.template\b/.test(bodies),
    definitionData: /\bvalue\.data\b/.test(bodies),
    readFields: new Set(Object.keys(context.manifest.fields).filter(name => new RegExp(`\\bassign\\.${name}\\b`).test(bodies))),
  };
}

/** An implementation of GeneratedConvert: `from_value` with the body `from`, and `to_value` with the body `to` when the program uses it. */
const convertImpl = (usage: RustUsage, header: string, from: string, to: string): string =>
  `${header} { fn from_value(input: &Value, path: &str) -> Result<Self, TemplateError> ${from}${usage.toValue ? ` fn to_value(&self) -> Value ${to}` : ''} }`;

// A value that the program checks but never reads, such as a root field that no template reads or the data of a definition
// that no block merges, is checked without a value of its type, so the program constructs no type that it does not read
// and fails on the same values with the same messages as from_value (T24.31).
const recordCheck = (name: string): string => `generated_check_${name.replace(/[A-Z]/g, (letter, at: number) => `${at === 0 ? '' : '_'}${letter.toLowerCase()}`).replace(/[^a-z0-9_]/g, '_')}`;

/**
 * A Rust expression of `Result<(), TemplateError>` that checks the `&Value` expression `value` against the manifest type
 * `type`, where the Rust variable `path` is the path of the value in the request (T24.33).
 */
function checkOf(type: string, value: string): string {
  return checkDescriptor(descriptor(type), value);
}

function checkDescriptor(type: Descriptor, value: string): string {
  if (type.optional) return `match ${value} { Value::Null => Ok(()), other => ${checkDescriptor({ ...type, optional: false }, 'other')} }`;
  if (type.kind === 'list') return `match ${value} { Value::List(items) => items.iter().enumerate().try_for_each(|(index, item)| { let path = &format!("{path}[{index}]"); ${checkDescriptor(type.item, 'item')} }), other => Err(generated_type_error(other, path, "a list")) }`;
  if (type.kind === 'map') return `match ${value} { Value::Map(map) => map.iter().try_for_each(|(key, item)| { ${checkDescriptor(type.key, '&Value::text(key.clone())')}?; let path = &format!("{path}.{key}"); ${checkDescriptor(type.value, 'item')} }), other => Err(generated_type_error(other, path, "an object")) }`;
  if (type.kind === 'record') return `${recordCheck(type.name)}(${value}, path)`;
  return `<${rustType(type.kind)} as GeneratedConvert>::from_value(${value}, path).map(drop)`;
}

const recordCheckCode = (name: string, members: Record<string, string>): string => {
  const fields = Object.entries(members).map(([key, type]) => `generated_check_field(map, path, ${rustString(key)}, |value, path| ${checkOf(type, 'value')})?;`);
  const map = fields.length > 0 ? `let Value::Map(map) = input else { return Err(generated_type_error(input, path, "an object")); }; ${fields.join(' ')}` : `if !matches!(input, Value::Map(_)) { return Err(generated_type_error(input, path, "an object")); }`;
  return `fn ${recordCheck(name)}(input: &Value, path: &str) -> Result<(), TemplateError> { ${map} Ok(()) }`;
};

// Generated Rust converts between runtime values and typed structs with GeneratedConvert, never
// through JSON, so a native object in an `any` value reaches includes, blocks and definition data
// as the same TemplateObject (VAL-18). `read` names the members that the struct holds; every other member is checked.
const recordConvert = (usage: RustUsage, name: string, members: Record<string, string>, read: (member: string) => boolean = () => true): string => {
  const held = Object.keys(members).filter(read);
  const steps = Object.entries(members).map(([key, type]) => read(key) ? `let ${key} = generated_field(map, path, ${rustString(key)})?;` : `generated_check_field(map, path, ${rustString(key)}, |value, path| ${checkOf(type, 'value')})?;`);
  const from = `{ let Value::Map(map) = input else { return Err(generated_type_error(input, path, "an object")); }; let _: &Rc<RuntimeOrderedMap> = map; let _: &str = path; ${steps.join(' ')} Ok(${name} { ${held.join(', ')} }) }`;
  const to = `{ let ${held.length ? 'mut ' : ''}map = RuntimeOrderedMap::new(); ${held.map(key => `map.insert(${rustString(key)}.to_string(), self.${key}.to_value());`).join(' ')} Value::map(map) }`;
  return convertImpl(usage, `impl GeneratedConvert for ${name}`, from, to);
};

export function emitDeclarations(context: BackendContext): Part[] {
  const { program, manifest, templateBodies } = context;
  const usage = rustUsage(context);
  const fields = manifest.fields;
  // A record is kept when a kept part names it as a type; its own error message does not count (T24.31).
  const rustRecords = Object.entries(manifest.records).map(([name, members]) => definition(name, `#[derive(Clone, Default)] pub struct ${name} { ${Object.entries(members).map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }\n${recordConvert(usage, name, members)}`, new RegExp(`\\b${name}\\b(?! is not a map)`)));
  const inputTypes = templateBodies.map(template => `#[derive(Clone, Default)] pub struct ${rustInput(template.name)} { ${[...template.inputs].map(([name, type]) => `pub ${fieldName(name)}: ${rustType(type.source)}`).join(', ')} }`).join('\n');
  // A program declares the definition types that its blocks read (T24.29, T24.31): DefinitionData<T> of each template that a
  // definition names when a block merges definition data, and Definition with the template only when a block registers a
  // definition by path. A binary crate reports any other type or field as dead code.
  const definitionTargets = new Set([...program.definitions.values()].flatMap(definition => definition.template ? [definition.template] : []));
  const definitionDataTypes = usage.definitionData ? templateBodies.filter(template => definitionTargets.has(template.name)).map(template => `#[derive(Clone, Default)] pub struct ${rustDefinitionData(template.name)} { ${[...template.inputs].map(([name, type]) => `pub ${fieldName(name)}: Option<${rustType(type.source)}>`).join(', ')} }`).join('\n') : '';
  const definitionFields = [usage.definitionTemplate ? 'pub template: Option<String>' : '', 'pub html: Option<String>', usage.definitionData ? 'pub data: Option<T>' : ''].filter(Boolean).join(', ');
  const definitionType = program.definitions.size > 0 ? `#[derive(Clone, Default)] pub struct Definition${usage.definitionData ? '<T>' : ''} { ${definitionFields} }\n` : '';
  const definitionOf = (template: string | null | undefined): string => usage.definitionData ? `Definition<${template ? rustDefinitionData(template) : '()'}>` : 'Definition';
  const definitionsType = `${definitionType}#[derive(Clone, Default)] pub struct Definitions { ${[...program.definitions].map(([name, definition]) => `pub ${fieldName(name)}: Option<${definitionOf(definition.template)}>`).join(', ')} }`;
  const assignMembers: Record<string, string> = program.dynamicRoot ? {} : fields;
  // The root holds the fields that a template reads and checks every other one (T24.31).
  const read = (name: string): boolean => usage.readFields.has(name);
  const assignType = `#[derive(Clone, Default)] pub struct Assign {\n${Object.entries(assignMembers).filter(([name]) => read(name)).map(([name, type]) => `    pub ${name}: ${rustType(type)},`).join('\n')}\n}\n${recordConvert(usage, 'Assign', assignMembers, read)}`;
  return [`// Generated.\nuse polyspec_template::{ArgumentError, ErrorCode, OrderedMap as RuntimeOrderedMap, PreparedRender, Program, RenderOptions, RenderTarget, RequestError, RuntimeEnvironment, TemplateError, Value, internal_boundary};\nuse polyspec_template::error::LineIndex;\nuse polyspec_template::render::context::{Frame, RenderContext, Scope};\nuse polyspec_template::render::runtime_bindings::RuntimeBindings;\nuse serde_json::Value as JsonValue;\nuse std::collections::HashMap;\nuse std::rc::Rc;\n${assignType}\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}`, ...rustRecords];
}

export function emitRuntime(context: BackendContext): Part[] {
  const usage = rustUsage(context);
  // A helper is kept only when the program uses it.
  return [
    definition('GeneratedValue', `type GeneratedValue = Value;`),
    // The OrderedMap of the program, not polyspec_template::OrderedMap, which the program imports as RuntimeOrderedMap.
    definition('OrderedMap', `#[derive(Clone)] struct OrderedEntry<K, V> { key: K, value: V }\n#[derive(Clone, Default)] pub struct OrderedMap<K, V> { entries: Vec<OrderedEntry<K, V>> }\nimpl<K: PartialEq, V> OrderedMap<K, V> { fn new() -> Self { Self { entries: Vec::new() } } fn set(&mut self, key: K, value: V) { if let Some(entry) = self.entries.iter_mut().find(|entry| entry.key == key) { entry.value = value; } else { self.entries.push(OrderedEntry { key, value }); } } }\n${convertImpl(usage, 'impl<K: GeneratedConvert + PartialEq, V: GeneratedConvert> GeneratedConvert for OrderedMap<K, V>', '{ let Value::Map(map) = input else { return Err(generated_type_error(input, path, "an object")); }; let mut result = OrderedMap::new(); for (key, value) in map.iter() { result.set(K::from_value(&Value::text(key.clone()), path)?, V::from_value(value, &format!("{path}.{key}"))?); } Ok(result) }', '{ let mut map = RuntimeOrderedMap::new(); for entry in &self.entries { map.insert(entry.key.to_value().as_text().unwrap_or_default().to_string(), entry.value.to_value()); } Value::map(map) }')}`, /(?<![:\w])OrderedMap\b(?! as )/),
    definition('generated_conversion_error', `fn generated_conversion_error(message: impl Into<String>) -> TemplateError { TemplateError::without_position(ErrorCode::E_RUNTIME_TYPE, "generated", message) }`),
    `pub trait GeneratedConvert: Sized { fn from_value(input: &Value, path: &str) -> Result<Self, TemplateError>;${usage.toValue ? ' fn to_value(&self) -> Value;' : ''} }`,
    convertImpl(usage, 'impl GeneratedConvert for Value', '{ let _: &str = path; Ok(input.clone()) }', '{ self.clone() }'),
    convertImpl(usage, 'impl GeneratedConvert for String', '{ input.as_text().map(str::to_string).ok_or_else(|| generated_type_error(input, path, "a string")) }', '{ Value::text(self.clone()) }'),
    convertImpl(usage, 'impl GeneratedConvert for f64', '{ match input { Value::Number(number) => Ok(*number), _ => Err(generated_type_error(input, path, "a number")) } }', '{ Value::Number(*self) }'),
    convertImpl(usage, 'impl GeneratedConvert for bool', '{ match input { Value::Bool(value) => Ok(*value), _ => Err(generated_type_error(input, path, "a boolean")) } }', '{ Value::Bool(*self) }'),
    convertImpl(usage, 'impl<T: GeneratedConvert> GeneratedConvert for Option<T>', '{ match input { Value::Null => Ok(None), other => T::from_value(other, path).map(Some) } }', '{ self.as_ref().map_or(Value::Null, T::to_value) }'),
    convertImpl(usage, 'impl<T: GeneratedConvert> GeneratedConvert for Vec<T>', '{ match input { Value::List(items) => items.iter().enumerate().map(|(index, item)| T::from_value(item, &format!("{path}[{index}]"))).collect(), _ => Err(generated_type_error(input, path, "a list")) } }', '{ Value::list(self.iter().map(T::to_value).collect()) }'),
    // A value of a request that does not match its declared type fails with the message of ERR-13: `<path> is required` or
    // `<path> is not <expected>`, with the path of the value in the request (T24.33).
    definition('generated_type_error', `fn generated_type_error(input: &Value, path: &str, expected: &str) -> TemplateError { generated_conversion_error(if matches!(input, Value::Null) { format!("{path} is required") } else { format!("{path} is not {expected}") }) }`),
    definition('generated_field', `fn generated_field<T: GeneratedConvert>(map: &RuntimeOrderedMap, path: &str, name: &str) -> Result<T, TemplateError> { T::from_value(map.get(name).unwrap_or(&Value::Null), &format!("{path}.{name}")) }`),
    definition('generated_check_field', `fn generated_check_field(map: &RuntimeOrderedMap, path: &str, name: &str, check: impl Fn(&Value, &str) -> Result<(), TemplateError>) -> Result<(), TemplateError> { check(map.get(name).unwrap_or(&Value::Null), &format!("{path}.{name}")) }`),
    ...Object.entries(context.manifest.records).map(([name, members]) => definition(recordCheck(name), recordCheckCode(name, members))),
    definition('generated_value', `fn generated_value<T: GeneratedConvert>(input: &T) -> Result<Value, TemplateError> { Ok(input.to_value()) }`),
    definition('generated_result', `fn generated_result<T: GeneratedConvert>(input: &Value, path: &str) -> Result<T, TemplateError> { T::from_value(input, path) }`),
    definition('generated_loop_meta', `fn generated_loop_meta(runtime: &RuntimeBindings, context: &RenderContext<'_>, scope: &Scope, frame: &Frame, span: polyspec_template::error::Span, name: &str, field: &str) -> Result<Value, TemplateError> { let meta = scope.loop_meta(name).ok_or_else(|| runtime.error(context, frame, span, ErrorCode::E_RUNTIME_UNKNOWN_LOOP, format!("loop {name} is not active")))?; Ok(match field { "index_" => Value::Number(meta.index as f64), "size_" => Value::Number(meta.size as f64), "first_" => Value::Bool(meta.first), "last_" => Value::Bool(meta.last), "key_" => meta.key.clone(), "value_" => meta.value.clone(), _ => return Err(runtime.error(context, frame, span, ErrorCode::E_RUNTIME_UNKNOWN_LOOP, format!("loop {name} has no metadata {field}"))) }) }`),
  ];
}

export function emitTemplates(context: BackendContext): string {
  return context.templateBodies.map(template => {
    const typed = loweredTemplate(context.program, template.name);
    return `fn ${template.function}(assign: &Assign, definitions: &mut Definitions, input: ${rustInput(template.name)}, context: &mut RenderContext<'_>, runtime: &RuntimeBindings, root_data: &Rc<RuntimeOrderedMap>, scope: &mut Scope) -> Result<(), TemplateError> { let _: &Assign = assign; let _: &Definitions = definitions; let _: ${rustInput(template.name)} = input; let _: &RuntimeBindings = runtime; let _: &Scope = scope; let frame = Frame { name: ${rustString(template.name)}.to_string(), lines: Some(${rustLines(typed.lines)}), context: Rc::clone(root_data) };\n${[...template.inputs].map(([name]) => `scope.locals.insert(${rustString(name)}.to_string(), generated_value(&input.${fieldName(name)})?);`).join('\n')}\n${template.body}\n Ok(()) }`;
  }).join('\n');
}

export function emitEntry(context: BackendContext): string {
  const dispatch = context.templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${rustString(template.name)} => ${template.function}(assign, definitions, ${rustInput(template.name)}::default(), context, runtime, root_data, scope),`).join('\n');
  const usage = rustUsage(context);
  const definitionCases = [...context.program.definitions].map(([id, definition]) => {
    const field = fieldName(id);
    const inputs = definition.template ? [...loweredTemplate(context.program, definition.template).inputs] : [];
    const dataType = definition.template ? rustDefinitionData(definition.template) : '()';
    const bound = `polyspec_template::bind_data(data).map_err(|error| TemplateError::without_position(error.code, name, error.message))?`;
    const notObject = `_ => return Err(generated_error(format!("define.{id}.data is not an object")))`;
    // The data of a definition that no block merges is checked as the data that a block merges is read (T24.31).
    const checks = inputs.map(([inputName, type]) => `if let Some(value) = map.get(${rustString(inputName)}) { let path = &format!("define.{id}.data.${inputName}"); ${checkOf(type.source, 'value')}.map_err(|error| generated_error(error.message))?; }`);
    const data = !definition.template
      ? (usage.definitionData ? 'let data: Option<()> = None;' : '')
      : usage.definitionData
        ? `let data = match &input.data { None => None, Some(data) => match ${bound} { Value::Map(map) => { let _: &Rc<RuntimeOrderedMap> = &map; Some(${dataType} { ${inputs.map(([inputName]) => `${fieldName(inputName)}: map.get(${rustString(inputName)}).map(|value| GeneratedConvert::from_value(value, &format!("define.{id}.data.${inputName}"))).transpose().map_err(|error| generated_error(error.message))?`).join(', ')} }) }, ${notObject} } };`
        : `if let Some(data) = &input.data { match ${bound} { Value::Map(${checks.length > 0 ? 'map' : '_'}) => { ${checks.join(' ')} }, ${notObject} } }`;
    const held = [usage.definitionTemplate ? 'template: input.template.clone()' : '', usage.definitionData ? 'data' : ''].filter(Boolean);
    const templateDefinition = held.length > 0 ? `Definition { ${held.join(', ')}, ..Default::default() }` : 'Definition::default()';
    return `            ${rustString(id)} => { if let Some(html) = &input.html { if ${definition.html ? 'false' : 'true'} || input.template.is_some() || input.data.is_some() { return Err(generated_error(format!("define.{id} has an invalid html entry"))); } definitions.${field} = Some(Definition { html: Some(html.clone())${usage.definitionTemplate || usage.definitionData ? ', ..Default::default()' : ''} }); targets.insert(id.clone(), GeneratedTarget { target: None, html: Some(html.clone()) }); } else { if input.template.as_deref() != Some(${rustString(definition.template ?? '')}) { return Err(generated_error(format!("define.{id} has an invalid template"))); }
${data}
definitions.${field} = Some(${templateDefinition}); targets.insert(id.clone(), GeneratedTarget { target: Some(${rustString(definition.template ?? '')}.to_string()), html: None }); } },`;
  }).join('\n');
  // Without a declared definition every entry of the request fails, so the function fails on the first one instead of a
  // loop whose match has a single arm (clippy::never_loop, clippy::match_single_binding; T24.29).
  // The name of the request names the error of definition data, which only a definition with a template binds.
  const named = [...context.program.definitions.values()].some(definition => definition.template);
  const bindParameters = `${named ? 'name: &str, ' : ''}input: &HashMap<String, polyspec_template::DefineInput>`;
  const bindCall = `generated_bind_definitions(${named ? 'name, ' : ''}&options.define)`;
  const bindDefinitions = context.program.definitions.size > 0
    ? `fn generated_bind_definitions(${bindParameters}) -> Result<(Definitions, HashMap<String, GeneratedTarget>), RequestError> { let mut definitions = Definitions::default(); let mut targets = HashMap::new(); for (id, input) in input { match id.as_str() {\n${definitionCases}\n            _ => return Err(generated_error(format!("define.{id} is not declared"))),\n        } } Ok((definitions, targets)) }`
    : `fn generated_bind_definitions(${bindParameters}) -> Result<(Definitions, HashMap<String, GeneratedTarget>), RequestError> { if let Some(id) = input.keys().next() { return Err(generated_error(format!("define.{id} is not declared"))); } Ok((Definitions::default(), HashMap::new())) }`;
  const bindAssign = context.program.dynamicRoot ? 'Assign::default()' : 'Assign::from_value(&Value::Map(Rc::clone(&root_data)), "assign").map_err(|error| generated_error(error.message))?';
  const nativeRender = context.program.dynamicRoot
    ? `pub fn render_values(&self, target: RenderTarget<'_>, assign: RuntimeOrderedMap, options: &RenderOptions) -> Result<String, RequestError> { let RenderTarget::Name(name) = target else { return Err(generated_error("native generated target must be a template name".to_string())); }; internal_boundary(name, || self.render_bound_values(name, &assign, options)) } fn render_bound_values(&self, name: &str, assign: &RuntimeOrderedMap, options: &RenderOptions) -> Result<String, RequestError> { let root_data = Rc::new(polyspec_template::bind_values(assign).map_err(|error| TemplateError::without_position(error.code, name, error.message))?); let typed_assign = Assign::default(); let (definitions, targets) = ${bindCall}?; let resolved = targets.get(name); let target_name = resolved.and_then(|value| value.target.clone()).unwrap_or_else(|| name.to_string()); let html = resolved.and_then(|value| value.html.clone()); let env = match options.env.clone() { Some(env) => env, None => polyspec_template::Env { timezone: "Z".to_string(), now: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| generated_error(error.to_string()))?.as_secs() as f64 } }; let mut context = RenderContext::new(&self.runtime, Rc::clone(&root_data), env, &target_name); let runtime = RuntimeBindings::new(); let mut scope = Scope::default(); let mut render_definitions = definitions; context.enter(&target_name, None, None)?; let result = if let Some(html) = &html { let frame = Frame { name: target_name.clone(), lines: None, context: Rc::clone(&root_data) }; context.write(html, &frame, [0, 0]) } else { render_template(&target_name, &typed_assign, &mut render_definitions, &mut context, &runtime, &root_data, &mut scope) }; context.leave(); result?; Ok(context.output) }`
    : '';
  return `fn render_template(target: &str, assign: &Assign, definitions: &mut Definitions, context: &mut RenderContext<'_>, runtime: &RuntimeBindings, root_data: &Rc<RuntimeOrderedMap>, scope: &mut Scope) -> Result<(), TemplateError> { match target {\n${dispatch}\n        _ => Err(context.fail(ErrorCode::E_LOAD_NOT_FOUND, None, None, format!("template {target} does not exist"))),\n} }\nfn generated_error(message: String) -> RequestError { RequestError::Argument(ArgumentError { message }) }\nstruct GeneratedTarget { target: Option<String>, html: Option<String> }\n${bindDefinitions}\npub struct GeneratedProgram { pub runtime: RuntimeEnvironment }\nimpl GeneratedProgram { pub fn new(runtime: RuntimeEnvironment) -> GeneratedProgram { GeneratedProgram { runtime } } ${nativeRender} }\nimpl Program for GeneratedProgram { fn prepare(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<PreparedRender<'_>, RequestError> { let RenderTarget::Name(name) = target else { return Err(generated_error("generated target must be a template name".to_string())); }; internal_boundary(name, || { let root_data = Rc::new(polyspec_template::value::bind::bind_map(assign).map_err(|error| TemplateError::without_position(error.code, name, error.message))?); self.prepare_root(name, root_data, options) }) } fn render(&self, target: RenderTarget<'_>, assign: &JsonValue, options: &RenderOptions) -> Result<String, RequestError> { Ok(self.prepare(target, assign, options)?.render()?) } fn prepare_bound(&self, target: RenderTarget<'_>, assign: &polyspec_template::BoundMap, options: &RenderOptions) -> Result<PreparedRender<'_>, RequestError> { let RenderTarget::Name(name) = target else { return Err(generated_error("generated target must be a template name".to_string())); }; internal_boundary(name, || self.prepare_root(name, polyspec_template::bound_root(assign), options)) } fn render_bound(&self, target: RenderTarget<'_>, assign: &polyspec_template::BoundMap, options: &RenderOptions) -> Result<String, RequestError> { Ok(self.prepare_bound(target, assign, options)?.render()?) } }\nimpl GeneratedProgram { fn prepare_root<'e>(&'e self, name: &str, root_data: Rc<RuntimeOrderedMap>, options: &RenderOptions) -> Result<PreparedRender<'e>, RequestError> { let typed_assign: Assign = ${bindAssign}; let (definitions, targets) = ${bindCall}?; let resolved = targets.get(name); let target_name = resolved.and_then(|value| value.target.clone()).unwrap_or_else(|| name.to_string()); let html = resolved.and_then(|value| value.html.clone()); let env = match options.env.clone() { Some(env) => env, None => polyspec_template::Env { timezone: "Z".to_string(), now: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| generated_error(error.to_string()))?.as_secs() as f64 } }; Ok(PreparedRender::new(name, move || { let mut context = RenderContext::new(&self.runtime, Rc::clone(&root_data), env.clone(), &target_name); let runtime = RuntimeBindings::new(); let mut scope = Scope::default(); let mut render_definitions = definitions.clone(); context.enter(&target_name, None, None)?; let result = if let Some(html) = &html { let frame = Frame { name: target_name.clone(), lines: None, context: Rc::clone(&root_data) }; context.write(html, &frame, [0, 0]) } else { render_template(&target_name, &typed_assign, &mut render_definitions, &mut context, &runtime, &root_data, &mut scope) }; context.leave(); result?; Ok(context.output) })) } }`;
}
