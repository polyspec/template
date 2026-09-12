import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'rust';

export function createTarget() {
  const target = baseTarget(language);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `{ let definition = definitions.${fieldName(node.id)}.as_ref();\nlet html = definition.and_then(|value| value.html.as_ref()).expect(${quote(`generated definition ${node.id} requires html`)});\nout.push_str(html);\n}`);
    const defaults = node.inputs.filter(item => item.root).map(item => `input.${fieldName(item.name)} = ${emitExpression(item.root, target)};`).join('\n');
    const defined = node.inputs.map(item => `if let Some(value) = data.${fieldName(item.name)}.clone() { input.${fieldName(item.name)} = value; }`).join('\n');
    const scoped = node.inputs.filter(item => item.scope).map(item => `input.${fieldName(item.name)} = ${emitExpression(item.scope, target)};`).join('\n');
    if (node.id === null) return indent(n, `{ let mut input = ${inputName(node.target)}::default();\n${defaults}\n${scoped}\nout.push_str(&${functionName(node.target)}(assign, definitions, input));\n}`);
    const field = fieldName(node.id);
    const missing = node.path === null ? `if definition.is_none() { panic!(${quote(`generated definition ${node.id} is missing`)}); }` : '';
    return indent(n, `{ let definition = definitions.${field}.as_ref();\n${missing}\nif let Some(html) = definition.and_then(|value| value.html.as_ref()) { out.push_str(html); } else {\n    let mut input = ${inputName(node.target)}::default();\n${indent(1, defaults)}\n    if let Some(data) = definition.and_then(|value| value.data.as_ref()) {\n${indent(2, defined)}\n    }\n${indent(1, scoped)}\n    out.push_str(&${functionName(node.target)}(assign, definitions, input));\n}\n}`);
  };
  target.ifBlock = (node, n) => indent(n, `if definitions.${fieldName(node.id)}.is_some() {\n${emitNodes(node.body, target, n + 1)}\n}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1)}\n}` : ''}`);
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}.clone()`;
  target.index = (object, index, type) => type.kind === 'map' ? `${object}.get(&${index}).cloned().unwrap_or_default()` : `${object}.get(${index} as usize).cloned().unwrap_or_default()`;
  target.call = (name, args) => {
    if (name !== 'default') throw new Error(`compiler: function ${name} reached the Rust backend without support`);
    return `{ let value = ${args[0]}; if generated_truthy(&value) { value } else { ${args[1]} } }`;
  };
  target.unary = (op, operand) => op === '!' ? `(!generated_truthy(&${operand}))` : `(-${operand})`;
  target.binary = (op, left, right) => op === 'in' ? `generated_in(&${left}, &${right})` : op === '&&' || op === '||' ? `(generated_truthy(&${left}) ${op} generated_truthy(&${right}))` : `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `if generated_truthy(&${test}) { ${thenValue} } else { ${elseValue} }`;
  target.list = (items, type) => `{ let mut result: ${rustType(type.source)} = Vec::new(); ${items.map(item => item.spread ? `result.extend(${item.value});` : `result.push(${item.value});`).join(' ')} result }`;
  target.map = (entries, type) => `{ let mut result: ${rustType(type.source)} = OrderedMap::new(); ${entries.map(item => item.spread ? `for entry in ${item.value}.entries() { result.set(entry.key.clone(), entry.value.clone()); }` : `result.set(${item.value[0]}, ${item.value[1]});`).join(' ')} result }`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} generated_truthy(&${emitExpression(b.test, target)}) {\n${emitNodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const iterable = emitExpression(node.iter, target);
    const source = node.iter.valueType.kind === 'map' ? `${iterable}.entries().iter().map(|entry| (entry.key.clone(), entry.value.clone())).collect::<Vec<_>>()` : `${iterable}.iter().cloned().enumerate().map(|(key, value)| (key as f64, value)).collect::<Vec<_>>()`;
    return indent(n, `{ let entries = ${source};\nfor (${name}_index_raw, (${name}_key, ${name}_value)) in entries.iter().cloned().enumerate() {\n    let ${name} = ${name}_value.clone();\n    let ${name}_index = ${name}_index_raw as f64;\n    let ${name}_size = entries.len() as f64;\n    let ${name}_first = ${name}_index_raw == 0;\n    let ${name}_last = ${name}_index_raw + 1 == entries.len();\n${emitNodes(node.body, target, n + 1)}\n}${node.empty ? `\nif entries.is_empty() {\n${emitNodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `out.push_str(&${functionName(node.target)}(assign, definitions, ${inputName(node.target)} { ${node.inputs.map(item => `${fieldName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')} }));`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const rustRecords = Object.entries(records).map(([name, members]) => `#[derive(Clone, Default)] pub struct ${name} { ${Object.entries(members).map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }`).join('\n');
  const inputTypes = templateBodies.map(template => `#[derive(Clone, Default)] pub struct ${template.input} { ${[...template.inputs].map(([name, type]) => `pub ${fieldName(name)}: ${rustType(type.source)}`).join(', ')} }`).join('\n');
  const definitionDataTypes = templateBodies.map(template => `#[derive(Clone, Default)] pub struct ${definitionDataName(template.name)} { ${[...template.inputs].map(([name, type]) => `pub ${fieldName(name)}: Option<${rustType(type.source)}>`).join(', ')} }`).join('\n');
  const definitionsType = `#[derive(Clone)] pub struct Definition<T> { pub html: Option<String>, pub data: Option<T> }\n#[derive(Clone, Default)] pub struct Definitions { ${[...program.definitions].map(([name, definition]) => `pub ${fieldName(name)}: Option<Definition<${definition.template ? definitionDataName(definition.template) : '()'}>>`).join(', ')} }`;
  return `// Generated.\n${rustRecords}\n#[derive(Clone, Default)] pub struct Assign {\n${Object.entries(fields).map(([name, type]) => `    pub ${name}: ${rustType(type)},`).join('\n')}\n}\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}`;
}

export function emitRuntime() {
  return `#[derive(Clone, Default)] enum GeneratedValue { #[default] Null }\n#[derive(Clone)] struct OrderedEntry<K, V> { key: K, value: V }\n#[derive(Clone, Default)] struct OrderedMap<K, V> { entries: Vec<OrderedEntry<K, V>> }\nimpl<K: PartialEq, V> OrderedMap<K, V> { fn new() -> Self { Self { entries: Vec::new() } } fn set(&mut self, key: K, value: V) { if let Some(entry) = self.entries.iter_mut().find(|entry| entry.key == key) { entry.value = value; } else { self.entries.push(OrderedEntry { key, value }); } } fn get(&self, key: &K) -> Option<&V> { self.entries.iter().find(|entry| &entry.key == key).map(|entry| &entry.value) } fn entries(&self) -> &Vec<OrderedEntry<K, V>> { &self.entries } }\ntrait GeneratedTruthy { fn generated_truthy(&self) -> bool; }\nimpl GeneratedTruthy for bool { fn generated_truthy(&self) -> bool { *self } }\nimpl GeneratedTruthy for f64 { fn generated_truthy(&self) -> bool { *self != 0.0 } }\nimpl GeneratedTruthy for String { fn generated_truthy(&self) -> bool { !self.is_empty() } }\nimpl<T> GeneratedTruthy for Vec<T> { fn generated_truthy(&self) -> bool { !self.is_empty() } }\nimpl<K, V> GeneratedTruthy for OrderedMap<K, V> { fn generated_truthy(&self) -> bool { !self.entries.is_empty() } }\nimpl<T: GeneratedTruthy> GeneratedTruthy for Option<T> { fn generated_truthy(&self) -> bool { self.as_ref().is_some_and(GeneratedTruthy::generated_truthy) } }\nfn generated_truthy<T: GeneratedTruthy>(value: &T) -> bool { value.generated_truthy() }\ntrait GeneratedContains<T> { fn generated_contains(&self, value: &T) -> bool; }\nimpl<T: PartialEq> GeneratedContains<T> for Vec<T> { fn generated_contains(&self, value: &T) -> bool { self.contains(value) } }\nimpl<K: PartialEq, V> GeneratedContains<K> for OrderedMap<K, V> { fn generated_contains(&self, value: &K) -> bool { self.get(value).is_some() } }\nimpl GeneratedContains<String> for String { fn generated_contains(&self, value: &String) -> bool { self.contains(value) } }\nfn generated_in<T, C: GeneratedContains<T>>(value: &T, collection: &C) -> bool { collection.generated_contains(value) }\nfn escape(value: &str) -> String { value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\\'', "&#39;") }`;
}

export function emitTemplates(context) {
  return context.templateBodies.map(template => `fn ${template.function}(assign: &Assign, definitions: &Definitions, input: ${template.input}) -> String { let mut out = String::new();\n${[...template.inputs].map(([name]) => `let ${fieldName(name)} = input.${fieldName(name)};`).join('\n')}\n${template.body}\n out }`).join('\n');
}

export function emitEntry(context) {
  const dispatch = context.templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${quote(template.name)} => ${template.function}(assign, definitions, ${template.input}::default()),`).join('\n');
  return `pub fn render_template(target: &str, assign: &Assign, definitions: &Definitions) -> String { match target {\n${dispatch}\n        _ => panic!("generated template is missing or requires inputs: {target}"),\n} }\npub fn render(assign: &Assign, definitions: &Definitions) -> String { render_template(${quote(context.program.entry)}, assign, definitions) }`;
}
