#!/usr/bin/env node
// Generate type-fixed host source from canonical AST and a data type manifest.
// The manifest is part of the input: arbitrary JSON cannot become statically typed by inference alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadSourceGraph, lowerSourceGraph } from './ir.mjs';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const graphPath = value('--graph');
const manifestPath = value('--manifest');
const lang = value('--lang');
const output = value('--output');
const check = args.includes('--check');
if (!graphPath || !manifestPath || !lang || !output || !['ts', 'go', 'rust', 'php'].includes(lang)) {
  throw new Error('usage: generate-typed.mjs --graph MANIFEST --manifest FILE --lang ts|go|rust|php --output FILE');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const graph = loadSourceGraph(graphPath);
const program = lowerSourceGraph(graph, manifest);
const fields = manifest.fields ?? {};
const quote = s => JSON.stringify(s);
const fieldName = name => name.replace(/[^A-Za-z0-9_]/g, '_');
const functionName = name => `render_${fieldName(name)}`;
const inputName = name => `Input_${fieldName(name)}`;
const typeName = type => type.replace(/\?$/, '');
const optional = type => type.endsWith('?');
function genericType(type, scalar, list, map) {
  const source = typeName(type);
  const listMatch = /^list<(.+)>$/.exec(source);
  if (listMatch) return list(genericType(listMatch[1], scalar, list, map));
  const mapMatch = /^map<([^,]+),(.+)>$/.exec(source);
  if (mapMatch) return map(genericType(mapMatch[1].trim(), scalar, list, map), genericType(mapMatch[2].trim(), scalar, list, map));
  return scalar[source] ?? source;
}
const tsType = type => genericType(type, { string: 'string', number: 'number', boolean: 'boolean', any: 'unknown', null: 'null', Template: 'string' }, item => `Array<${item}>`, (key, value) => `Map<${key}, ${value}>`);
const goType = type => (optional(type) ? '*' : '') + genericType(type, { string: 'string', number: 'float64', boolean: 'bool', any: 'any', null: 'any', Template: 'string' }, item => `[]${item}`, (key, value) => `OrderedMap[${key}, ${value}]`);
const rustType = type => `${optional(type) ? 'Option<' : ''}${genericType(type, { string: 'String', number: 'f64', boolean: 'bool', any: 'GeneratedValue', null: 'GeneratedValue', Template: 'String' }, item => `Vec<${item}>`, (key, value) => `OrderedMap<${key}, ${value}>`)}${optional(type) ? '>' : ''}`;
const phpType = type => genericType(type, { string: 'string', number: 'float', boolean: 'bool', any: 'mixed', null: 'mixed', Template: 'string' }, () => 'array', () => 'array');
const tsField = (name, type) => `${name}${optional(type) ? '?' : ''}: ${tsType(type)};`;
const phpField = (name, type) => `public readonly ${optional(type) ? '?' : ''}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;

function expr(node, target) {
  if (node.op === 'literal') return target.literal(node.value, node.valueType);
  if (node.op === 'root') return target.var(fieldName(node.name), node.valueType.source);
  if (node.op === 'local') return target.local(fieldName(node.name), node.valueType.source);
  if (node.op === 'loop-meta') return target.loopMeta(node.loop, node.field);
  if (node.op === 'member') return target.member(expr(node.object, target), fieldName(node.key));
  if (node.op === 'index') return target.index(expr(node.object, target), expr(node.index, target), node.object.valueType);
  if (node.op === 'call') return target.call(node.name, node.args.map(item => expr(item, target)));
  if (node.op === 'unary') return target.unary(node.operator, expr(node.operand, target));
  if (node.op === 'binary') return target.binary(node.operator, expr(node.left, target), expr(node.right, target));
  if (node.op === 'ternary') return target.ternary(expr(node.test, target), expr(node.then, target), expr(node.otherwise, target));
  if (node.op === 'list') return target.list(node.items.map(item => ({ spread: item.spread, value: expr(item.value, target) })), node.valueType);
  if (node.op === 'map') return target.map(node.entries.map(item => item.spread ? { spread: true, value: expr(item.value, target) } : { spread: false, value: [expr(item.key, target), expr(item.value, target)] }), node.valueType);
  throw new Error(`typed generator: unsupported IR expression ${node.op}`);
}
function nodes(body, target, level = 1) {
  const out = [];
  for (const node of body) {
    if (node.op === 'text') out.push(target.text(node.value, level));
    else if (node.op === 'echo') out.push(target.echo(expr(node.expr, target), level));
    else if (node.op === 'block') out.push(target.block(node.id, level));
    else if (node.op === 'if-block') out.push(target.ifBlock(node, level));
    else if (node.op === 'set') out.push(target.set(node.name, expr(node.expr, target), level));
    else if (node.op === 'if') out.push(target.ifNode(node, level));
    else if (node.op === 'for') out.push(target.forNode(node, level));
    else if (node.op === 'include') out.push(target.include(node, level));
    else throw new Error(`typed generator: unsupported IR node ${node.op}`);
  }
  return out.join('\n');
}
const indent = (n, s) => s.split('\n').map(line => '    '.repeat(n) + line).join('\n');
const common = {
  ts: {
    literal: v => v === null ? 'undefined' : typeof v === 'string' ? quote(v) : String(v),
    var: (n) => `assign.${n}`,
    local: (n) => n,
    member: (o, k) => `${o}?.${k}`,
    text: (v, n) => indent(n, `out += ${quote(v)};`),
    echo: (e, n) => indent(n, `out += escape(stringify(${e}));`),
    block: (id, n) => indent(n, `out += slots[${quote(id)}] ?? '';`),
    ifBlock: (node, n) => indent(n, `if (slots[${quote(node.id)}] !== undefined) {\n${nodes(node.body, this, n + 1)}\n${'    '.repeat(n)}}`),
    set: (name, value, n) => indent(n, `const ${fieldName(name)} = ${value};`),
  },
  go: {
    literal: (v, type) => v === null ? 'nil' : typeof v === 'string' ? quote(v) : type.kind === 'number' ? `float64(${v})` : String(v),
    var: (n, type) => `${optional(type) ? 'valueOrZero(' : ''}assign.${n[0].toUpperCase()}${n.slice(1)}${optional(type) ? ')' : ''}`,
    local: n => n,
    member: (o, k) => `${o}.${k[0].toUpperCase()}${k.slice(1)}`,
    text: (v, n) => indent(n, `out.WriteString(${quote(v)})`),
    echo: (e, n) => indent(n, `fmt.Fprint(&out, ${e})`),
    block: (id, n) => indent(n, `out.WriteString(slots[${quote(id)}])`),
    ifBlock: (node, n) => indent(n, `if _, ok := slots[${quote(node.id)}]; ok { /* generated slot */ }`),
    set: (name, value, n) => indent(n, `${fieldName(name)} := ${value}`),
  },
  rust: {
    literal: (v, type) => v === null ? 'GeneratedValue::Null' : typeof v === 'string' ? quote(v) + '.to_string()' : type.kind === 'number' ? `${v}f64` : String(v),
    var: (n, type) => `assign.${n}${optional(type) ? '.clone().unwrap_or_default()' : '.clone()'}`,
    local: n => n,
    member: (o, k) => `${o}.${k}`,
    text: (v, n) => indent(n, `out.push_str(${quote(v)});`),
    echo: (e, n) => indent(n, `out.push_str(&escape(&${e}.to_string()));`),
    block: (id, n) => indent(n, `out.push_str(slots.get(${quote(id)}).map(String::as_str).unwrap_or(""));`),
    ifBlock: (node, n) => indent(n, `if slots.contains_key(${quote(node.id)}) {}`),
    set: (name, value, n) => indent(n, `let ${fieldName(name)} = ${value};`),
  },
  php: {
    literal: v => v === null ? 'null' : typeof v === 'string' ? quote(v) : String(v),
    var: n => `$assign->${n}`,
    local: n => `$${n}`,
    member: (o, k) => `${o}?->${k}`,
    text: (v, n) => indent(n, `$out .= ${quote(v)};`),
    echo: (e, n) => indent(n, `$out .= generated_escape(${e});`),
    block: (id, n) => indent(n, `$out .= $slots[${quote(id)}] ?? '';`),
    ifBlock: (node, n) => indent(n, `if (isset($slots[${quote(node.id)}])) {}`),
    set: (name, value, n) => indent(n, `$${fieldName(name)} = ${value};`),
  },
}[lang];
// Bind `this`-free targets to the shared target so nested AST generation is recursive.
const target = { ...common };
if (lang === 'ts') target.ifBlock = (node, n, scope = []) => indent(n, `if (slots[${quote(node.id)}] !== undefined) {\n${nodes(node.body, target, n + 1, scope)}\n${'    '.repeat(n)}}`);
if (lang === 'go') target.ifBlock = (node, n, scope = []) => indent(n, `if _, ok := slots[${quote(node.id)}]; ok {\n${nodes(node.body, target, n + 1, scope)}\n}`);
if (lang === 'rust') target.ifBlock = (node, n, scope = []) => indent(n, `if slots.contains_key(${quote(node.id)}) {\n${nodes(node.body, target, n + 1, scope)}\n}`);
if (lang === 'php') target.ifBlock = (node, n, scope = []) => indent(n, `if (isset($slots[${quote(node.id)}])) {\n${nodes(node.body, target, n + 1, scope)}\n}`);
if (lang === 'ts') {
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index, type) => type.kind === 'map' ? `${object}?.get(${index})` : `${object}?.[${index}]`;
  target.call = (name, args) => name === 'default' ? `generatedDefault(${args.join(', ')})` : `generatedCall(${quote(name)}, [${args.join(', ')}])`;
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => op === 'in' ? `generatedIn(${left}, ${right})` : `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(${test} ? ${thenValue} : ${elseValue})`;
  target.list = items => `[${items.map(item => item.spread ? `...${item.value}` : item.value).join(', ')}]`;
  target.map = entries => `new Map([${entries.map(item => item.spread ? `...${item.value}` : `[${item.value[0]}, ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} (Boolean(${expr(b.test, target, scope)})) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const entries = `${name}_entries`;
    const iterable = expr(node.iter, target);
    const makeEntries = node.iter.valueType.kind === 'map' ? `Array.from(${iterable}?.entries() ?? [])` : `(${iterable} ?? []).map((value, key) => [key, value] as const)`;
    return indent(n, `{ const ${entries} = ${makeEntries};\nfor (let ${name}_index = 0; ${name}_index < ${entries}.length; ${name}_index += 1) {\n    const [${name}_key, ${name}_value] = ${entries}[${name}_index];\n    const ${name} = ${name}_value;\n    const ${name}_size = ${entries}.length;\n    const ${name}_first = ${name}_index === 0;\n    const ${name}_last = ${name}_index + 1 === ${entries}.length;\n${nodes(node.body, target, n + 1)}\n}${node.empty ? `\nif (${entries}.length === 0) {\n${nodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `out += ${functionName(node.target)}(assign, slots, { ${node.inputs.map(item => `${fieldName(item.name)}: ${expr(item.value, target)}`).join(', ')} });`);
}
if (lang === 'go') {
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index, type) => type.kind === 'map' ? `generatedMapGet(${object}, ${index})` : `generatedListGet(${object}, int(${index}))`;
  target.call = (name, args) => `generatedCall(${quote(name)}, []any{${args.join(', ')}})`;
  target.unary = (op, operand) => `generatedUnary(${quote(op)}, ${operand})`;
  target.binary = (op, left, right) => `generatedBinary(${quote(op)}, ${left}, ${right})`;
  target.ternary = (test, thenValue, elseValue) => `generatedTernary(generatedTruthy(${test}), ${thenValue}, ${elseValue})`;
  target.list = (items, type) => `func() ${goType(type.source)} { result := ${goType(type.source)}{}; ${items.map(item => item.spread ? `result = append(result, ${item.value}...)` : `result = append(result, ${item.value})`).join('; ')}; return result }()`;
  target.map = (entries, type) => `func() ${goType(type.source)} { result := NewOrderedMap[${goType(type.key.source)}, ${goType(type.value.source)}](); ${entries.map(item => item.spread ? `for _, entry := range ${item.value}.Entries() { result.Set(entry.Key, entry.Value) }` : `result.Set(${item.value[0]}, ${item.value[1]})`).join('; ')}; return result }()`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'\t'.repeat(n)}${i ? '} else if' : 'if'} generatedTruthy(${expr(b.test, target, scope)}) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'\t'.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'\t'.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const iterable = expr(node.iter, target);
    const isMap = node.iter.valueType.kind === 'map';
    const source = isMap ? `${iterable}.Entries()` : iterable;
    const binding = isMap ? `${name}_key, ${name}_value := entry.Key, entry.Value` : `${name}_key, ${name}_value := float64(${name}_index), entry`;
    return indent(n, `{ entries := ${source}\nfor ${name}_index, entry := range entries {\n    ${binding}\n    _ = ${name}_key\n    ${name} := ${name}_value\n    ${name}_size := float64(len(entries))\n    ${name}_first := ${name}_index == 0\n    ${name}_last := ${name}_index + 1 == len(entries)\n${nodes(node.body, target, n + 1)}\n}${node.empty ? `\nif len(entries) == 0 {\n${nodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `out.WriteString(${functionName(node.target)}(assign, slots, ${inputName(node.target)}{${node.inputs.map(item => `${fieldName(item.name)[0].toUpperCase() + fieldName(item.name).slice(1)}: ${expr(item.value, target)}`).join(', ')}}))`);
}
if (lang === 'rust') {
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}.clone()`;
  target.index = (object, index, type) => type.kind === 'map' ? `${object}.get(&${index}).cloned().unwrap_or_default()` : `${object}.get(${index} as usize).cloned().unwrap_or_default()`;
  target.call = (name, args) => name === 'default' ? `{ let value = ${args[0]}; if generated_truthy(&value) { value } else { ${args[1]} } }` : `generated_call(${quote(name)}, vec![${args.join(', ')}])`;
  target.unary = (op, operand) => op === '!' ? `(!generated_truthy(&${operand}))` : `(-${operand})`;
  target.binary = (op, left, right) => op === 'in' ? `generated_in(&${left}, &${right})` : op === '&&' || op === '||' ? `(generated_truthy(&${left}) ${op} generated_truthy(&${right}))` : `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `if generated_truthy(&${test}) { ${thenValue} } else { ${elseValue} }`;
  target.list = (items, type) => `{ let mut result: ${rustType(type.source)} = Vec::new(); ${items.map(item => item.spread ? `result.extend(${item.value});` : `result.push(${item.value});`).join(' ')} result }`;
  target.map = (entries, type) => `{ let mut result: ${rustType(type.source)} = OrderedMap::new(); ${entries.map(item => item.spread ? `for entry in ${item.value}.entries() { result.set(entry.key.clone(), entry.value.clone()); }` : `result.set(${item.value[0]}, ${item.value[1]});`).join(' ')} result }`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} generated_truthy(&${expr(b.test, target, scope)}) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const iterable = expr(node.iter, target);
    const source = node.iter.valueType.kind === 'map' ? `${iterable}.entries().iter().map(|entry| (entry.key.clone(), entry.value.clone())).collect::<Vec<_>>()` : `${iterable}.iter().cloned().enumerate().map(|(key, value)| (key as f64, value)).collect::<Vec<_>>()`;
    return indent(n, `{ let entries = ${source};\nfor (${name}_index_raw, (${name}_key, ${name}_value)) in entries.iter().cloned().enumerate() {\n    let ${name} = ${name}_value.clone();\n    let ${name}_index = ${name}_index_raw as f64;\n    let ${name}_size = entries.len() as f64;\n    let ${name}_first = ${name}_index_raw == 0;\n    let ${name}_last = ${name}_index_raw + 1 == entries.len();\n${nodes(node.body, target, n + 1)}\n}${node.empty ? `\nif entries.is_empty() {\n${nodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `out.push_str(&${functionName(node.target)}(assign, slots, ${inputName(node.target)} { ${node.inputs.map(item => `${fieldName(item.name)}: ${expr(item.value, target)}`).join(', ')} }));`);
}
if (lang === 'php') {
  target.loopMeta = (loop, field) => `$${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index) => `generated_index(${object}, ${index})`;
  target.call = (name, args) => `generated_call(${quote(name)}, [${args.join(', ')}])`;
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => op === 'in' ? `generated_in(${left}, ${right})` : `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(${test} ? ${thenValue} : ${elseValue})`;
  target.list = items => `generated_list([${items.map(item => `['spread' => ${item.spread}, 'value' => ${item.value}]`).join(', ')}])`;
  target.map = entries => `generated_map([${entries.map(item => item.spread ? `['spread' => true, 'value' => ${item.value}]` : `['spread' => false, 'key' => ${item.value[0]}, 'value' => ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} elseif' : 'if'} (generated_truthy(${expr(b.test, target, scope)})) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    return indent(n, `$${name}_entries = generated_entries(${expr(node.iter, target)});\nforeach ($${name}_entries as $${name}_index => [$${name}_key, $${name}_value]) {\n    $${name} = $${name}_value;\n    $${name}_size = count($${name}_entries);\n    $${name}_first = $${name}_index === 0;\n    $${name}_last = $${name}_index + 1 === count($${name}_entries);\n${nodes(node.body, target, n + 1)}\n}${node.empty ? `\nif (count($${name}_entries) === 0) {\n${nodes(node.empty, target, n + 1)}\n}` : ''}`);
  };
  target.include = (node, n) => indent(n, `$out .= ${functionName(node.target)}($assign, $slots, new ${inputName(node.target)}(${node.inputs.map(item => `${fieldName(item.name)}: ${expr(item.value, target)}`).join(', ')}));`);
}
const templateBodies = [...program.templates.values()].map(template => ({ name: template.name, function: functionName(template.name), input: inputName(template.name), inputs: template.inputs, body: nodes(template.body, target, 1) }));
const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
const tsRecords = Object.entries(records).map(([name, members]) => `export interface ${name} {\n${Object.entries(members).map(([key, type]) => `  ${tsField(key, type)}`).join('\n')}\n}`).join('\n');
const goRecords = Object.entries(records).map(([name, members]) => `type ${name} struct { ${Object.entries(members).map(([key, type]) => `${key[0].toUpperCase() + key.slice(1)} ${goType(type)}`).join('; ')} }`).join('\n');
const rustRecords = Object.entries(records).map(([name, members]) => `#[derive(Clone, Default)] pub struct ${name} { ${Object.entries(members).map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }`).join('\n');
const phpRecords = Object.entries(records).map(([name, members]) => `final class ${name} { public function __construct(${Object.entries(members).map(([key, type]) => phpField(key, type)).join(', ')}) {} }`).join('\n');
let source;
if (lang === 'ts') {
  const inputTypes = templateBodies.map(template => `interface ${template.input} { ${[...template.inputs].map(([name, type]) => tsField(name, type.source)).join(' ')} }`).join('\n');
  const functions = templateBodies.map(template => `function ${template.function}(assign: Assign, slots: Record<string, string>, input: ${template.input}): string { let out = '';\n${[...template.inputs].map(([name]) => `  const ${fieldName(name)} = input.${fieldName(name)};`).join('\n')}\n${template.body}\n  return out; }`).join('\n');
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `    case ${quote(template.name)}: return ${template.function}(assign, slots, {});`).join('\n');
  source = `// Generated.\n${tsRecords}\nexport interface Assign {\n${Object.entries(fields).map(([n, t]) => `  ${tsField(n, t)}`).join('\n')}\n}\n${inputTypes}\n${functions}\nexport function renderTemplate(target: string, assign: Assign, slots: Record<string, string>): string {\n  switch (target) {\n${dispatch}\n    default: throw new Error('generated template is missing or requires inputs: ' + target);\n  }\n}\nexport function render(assign: Assign, slots: Record<string, string>): string { return renderTemplate(${quote(program.entry)}, assign, slots); }\nfunction stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }\nfunction escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }\nfunction generatedDefault<T>(value: T, fallback: T): T { return value ? value : fallback; }\nfunction generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }\nfunction generatedCall(name: string, _args: unknown[]): never { throw new Error('generated function is not linked: ' + name); }\n`;
} else if (lang === 'go') {
  const inputTypes = templateBodies.map(template => `type ${template.input} struct { ${[...template.inputs].map(([name, type]) => `${fieldName(name)[0].toUpperCase() + fieldName(name).slice(1)} ${goType(type.source)}`).join('; ')} }`).join('\n');
  const functions = templateBodies.map(template => `func ${template.function}(assign Assign, slots map[string]string, input ${template.input}) string { var out strings.Builder\n${[...template.inputs].map(([name]) => `${fieldName(name)} := input.${fieldName(name)[0].toUpperCase() + fieldName(name).slice(1)}`).join('\n')}\n${template.body}\n return out.String() }`).join('\n');
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `\tcase ${quote(template.name)}: return ${template.function}(assign, slots, ${template.input}{})`).join('\n');
  source = `// Generated.\npackage generated\nimport ("fmt"; "strings")\n${goRecords}\ntype Assign struct {\n${Object.entries(fields).map(([n, t]) => `\t${n[0].toUpperCase() + n.slice(1)} ${goType(t)}`).join('\n')}\n}\n${inputTypes}\ntype OrderedEntry[K comparable, V any] struct { Key K; Value V }\ntype OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }\nfunc NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }\nfunc (m *OrderedMap[K, V]) Set(key K, value V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = value; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, value}) }\nfunc (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }\nfunc (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }\nfunc generatedMapGet[K comparable, V any](value OrderedMap[K, V], key K) V { result, _ := value.Get(key); return result }\nfunc generatedListGet[T any](value []T, index int) T { if index >= 0 && index < len(value) { return value[index] }; var zero T; return zero }\nfunc generatedTernary[T any](test bool, yes, no T) T { if test { return yes }; return no }\nfunc generatedTruthy(value any) bool { switch value := value.(type) { case nil: return false; case bool: return value; case float64: return value != 0; case string: return value != ""; default: return true } }\nfunc generatedUnary(op string, value any) any { if op == "!" { return !generatedTruthy(value) }; return -value.(float64) }\nfunc generatedBinary(op string, left, right any) any { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==", "===": return fmt.Sprint(left) == fmt.Sprint(right); case "!=", "!==": return fmt.Sprint(left) != fmt.Sprint(right); case "+": if _, ok := left.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; if _, ok := right.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "<": return fmt.Sprint(left) < fmt.Sprint(right); case ">": return fmt.Sprint(left) > fmt.Sprint(right); case "<=": return fmt.Sprint(left) <= fmt.Sprint(right); case ">=": return fmt.Sprint(left) >= fmt.Sprint(right) }; panic("unsupported generated operator: "+op) }\nfunc generatedCall(name string, args []any) any { if name == "default" && len(args) == 2 { if generatedTruthy(args[0]) { return args[0] }; return args[1] }; panic("generated function is not linked: "+name) }\nfunc valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }\n${functions}\nfunc renderTemplate(target string, assign Assign, slots map[string]string) string { switch target {\n${dispatch}\n\tdefault: panic("generated template is missing or requires inputs: " + target)\n} }\nfunc Render(assign Assign, slots map[string]string) string { return renderTemplate(${quote(program.entry)}, assign, slots) }\nvar _ = fmt.Fprint\n`;
} else if (lang === 'rust') {
  const inputTypes = templateBodies.map(template => `#[derive(Clone, Default)] struct ${template.input} { ${[...template.inputs].map(([name, type]) => `${fieldName(name)}: ${rustType(type.source)}`).join(', ')} }`).join('\n');
  const functions = templateBodies.map(template => `fn ${template.function}(assign: &Assign, slots: &HashMap<String, String>, input: ${template.input}) -> String { let mut out = String::new();\n${[...template.inputs].map(([name]) => `let ${fieldName(name)} = input.${fieldName(name)};`).join('\n')}\n${template.body}\n out }`).join('\n');
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${quote(template.name)} => ${template.function}(assign, slots, ${template.input}::default()),`).join('\n');
  source = `// Generated.\nuse std::collections::HashMap;\n#[derive(Clone, Default)] enum GeneratedValue { #[default] Null }\n#[derive(Clone)] struct OrderedEntry<K, V> { key: K, value: V }\n#[derive(Clone, Default)] struct OrderedMap<K, V> { entries: Vec<OrderedEntry<K, V>> }\nimpl<K: PartialEq, V> OrderedMap<K, V> { fn new() -> Self { Self { entries: Vec::new() } } fn set(&mut self, key: K, value: V) { if let Some(entry) = self.entries.iter_mut().find(|entry| entry.key == key) { entry.value = value; } else { self.entries.push(OrderedEntry { key, value }); } } fn get(&self, key: &K) -> Option<&V> { self.entries.iter().find(|entry| &entry.key == key).map(|entry| &entry.value) } fn entries(&self) -> &Vec<OrderedEntry<K, V>> { &self.entries } }\ntrait GeneratedTruthy { fn generated_truthy(&self) -> bool; }\nimpl GeneratedTruthy for bool { fn generated_truthy(&self) -> bool { *self } }\nimpl GeneratedTruthy for f64 { fn generated_truthy(&self) -> bool { *self != 0.0 } }\nimpl GeneratedTruthy for String { fn generated_truthy(&self) -> bool { !self.is_empty() } }\nimpl<T> GeneratedTruthy for Vec<T> { fn generated_truthy(&self) -> bool { !self.is_empty() } }\nimpl<K, V> GeneratedTruthy for OrderedMap<K, V> { fn generated_truthy(&self) -> bool { !self.entries.is_empty() } }\nimpl<T: GeneratedTruthy> GeneratedTruthy for Option<T> { fn generated_truthy(&self) -> bool { self.as_ref().is_some_and(GeneratedTruthy::generated_truthy) } }\nfn generated_truthy<T: GeneratedTruthy>(value: &T) -> bool { value.generated_truthy() }\ntrait GeneratedContains<T> { fn generated_contains(&self, value: &T) -> bool; }\nimpl<T: PartialEq> GeneratedContains<T> for Vec<T> { fn generated_contains(&self, value: &T) -> bool { self.contains(value) } }\nimpl<K: PartialEq, V> GeneratedContains<K> for OrderedMap<K, V> { fn generated_contains(&self, value: &K) -> bool { self.get(value).is_some() } }\nimpl GeneratedContains<String> for String { fn generated_contains(&self, value: &String) -> bool { self.contains(value) } }\nfn generated_in<T, C: GeneratedContains<T>>(value: &T, collection: &C) -> bool { collection.generated_contains(value) }\n${rustRecords}\n#[derive(Clone, Default)] pub struct Assign {\n${Object.entries(fields).map(([n, t]) => `    pub ${n}: ${rustType(t)},`).join('\n')}\n}\n${inputTypes}\n${functions}\nfn render_template(target: &str, assign: &Assign, slots: &HashMap<String, String>) -> String { match target {\n${dispatch}\n        _ => panic!("generated template is missing or requires inputs: {target}"),\n} }\npub fn render(assign: &Assign, slots: &HashMap<String, String>) -> String { render_template(${quote(program.entry)}, assign, slots) }\nfn escape(value: &str) -> String { value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;") }\n`;
} else {
  const inputTypes = templateBodies.map(template => `final class ${template.input} { public function __construct(${[...template.inputs].map(([name, type]) => phpField(name, type.source)).join(', ')}) {} }`).join('\n');
  const functions = templateBodies.map(template => `function ${template.function}(Assign $assign, array $slots, ${template.input} $input): string { $out = '';\n${[...template.inputs].map(([name]) => `$${fieldName(name)} = $input->${fieldName(name)};`).join('\n')}\n${template.body}\n return $out; }`).join('\n');
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${quote(template.name)} => ${template.function}($assign, $slots, new ${template.input}()),`).join('\n');
  source = `<?php\n${phpRecords}\nfinal class Assign { public function __construct(\n${Object.entries(fields).map(([n, t]) => phpField(n, t)).join(',\n')}\n) {} }\n${inputTypes}\nfunction generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== []; }\nfunction generated_escape(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; if (is_array($value) || is_object($value)) throw new RuntimeException('a collection cannot be converted to text'); return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }\nfunction generated_index(array $value, string|int|float $key): mixed { return $value[is_float($key) ? (int) $key : $key] ?? null; }\nfunction generated_entries(?array $value): array { $result = []; foreach ($value ?? [] as $key => $item) $result[] = [$key, $item]; return $result; }\nfunction generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }\nfunction generated_map(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { foreach ($item['value'] as $key => $value) $result[$key] = $value; } else $result[$item['key']] = $item['value']; } return $result; }\nfunction generated_in(mixed $value, mixed $collection): bool { return is_array($collection) ? (array_is_list($collection) ? in_array($value, $collection, true) : array_key_exists((string) $value, $collection)) : (is_string($collection) && str_contains($collection, (string) $value)); }\nfunction generated_call(string $name, array $args): mixed { if ($name === 'default' && count($args) === 2) return generated_truthy($args[0]) ? $args[0] : $args[1]; throw new RuntimeException('generated function is not linked: ' . $name); }\n${functions}\nfunction render_template(string $target, Assign $assign, array $slots): string { return match ($target) {\n${dispatch}\n        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),\n}; }\nfunction render(Assign $assign, array $slots): string { return render_template(${quote(program.entry)}, $assign, $slots); }\n`;
}
mkdirSync(dirname(output), { recursive: true });
if (check) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== source) throw new Error(`typed generator output is stale: ${output}`);
} else writeFileSync(output, source);
process.stdout.write(`typed generator ${lang}: ${check ? 'checked' : 'generated'} ${output}\n`);
