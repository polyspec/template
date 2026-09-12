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
const typeName = type => type.replace(/\?$/, '');
const optional = type => type.endsWith('?');
const tsType = type => ({ string: 'string', number: 'number', boolean: 'boolean', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? typeName(type));
const goType = type => (optional(type) ? '*' : '') + ({ string: 'string', number: 'float64', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? typeName(type));
const rustType = type => `${optional(type) ? 'Option<' : ''}${({ string: 'String', number: 'f64', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'String' }[typeName(type)] ?? typeName(type))}${optional(type) ? '>' : ''}`;
const phpType = type => ({ string: 'string', number: 'float', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? typeName(type));
const tsField = (name, type) => `${name}${optional(type) ? '?' : ''}: ${tsType(type)};`;
const phpField = (name, type) => `public readonly ${optional(type) ? '?' : ''}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;

function expr(node, target) {
  if (node.op === 'literal') return target.literal(node.value);
  if (node.op === 'root') return target.var(fieldName(node.name), node.valueType.source);
  if (node.op === 'local') return target.local(fieldName(node.name), node.valueType.source);
  if (node.op === 'loop-meta') return target.loopMeta(node.loop, node.field);
  if (node.op === 'member') return target.member(expr(node.object, target), fieldName(node.key));
  if (node.op === 'index') return target.index(expr(node.object, target), expr(node.index, target));
  if (node.op === 'call') return target.call(node.name, node.args.map(item => expr(item, target)));
  if (node.op === 'unary') return target.unary(node.operator, expr(node.operand, target));
  if (node.op === 'binary') return target.binary(node.operator, expr(node.left, target), expr(node.right, target));
  if (node.op === 'ternary') return target.ternary(expr(node.test, target), expr(node.then, target), expr(node.otherwise, target));
  if (node.op === 'list') return target.list(node.items.map(item => ({ spread: item.spread, value: expr(item.value, target) })));
  if (node.op === 'map') return target.map(node.entries.map(item => item.spread ? { spread: true, value: expr(item.value, target) } : { spread: false, value: [expr(item.key, target), expr(item.value, target)] }));
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
    else if (node.op === 'include') out.push(target.include(node.target, level));
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
    echo: (e, n) => indent(n, `out += escape(String(${e} ?? ''));`),
    block: (id, n) => indent(n, `out += slots[${quote(id)}] ?? '';`),
    ifBlock: (node, n) => indent(n, `if (slots[${quote(node.id)}] !== undefined) {\n${nodes(node.body, this, n + 1)}\n${'    '.repeat(n)}}`),
    set: (name, value, n) => indent(n, `const ${fieldName(name)} = ${value};`),
  },
  go: {
    literal: v => v === null ? '""' : typeof v === 'string' ? quote(v) : String(v),
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
    literal: v => v === null ? 'String::new()' : typeof v === 'string' ? quote(v) + '.to_string()' : String(v),
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
    echo: (e, n) => indent(n, `$out .= htmlspecialchars((string) (${e} ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');`),
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
  target.loopMeta = (loop, field) => `loops[${quote(`${loop}.${field}`)}]`;
  target.index = (object, index) => `${object}?.[${index}]`;
  target.call = (name, args) => `functions[${quote(name)}](${args.join(', ')})`;
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => `(${left} ${op === 'in' ? 'in' : op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(${test} ? ${thenValue} : ${elseValue})`;
  target.list = items => `[${items.map(item => item.spread ? `...${item.value}` : item.value).join(', ')}]`;
  target.map = entries => `new Map([${entries.map(item => item.spread ? `...${item.value}` : `[${item.value[0]}, ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} (Boolean(${expr(b.test, target, scope)})) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `for (const ${fieldName(node.name)} of (${expr(node.iter, target, scope)} ?? [])) {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'    '.repeat(n)}}${node.empty ? `\nif (!(${expr(node.iter, target, scope)}?.length)) {\n${nodes(node.empty, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`);
  target.include = (path, n) => indent(n, `out += renderTemplate(${quote(path)}, assign, slots);`);
}
if (lang === 'go') {
  target.loopMeta = (loop, field) => `loopMeta[${quote(`${loop}.${field}`)}]`;
  target.index = (object, index) => `generatedIndex(${object}, ${index})`;
  target.call = (name, args) => `generatedCall(${quote(name)}, []any{${args.join(', ')}})`;
  target.unary = (op, operand) => `generatedUnary(${quote(op)}, ${operand})`;
  target.binary = (op, left, right) => `generatedBinary(${quote(op)}, ${left}, ${right})`;
  target.ternary = (test, thenValue, elseValue) => `generatedTruthy(${test}) ? ${thenValue} : ${elseValue}`;
  target.list = items => `[]any{${items.filter(item => !item.spread).map(item => item.value).join(', ')}}`;
  target.map = entries => `map[any]any{${entries.filter(item => !item.spread).map(item => `${item.value[0]}: ${item.value[1]}`).join(', ')}}`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'\t'.repeat(n)}${i ? '} else if' : 'if'} generatedTruthy(${expr(b.test, target, scope)}) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'\t'.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'\t'.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `for _, ${fieldName(node.name)} := range ${expr(node.iter, target, scope)} {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'\t'.repeat(n)}}`);
  target.include = (path, n) => indent(n, `out.WriteString(renderTemplate(${quote(path)}, assign, slots))`);
}
if (lang === 'rust') {
  target.loopMeta = (loop, field) => `loop_meta.get(${quote(`${loop}.${field}`)})`;
  target.index = (object, index) => `generated_index(${object}, ${index})`;
  target.call = (name, args) => `generated_call(${quote(name)}, vec![${args.join(', ')}])`;
  target.unary = (op, operand) => `generated_unary(${quote(op)}, ${operand})`;
  target.binary = (op, left, right) => `generated_binary(${quote(op)}, ${left}, ${right})`;
  target.ternary = (test, thenValue, elseValue) => `if generated_truthy(&${test}) { ${thenValue} } else { ${elseValue} }`;
  target.list = items => `vec![${items.filter(item => !item.spread).map(item => item.value).join(', ')}]`;
  target.map = entries => `HashMap::from([${entries.filter(item => !item.spread).map(item => `(${item.value[0]}, ${item.value[1]})`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} generated_truthy(&${expr(b.test, target, scope)}) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `for ${fieldName(node.name)} in generated_entries(&${expr(node.iter, target, scope)}) {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'    '.repeat(n)}}`);
  target.include = (path, n) => indent(n, `out.push_str(&render_template(${quote(path)}, assign, slots));`);
}
if (lang === 'php') {
  target.loopMeta = (loop, field) => `$loopMeta[${quote(`${loop}.${field}`)}]`;
  target.index = (object, index) => `generated_index(${object}, ${index})`;
  target.call = (name, args) => `generated_call(${quote(name)}, [${args.join(', ')}])`;
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(${test} ? ${thenValue} : ${elseValue})`;
  target.list = items => `[${items.filter(item => !item.spread).map(item => item.value).join(', ')}]`;
  target.map = entries => `[${entries.filter(item => !item.spread).map(item => `${item.value[0]} => ${item.value[1]}`).join(', ')}]`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} elseif' : 'if'} (generated_truthy(${expr(b.test, target, scope)})) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${nodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `foreach (generated_entries(${expr(node.iter, target, scope)}) as ${fieldName(node.name)}) {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'    '.repeat(n)}}`);
  target.include = (path, n) => indent(n, `$out .= render_template(${quote(path)}, $assign, $slots);`);
}
const templateBodies = [...program.templates.values()].map(template => ({ name: template.name, function: functionName(template.name), body: nodes(template.body, target, 1) }));
const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
const tsRecords = Object.entries(records).map(([name, members]) => `export interface ${name} {\n${Object.entries(members).map(([key, type]) => `  ${tsField(key, type)}`).join('\n')}\n}`).join('\n');
const goRecords = Object.entries(records).map(([name, members]) => `type ${name} struct { ${Object.entries(members).map(([key, type]) => `${key[0].toUpperCase() + key.slice(1)} ${goType(type)}`).join('; ')} }`).join('\n');
const rustRecords = Object.entries(records).map(([name, members]) => `#[derive(Default)] pub struct ${name} { ${Object.entries(members).map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }`).join('\n');
const phpRecords = Object.entries(records).map(([name, members]) => `final class ${name} { public function __construct(${Object.entries(members).map(([key, type]) => phpField(key, type)).join(', ')}) {} }`).join('\n');
let source;
if (lang === 'ts') {
  const functions = templateBodies.map(template => `function ${template.function}(assign: Assign, slots: Record<string, string>): string { let out = '';\n${template.body}\n  return out; }`).join('\n');
  const dispatch = templateBodies.map(template => `    case ${quote(template.name)}: return ${template.function}(assign, slots);`).join('\n');
  source = `// Generated.\n${tsRecords}\nexport interface Assign {\n${Object.entries(fields).map(([n, t]) => `  ${tsField(n, t)}`).join('\n')}\n}\n${functions}\nexport function renderTemplate(target: string, assign: Assign, slots: Record<string, string>): string {\n  switch (target) {\n${dispatch}\n    default: throw new Error('generated template is missing: ' + target);\n  }\n}\nexport function render(assign: Assign, slots: Record<string, string>): string { return renderTemplate(${quote(program.entry)}, assign, slots); }\nfunction escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }\n`;
} else if (lang === 'go') {
  const functions = templateBodies.map(template => `func ${template.function}(assign Assign, slots map[string]string) string { var out strings.Builder\n${template.body}\n return out.String() }`).join('\n');
  const dispatch = templateBodies.map(template => `\tcase ${quote(template.name)}: return ${template.function}(assign, slots)`).join('\n');
  source = `// Generated.\npackage generated\nimport ("fmt"; "strings")\n${goRecords}\ntype Assign struct {\n${Object.entries(fields).map(([n, t]) => `\t${n[0].toUpperCase() + n.slice(1)} ${goType(t)}`).join('\n')}\n}\nfunc valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }\n${functions}\nfunc renderTemplate(target string, assign Assign, slots map[string]string) string { switch target {\n${dispatch}\n\tdefault: panic("generated template is missing: " + target)\n} }\nfunc Render(assign Assign, slots map[string]string) string { return renderTemplate(${quote(program.entry)}, assign, slots) }\nvar _ = fmt.Fprint\n`;
} else if (lang === 'rust') {
  const functions = templateBodies.map(template => `fn ${template.function}(assign: &Assign, slots: &HashMap<String, String>) -> String { let mut out = String::new();\n${template.body}\n out }`).join('\n');
  const dispatch = templateBodies.map(template => `        ${quote(template.name)} => ${template.function}(assign, slots),`).join('\n');
  source = `// Generated.\nuse std::collections::HashMap;\n${rustRecords}\n#[derive(Default)] pub struct Assign {\n${Object.entries(fields).map(([n, t]) => `    pub ${n}: ${rustType(t)},`).join('\n')}\n}\n${functions}\nfn render_template(target: &str, assign: &Assign, slots: &HashMap<String, String>) -> String { match target {\n${dispatch}\n        _ => panic!("generated template is missing: {target}"),\n} }\npub fn render(assign: &Assign, slots: &HashMap<String, String>) -> String { render_template(${quote(program.entry)}, assign, slots) }\nfn escape(value: &str) -> String { value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;") }\n`;
} else {
  const functions = templateBodies.map(template => `function ${template.function}(Assign $assign, array $slots): string { $out = '';\n${template.body}\n return $out; }`).join('\n');
  const dispatch = templateBodies.map(template => `        ${quote(template.name)} => ${template.function}($assign, $slots),`).join('\n');
  source = `<?php\n${phpRecords}\nfinal class Assign { public function __construct(\n${Object.entries(fields).map(([n, t]) => phpField(n, t)).join(',\n')}\n) {} }\n${functions}\nfunction render_template(string $target, Assign $assign, array $slots): string { return match ($target) {\n${dispatch}\n        default => throw new RuntimeException('generated template is missing: ' . $target),\n}; }\nfunction render(Assign $assign, array $slots): string { return render_template(${quote(program.entry)}, $assign, $slots); }\n`;
}
mkdirSync(dirname(output), { recursive: true });
if (check) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== source) throw new Error(`typed generator output is stale: ${output}`);
} else writeFileSync(output, source);
process.stdout.write(`typed generator ${lang}: ${check ? 'checked' : 'generated'} ${output}\n`);
