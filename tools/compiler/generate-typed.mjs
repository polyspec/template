#!/usr/bin/env node
// Generate type-fixed host source from canonical AST and a data type manifest.
// The manifest is part of the input: arbitrary JSON cannot become statically typed by inference alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
const tsType = type => ({ string: 'string', number: 'number', boolean: 'boolean', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? 'unknown') + (optional(type) ? ' | undefined' : '');
const goType = type => ({ string: 'string', number: 'float64', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? 'any');
const rustType = type => ({ string: 'String', number: 'f64', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'String' }[typeName(type)] ?? 'serde_json::Value') + (optional(type) ? '' : '');
const phpType = type => ({ string: 'string', number: 'float', boolean: 'bool', Page: 'Page', Slot: 'Slot', Template: 'string' }[typeName(type)] ?? 'mixed');

function lookupType(name) { return fields[name] ?? 'unknown?'; }
function expr(node, target) {
  if (node.type === 'Literal') return target.literal(node.value);
  if (node.type === 'Var') {
    const type = lookupType(node.name);
    if (typeName(type) === 'unknown') throw new Error(`typed generator: ${node.name} is missing from the type manifest`);
    return target.var(fieldName(node.name), type);
  }
  if (node.type === 'LoopMeta') return target.loopMeta(node.loop, node.field);
  if (node.type === 'Member') return target.member(expr(node.object, target), fieldName(node.key));
  if (node.type === 'Index') return target.index(expr(node.object, target), expr(node.index, target));
  if (node.type === 'Call') return target.call(node.name, node.args.map(item => expr(item, target)));
  if (node.type === 'Unary') return target.unary(node.op, expr(node.operand, target));
  if (node.type === 'Binary') return target.binary(node.op, expr(node.left, target), expr(node.right, target));
  if (node.type === 'Ternary') return target.ternary(expr(node.test, target), node.then === null ? target.literal(null) : expr(node.then, target), expr(node.else, target));
  if (node.type === 'List') return target.list(node.items.map(item => item.type === 'Spread' ? expr(item.expr, target) : expr(item, target)));
  if (node.type === 'Map') return target.map(node.entries.map(item => item.type === 'Spread' ? expr(item.expr, target) : [expr(item.key, target), expr(item.value, target)]));
  throw new Error(`typed generator: unsupported expression ${node.type}`);
}
function nodes(body, target, level = 1) {
  const out = [];
  for (const node of body) {
    if (node.type === 'Text') out.push(target.text(node.value, level));
    else if (node.type === 'Echo') out.push(target.echo(expr(node.expr, target), level));
    else if (node.type === 'Block') out.push(target.block(node.id, level));
    else if (node.type === 'IfBlock') out.push(target.ifBlock(node, level));
    else if (node.type === 'Set') out.push(target.set(node.name, expr(node.expr, target), level));
    else if (node.type === 'If') out.push(target.ifNode(node, level));
    else if (node.type === 'For') out.push(target.forNode(node, level));
    else if (node.type === 'Include') out.push(target.include(node.path, level));
    else throw new Error(`typed generator: unsupported node ${node.type}`);
  }
  return out.join('\n');
}
const indent = (n, s) => s.split('\n').map(line => '    '.repeat(n) + line).join('\n');
const common = {
  ts: {
    literal: v => v === null ? 'undefined' : typeof v === 'string' ? quote(v) : String(v),
    var: (n, type) => `assign.${n}${optional(type) ? '?' : ''}`,
    member: (o, k) => `${o}?.${k}`,
    text: (v, n) => indent(n, `out += ${quote(v)};`),
    echo: (e, n) => indent(n, `out += escape(String(${e} ?? ''));`),
    block: (id, n) => indent(n, `out += slots[${quote(id)}] ?? '';`),
    ifBlock: (node, n) => indent(n, `if (slots[${quote(node.id)}] !== undefined) {\n${nodes(node.body, this, n + 1)}\n${'    '.repeat(n)}}`),
    set: () => '',
  },
  go: {
    literal: v => v === null ? '""' : typeof v === 'string' ? quote(v) : String(v),
    var: n => `assign.${n[0].toUpperCase()}${n.slice(1)}`,
    member: (o, k) => `${o}.${k[0].toUpperCase()}${k.slice(1)}`,
    text: (v, n) => indent(n, `out.WriteString(${quote(v)})`),
    echo: (e, n) => indent(n, `fmt.Fprint(&out, ${e})`),
    block: (id, n) => indent(n, `out.WriteString(slots[${quote(id)}])`),
    ifBlock: (node, n) => indent(n, `if _, ok := slots[${quote(node.id)}]; ok { /* generated slot */ }`),
    set: () => '',
  },
  rust: {
    literal: v => v === null ? 'String::new()' : typeof v === 'string' ? quote(v) + '.to_string()' : String(v),
    var: n => `assign.${n}`,
    member: (o, k) => `${o}.${k}`,
    text: (v, n) => indent(n, `out.push_str(${quote(v)});`),
    echo: (e, n) => indent(n, `out.push_str(&escape(&${e}.to_string()));`),
    block: (id, n) => indent(n, `out.push_str(slots.get(${quote(id)}).map(String::as_str).unwrap_or(""));`),
    ifBlock: (node, n) => indent(n, `if slots.contains_key(${quote(node.id)}) {}`),
    set: () => '',
  },
  php: {
    literal: v => v === null ? 'null' : typeof v === 'string' ? quote(v) : String(v),
    var: n => `$assign->${n}`,
    member: (o, k) => `${o}?->${k}`,
    text: (v, n) => indent(n, `$out .= ${quote(v)};`),
    echo: (e, n) => indent(n, `$out .= htmlspecialchars((string) (${e} ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');`),
    block: (id, n) => indent(n, `$out .= $slots[${quote(id)}] ?? '';`),
    ifBlock: (node, n) => indent(n, `if (isset($slots[${quote(node.id)}])) {}`),
    set: () => '',
  },
}[lang];
// Bind `this`-free targets to the shared target so nested AST generation is recursive.
const target = { ...common };
if (lang === 'ts') target.ifBlock = (node, n) => indent(n, `if (slots[${quote(node.id)}] !== undefined) {\n${nodes(node.body, target, n + 1)}\n${'    '.repeat(n)}}`);
if (lang === 'go') target.ifBlock = (node, n) => indent(n, `if _, ok := slots[${quote(node.id)}]; ok {\n${nodes(node.body, target, n + 1)}\n}`);
if (lang === 'rust') target.ifBlock = (node, n) => indent(n, `if slots.contains_key(${quote(node.id)}) {\n${nodes(node.body, target, n + 1)}\n}`);
if (lang === 'php') target.ifBlock = (node, n) => indent(n, `if (isset($slots[${quote(node.id)}])) {\n${nodes(node.body, target, n + 1)}\n}`);
const body = nodes(ast.body, target, 1);
const records = manifest.records ?? {};
let source;
if (lang === 'ts') source = `// Generated.\nexport interface Page { title?: string; }\nexport interface Slot { template?: string; html?: string; }\nexport interface Assign {\n${Object.entries(fields).map(([n, t]) => `  ${n}?: ${tsType(t)};`).join('\n')}\n}\nexport function render(assign: Assign, slots: Record<string, string>): string { let out = '';\n${body}\n  return out; }\nfunction escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }\n`;
else if (lang === 'go') source = `// Generated.\npackage generated\nimport ("fmt"; "strings")\ntype Page struct { Title string }\ntype Slot struct { Template string; HTML string }\ntype Assign struct {\n${Object.entries(fields).map(([n, t]) => `\t${n[0].toUpperCase() + n.slice(1)} ${goType(t)}`).join('\n')}\n}\nfunc Render(assign Assign, slots map[string]string) string { var out strings.Builder\n${body}\n return out.String() }\nvar _ = fmt.Fprint\n`;
else if (lang === 'rust') source = `// Generated.\nuse std::collections::HashMap;\n#[derive(Default)] pub struct Page { pub title: String }\n#[derive(Default)] pub struct Slot { pub template: String, pub html: String }\n#[derive(Default)] pub struct Assign {\n${Object.entries(fields).map(([n, t]) => `    pub ${n}: ${rustType(t)},`).join('\n')}\n}\npub fn render(assign: &Assign, slots: &HashMap<String, String>) -> String { let mut out = String::new();\n${body}\n out }\nfn escape(value: &str) -> String { value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;") }\n`;
else source = `<?php\nfinal class Page { public function __construct(public readonly string $title = '') {} }\nfinal class Slot { public function __construct(public readonly string $template = '', public readonly string $html = '') {} }\nfinal class Assign { public function __construct(\n${Object.entries(fields).map(([n, t]) => `public readonly ?${phpType(t)} $${n} = null`).join(',\n')}\n) {} }\nfunction render(Assign $assign, array $slots): string { $out = '';\n${body}\n return $out; }\n`;
mkdirSync(dirname(output), { recursive: true });
if (check) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== source) throw new Error(`typed generator output is stale: ${output}`);
} else writeFileSync(output, source);
process.stdout.write(`typed generator ${lang}: ${check ? 'checked' : 'generated'} ${output}\n`);
