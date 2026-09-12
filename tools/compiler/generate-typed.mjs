#!/usr/bin/env node
// Generate type-fixed host source from canonical AST and a data type manifest.
// The manifest is part of the input: arbitrary JSON cannot become statically typed by inference alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const astPath = value('--ast');
const manifestPath = value('--manifest');
const lang = value('--lang');
const output = value('--output');
const check = args.includes('--check');
if (!astPath || !manifestPath || !lang || !output || !['ts', 'go', 'rust', 'php'].includes(lang)) {
  throw new Error('usage: generate-typed.mjs --ast FILE --manifest FILE --lang ts|go|rust|php --output FILE');
}
const ast = JSON.parse(readFileSync(astPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const fields = manifest.fields ?? {};
const quote = s => JSON.stringify(s);
const fieldName = name => name.replace(/[^A-Za-z0-9_]/g, '_');
const typeName = type => type.replace(/\?$/, '');
const optional = type => type.endsWith('?');
const tsType = type => ({ string: 'string', number: 'number', boolean: 'boolean', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? typeName(type));
const goType = type => (optional(type) ? '*' : '') + ({ string: 'string', number: 'float64', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? typeName(type));
const rustType = type => `${optional(type) ? 'Option<' : ''}${({ string: 'String', number: 'f64', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'String' }[typeName(type)] ?? typeName(type))}${optional(type) ? '>' : ''}`;
const phpType = type => ({ string: 'string', number: 'float', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? typeName(type));
const tsField = (name, type) => `${name}${optional(type) ? '?' : ''}: ${tsType(type)};`;
const phpField = (name, type) => `public readonly ${optional(type) ? '?' : ''}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;

const localTypes = manifest.locals ?? {};
function lookupType(name, scope = []) { return scope.includes(name) ? (localTypes[name] ?? manifest.loops?.[name] ?? 'unknown?') : (fields[name] ?? 'unknown?'); }
function expr(node, target, scope = []) {
  if (node.type === 'Literal') return target.literal(node.value);
  if (node.type === 'Var') {
    const type = lookupType(node.name, scope);
    if (typeName(type) === 'unknown') throw new Error(`typed generator: ${node.name} is missing from the type manifest`);
    return scope.includes(node.name) ? target.local(fieldName(node.name), type) : target.var(fieldName(node.name), type);
  }
  if (node.type === 'LoopMeta') return target.loopMeta(node.loop, node.field);
  if (node.type === 'Member') return target.member(expr(node.object, target, scope), fieldName(node.key));
  if (node.type === 'Index') return target.index(expr(node.object, target, scope), expr(node.index, target, scope));
  if (node.type === 'Call') return target.call(node.name, node.args.map(item => expr(item, target, scope)));
  if (node.type === 'Unary') return target.unary(node.op, expr(node.operand, target, scope));
  if (node.type === 'Binary') return target.binary(node.op, expr(node.left, target, scope), expr(node.right, target, scope));
  if (node.type === 'Ternary') return target.ternary(expr(node.test, target, scope), node.then === null ? target.literal(null) : expr(node.then, target, scope), expr(node.else, target, scope));
  if (node.type === 'List') return target.list(node.items.map(item => item.type === 'Spread' ? { spread: true, value: expr(item.expr, target, scope) } : { spread: false, value: expr(item, target, scope) }));
  if (node.type === 'Map') return target.map(node.entries.map(item => item.type === 'Spread' ? { spread: true, value: expr(item.expr, target, scope) } : { spread: false, value: [expr(item.key, target, scope), expr(item.value, target, scope)] }));
  throw new Error(`typed generator: unsupported expression ${node.type}`);
}
function nodes(body, target, level = 1, scope = []) {
  const out = [];
  const activeScope = [...scope];
  for (const node of body) {
    if (node.type === 'Text') out.push(target.text(node.value, level));
    else if (node.type === 'Echo') out.push(target.echo(expr(node.expr, target, activeScope), level));
    else if (node.type === 'Block') out.push(target.block(node.id, level));
    else if (node.type === 'IfBlock') out.push(target.ifBlock(node, level, activeScope));
    else if (node.type === 'Set') { out.push(target.set(node.name, expr(node.expr, target, activeScope), level)); activeScope.push(node.name); }
    else if (node.type === 'If') out.push(target.ifNode(node, level, activeScope));
    else if (node.type === 'For') out.push(target.forNode(node, level, activeScope));
    else if (node.type === 'Include') out.push(target.include(node.path, level));
    else throw new Error(`typed generator: unsupported node ${node.type}`);
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
const nodeKinds = new Set(['Text', 'Echo', 'If', 'For', 'Set', 'Include', 'Block', 'IfBlock']);
const exprKinds = new Set(['Literal', 'Var', 'LoopMeta', 'Member', 'Index', 'Call', 'Unary', 'Binary', 'Ternary', 'List', 'Map']);
function validateExpr(value) {
  if (!value || typeof value !== 'object' || !exprKinds.has(value.type)) throw new Error(`typed generator: invalid expression ${value?.type ?? typeof value}`);
  if (value.type === 'Member') validateExpr(value.object);
  if (value.type === 'Index') { validateExpr(value.object); validateExpr(value.index); }
  if (value.type === 'Call') value.args.forEach(validateExpr);
  if (value.type === 'Unary') validateExpr(value.operand);
  if (value.type === 'Binary') { validateExpr(value.left); validateExpr(value.right); }
  if (value.type === 'Ternary') { validateExpr(value.test); if (value.then) validateExpr(value.then); validateExpr(value.else); }
  if (value.type === 'List') value.items.forEach(item => validateExpr(item.type === 'Spread' ? item.expr : item));
  if (value.type === 'Map') value.entries.forEach(item => item.type === 'Spread' ? validateExpr(item.expr) : (validateExpr(item.key), validateExpr(item.value)));
}
function validateNodes(body) {
  if (!Array.isArray(body)) throw new Error('typed generator: node body must be an array');
  for (const node of body) {
    if (!node || !nodeKinds.has(node.type)) throw new Error(`typed generator: invalid node ${node?.type ?? typeof node}`);
    if (node.type === 'Echo' || node.type === 'Set') validateExpr(node.expr);
    if (node.type === 'If') { node.branches.forEach(branch => { validateExpr(branch.test); validateNodes(branch.body); }); if (node.else) validateNodes(node.else); }
    if (node.type === 'For') { validateExpr(node.iter); validateNodes(node.body); if (node.empty) validateNodes(node.empty); }
    if (node.type === 'Block') node.scope?.forEach(item => validateExpr(item.expr));
    if (node.type === 'IfBlock') { validateNodes(node.body); if (node.else) validateNodes(node.else); }
  }
}
if (ast?.type !== 'Template' || !Array.isArray(ast.body)) throw new Error('typed generator: input must be a canonical Template AST');
validateNodes(ast.body);
if (lang === 'ts') {
  target.loopMeta = (loop, field) => `loops[${quote(`${loop}.${field}`)}]`;
  target.index = (object, index) => `${object}?.[${index}]`;
  target.call = (name, args) => `functions[${quote(name)}](${args.join(', ')})`;
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => `(${left} ${op === 'in' ? 'in' : op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(${test} ? ${thenValue} : ${elseValue})`;
  target.list = items => `[${items.map(item => item.spread ? `...${item.value}` : item.value).join(', ')}]`;
  target.map = entries => `new Map([${entries.map(item => item.spread ? `...${item.value}` : `[${item.value[0]}, ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} (Boolean(${expr(b.test, target, scope)})) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.else ? ` else {\n${nodes(node.else, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `for (const ${fieldName(node.name)} of (${expr(node.iter, target, scope)} ?? [])) {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'    '.repeat(n)}}${node.empty ? `\nif (!(${expr(node.iter, target, scope)}?.length)) {\n${nodes(node.empty, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`);
  target.include = (path, n) => indent(n, `out += include(${quote(path)});`);
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
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'\t'.repeat(n)}${i ? '} else if' : 'if'} generatedTruthy(${expr(b.test, target, scope)}) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'\t'.repeat(n)}}${node.else ? ` else {\n${nodes(node.else, target, n + 1, scope)}\n${'\t'.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `for _, ${fieldName(node.name)} := range ${expr(node.iter, target, scope)} {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'\t'.repeat(n)}}`);
  target.include = (path, n) => indent(n, `out.WriteString(include(${quote(path)}))`);
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
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} generated_truthy(&${expr(b.test, target, scope)}) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.else ? ` else {\n${nodes(node.else, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `for ${fieldName(node.name)} in generated_entries(&${expr(node.iter, target, scope)}) {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'    '.repeat(n)}}`);
  target.include = (path, n) => indent(n, `out.push_str(&include(${quote(path)}));`);
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
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} elseif' : 'if'} (generated_truthy(${expr(b.test, target, scope)})) {\n${nodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.else ? ` else {\n${nodes(node.else, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n, scope = []) => indent(n, `foreach (generated_entries(${expr(node.iter, target, scope)}) as ${fieldName(node.name)}) {\n${nodes(node.body, target, n + 1, [...scope, node.name])}\n${'    '.repeat(n)}}`);
  target.include = (path, n) => indent(n, `$out .= include_template(${quote(path)});`);
}
const body = nodes(ast.body, target, 1);
const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
const tsRecords = Object.entries(records).map(([name, members]) => `export interface ${name} {\n${Object.entries(members).map(([key, type]) => `  ${tsField(key, type)}`).join('\n')}\n}`).join('\n');
const goRecords = Object.entries(records).map(([name, members]) => `type ${name} struct { ${Object.entries(members).map(([key, type]) => `${key[0].toUpperCase() + key.slice(1)} ${goType(type)}`).join('; ')} }`).join('\n');
const rustRecords = Object.entries(records).map(([name, members]) => `#[derive(Default)] pub struct ${name} { ${Object.entries(members).map(([key, type]) => `pub ${key}: ${rustType(type)}`).join(', ')} }`).join('\n');
const phpRecords = Object.entries(records).map(([name, members]) => `final class ${name} { public function __construct(${Object.entries(members).map(([key, type]) => phpField(key, type)).join(', ')}) {} }`).join('\n');
let source;
if (lang === 'ts') source = `// Generated.\n${tsRecords}\nexport interface Assign {\n${Object.entries(fields).map(([n, t]) => `  ${tsField(n, t)}`).join('\n')}\n}\nexport function render(assign: Assign, slots: Record<string, string>): string { let out = '';\n${body}\n  return out; }\nfunction escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }\n`;
else if (lang === 'go') source = `// Generated.\npackage generated\nimport ("fmt"; "strings")\n${goRecords}\ntype Assign struct {\n${Object.entries(fields).map(([n, t]) => `\t${n[0].toUpperCase() + n.slice(1)} ${goType(t)}`).join('\n')}\n}\nfunc valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }\nfunc Render(assign Assign, slots map[string]string) string { var out strings.Builder\n${body}\n return out.String() }\nvar _ = fmt.Fprint\n`;
else if (lang === 'rust') source = `// Generated.\nuse std::collections::HashMap;\n${rustRecords}\n#[derive(Default)] pub struct Assign {\n${Object.entries(fields).map(([n, t]) => `    pub ${n}: ${rustType(t)},`).join('\n')}\n}\npub fn render(assign: &Assign, slots: &HashMap<String, String>) -> String { let mut out = String::new();\n${body}\n out }\nfn escape(value: &str) -> String { value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;") }\n`;
else source = `<?php\n${phpRecords}\nfinal class Assign { public function __construct(\n${Object.entries(fields).map(([n, t]) => phpField(n, t)).join(',\n')}\n) {} }\nfunction render(Assign $assign, array $slots): string { $out = '';\n${body}\n return $out; }\n`;
mkdirSync(dirname(output), { recursive: true });
if (check) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== source) throw new Error(`typed generator output is stale: ${output}`);
} else writeFileSync(output, source);
process.stdout.write(`typed generator ${lang}: ${check ? 'checked' : 'generated'} ${output}\n`);
