#!/usr/bin/env node
// Lowers showcase AST nodes into host-language render functions.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const scenariosRoot = join(root, 'examples', 'site', 'scenarios');
const outputRoot = join(root, 'tools', 'showcase', 'adapters', 'generated');
const check = process.argv.includes('--check');

function scenarios() {
  const result = {};
  for (const entry of readdirSync(scenariosRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const base = join(scenariosRoot, entry.name, 'compiled', 'typescript');
    const manifestPath = join(base, 'manifest.json');
    if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    result[entry.name] = {};
    for (const [name, item] of Object.entries(manifest.templates)) {
      result[entry.name][name] = JSON.parse(readFileSync(join(base, item.artifact), 'utf8'));
    }
  }
  return result;
}

const all = scenarios();
const q = value => JSON.stringify(value);
const expr = node => {
  switch (node.type) {
    case 'Literal': return q(node.value);
    case 'Var': return `lookup(ctx, root, ${q(node.name)})`;
    case 'LoopMeta': return `lookup(ctx, root, ${q(`${node.loop}.${node.field}`)})`;
    case 'Member': return `member(${expr(node.object)}, ${q(node.key)})`;
    case 'Index': return `member(${expr(node.object)}, ${expr(node.index)})`;
    case 'Call': return `call(${q(node.name)}, [${node.args.map(expr).join(', ')}])`;
    case 'Unary': return `unary(${q(node.op)}, ${expr(node.operand)})`;
    case 'Binary': return `binary(${q(node.op)}, ${expr(node.left)}, ${expr(node.right)})`;
    case 'Ternary': return `truthy(${expr(node.test)}) ? ${expr(node.then)} : ${expr(node.else)}`;
    case 'List': return `[${node.items.map(item => expr(item.expr ?? item)).join(', ')}]`;
    case 'Map': return `new Map([${node.entries.map(item => `[${expr(item.key)}, ${expr(item.value)}]`).join(', ')}])`;
    default: throw new Error(`unsupported generated expression node: ${node.type}`);
  }
};

function nodes(body, level = 1, scenario = "") {
  const pad = '  '.repeat(level);
  const lines = [];
  for (const node of body) {
    switch (node.type) {
      case 'Text': lines.push(`${pad}out += ${q(node.value)};`); break;
      case 'Echo': lines.push(`${pad}out += escapeValue(${expr(node.expr)});`); break;
      case 'Set': lines.push(`${pad}ctx.set(${q(node.name)}, ${expr(node.expr)});`); break;
      case 'If': {
        node.branches.forEach((branch, index) => {
          lines.push(`${pad}${index === 0 ? 'if' : '} else if'} (truthy(${expr(branch.test)})) {`);
          lines.push(...nodes(branch.body, level + 1, scenario));
        });
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...nodes(node.else, level + 1, scenario)); }
        lines.push(`${pad}}`); break;
      }
      case 'For': {
        lines.push(`${pad}for (const [loopKey, loopValue] of entries(${expr(node.iter)})) {`);
        lines.push(`${pad}  const previous = ctx;`);
        lines.push(`${pad}  ctx = new Map(ctx);`);
        lines.push(`${pad}  ctx.set(${q(node.name)}, loopValue);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.key_`)}, loopKey);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.value_`)}, loopValue);`);
        lines.push(...nodes(node.body, level + 1, scenario));
        lines.push(`${pad}  ctx = previous;`);
        lines.push(`${pad}}`);
        if (node.empty) { lines.push(`${pad}if (entries(${expr(node.iter)}).length === 0) {`); lines.push(...nodes(node.empty, level + 1, scenario)); lines.push(`${pad}}`); }
        break;
      }
      case 'Block':
        lines.push(`${pad}const blockScope = new Map();`);
        for (const item of node.scope ?? []) lines.push(`${pad}blockScope.set(${q(item.name)}, ${expr(item.expr)});`);
        lines.push(`${pad}out += renderBlock(${q(node.id)}, ${q(node.path)}, scenario, root, define, env, blockScope);`);
        break;
      case 'IfBlock':
        lines.push(`${pad}if (define.has(${q(node.id)})) {`);
        lines.push(...nodes(node.body, level + 1, scenario));
        if (node.else) {
          lines.push(`${pad}} else {`);
          lines.push(...nodes(node.else, level + 1, scenario));
        }
        lines.push(`${pad}}`);
        break;
      case 'Include': throw new Error('direct showcase generator does not support Include yet');
      default: throw new Error(`unsupported generated node: ${node.type}`);
    }
  }
  return lines;
}

const functions = {};
const scenarioDispatch = {};
for (const [scenario, templates] of Object.entries(all)) {
  scenarioDispatch[scenario] = [];
  for (const [name, template] of Object.entries(templates)) {
    const id = `${scenario}__${name}`;
    const safe = id.replace(/[^A-Za-z0-9_]/g, '_');
    functions[id] = `function render_${safe}(root, define, env, parent, scenario) {\n  let ctx = new Map(parent ?? root);\n  let out = '';\n${nodes(template.body, 1, scenario).join('\n')}\n  return out;\n}`;
    scenarioDispatch[scenario].push(`      case ${q(name)}: return render_${safe}(root, define, env, parent, scenario);`);
  }
}
const dispatch = Object.entries(scenarioDispatch).map(([scenario, cases]) => `    case ${q(scenario)}:\n      switch (name) {\n${cases.join('\n')}\n        default: throw new Error('generated template is missing: ' + name);\n      }`).join('\n');
const common = `// Generated by tools/showcase/generate-direct.mjs. Do not edit.\nfunction lookup(ctx, root, name) {\n  if (ctx.has(name)) return ctx.get(name);\n  return root.get(name);\n}\nfunction member(value, key) {\n  if (value instanceof Map) return value.get(key);\n  if (value !== null && typeof value === 'object') return value[key];\n  return undefined;\n}\nfunction truthy(value) { return value !== null && value !== undefined && value !== false && value !== '' && value !== 0; }\nfunction escapeValue(value) {\n  if (value instanceof Map || Array.isArray(value)) throw new Error('generated renderer cannot stringify a collection');\n  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');\n}\nfunction entries(value) {\n  if (value instanceof Map) return [...value.entries()];\n  if (Array.isArray(value)) return value.map((item, index) => [index, item]);\n  if (value === null || value === undefined) return [];\n  throw new Error('generated renderer expected an iterable');\n}\nfunction call(name, args) {\n  if (name === 'default') return truthy(args[0]) ? args[0] : args[1];\n  throw new Error('unknown generated function: ' + name);\n}\nfunction unary(op, value) { return op === '!' ? !truthy(value) : -value; }\nfunction binary(op, left, right) {\n  if (op === '&&') return truthy(left) && right;\n  if (op === '||') return truthy(left) ? left : right;\n  if (op === '??') return left ?? right;\n  if (op === '+') return typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : left + right;\n  return ({'==': left == right, '!=': left != right, '===': left === right, '!==': left !== right, '<': left < right, '>': left > right, '<=': left <= right, '>=': left >= right})[op];\n}\nfunction renderBlock(id, path, scenario, root, define, env, scope) {\n  const entry = define.get(id);\n  if (!entry) return '';\n  if (entry.html !== undefined) return entry.html;\n  const target = entry.template ?? path;\n  const data = entry.data instanceof Map ? entry.data : new Map();\n  const context = new Map(root);\n  for (const [key, value] of data) context.set(key, value);\n  for (const [key, value] of scope) context.set(key, value);\n  return renderTemplate(target, root, define, env, context, scenario);\n}\nfunction renderTemplate(name, root, define, env, parent, scenario) {\n  switch (scenario) {\n${dispatch}\n    default: throw new Error('generated scenario is missing: ' + scenario);\n  }\n}\nexport function renderGenerated(scenarioRoot, target, root, define, env) {\n  const entry = define.get(target);\n  const name = typeof entry === 'string' ? entry : entry?.template ?? target;\n  const scenario = scenarioRoot.split('/').pop();\n  return renderTemplate(name, root, define, env, root, scenario);\n}\n`;
const ts = `// @ts-nocheck\n${common}\n${Object.values(functions).join('\n\n')}\n`;
const js = `${common}\n${Object.values(functions).join('\n\n')}\n`;
const goExpr = node => {
  switch (node.type) {
    case 'Literal':
      if (node.value === null) return 'nil';
      if (typeof node.value === 'string') return q(node.value);
      if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
      return `${node.value}`;
    case 'Var': return `generatedLookup(ctx, root, ${q(node.name)})`;
    case 'Member': return `generatedMember(${goExpr(node.object)}, ${q(node.key)})`;
    case 'Call': return `generatedCall(${q(node.name)}, []value.Value{${node.args.map(goExpr).join(', ')}})`;
    case 'Binary': return `generatedBinary(${q(node.op)}, ${goExpr(node.left)}, ${goExpr(node.right)})`;
    case 'Unary': return `generatedUnary(${q(node.op)}, ${goExpr(node.operand)})`;
    default: throw new Error(`unsupported direct Go expression node: ${node.type}`);
  }
};
const goNodes = (body, level = 1, scenario = '') => {
  const pad = '\t'.repeat(level);
  const lines = [];
  for (const node of body) {
    switch (node.type) {
      case 'Text': lines.push(`${pad}out.WriteString(${q(node.value)})`); break;
      case 'Echo': lines.push(`${pad}if err := generatedEcho(&out, ${goExpr(node.expr)}); err != nil { return "", err }`); break;
      case 'Set': lines.push(`${pad}ctx[${q(node.name)}] = ${goExpr(node.expr)}`); break;
      case 'If':
        node.branches.forEach((branch, index) => {
          lines.push(`${pad}${index === 0 ? 'if' : '} else if'} generatedTruthy(${goExpr(branch.test)}) {`);
          lines.push(...goNodes(branch.body, level + 1, scenario));
        });
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...goNodes(node.else, level + 1, scenario)); }
        lines.push(`${pad}}`); break;
      case 'Block':
        lines.push(`${pad}blockScope := map[string]value.Value{}`);
        for (const item of node.scope ?? []) lines.push(`${pad}blockScope[${q(item.name)}] = ${goExpr(item.expr)}`);
        lines.push(`${pad}blockHTML, err := generatedBlock(${q(node.id)}, ${node.path === null ? '""' : q(node.path)}, ${q(scenario)}, root, define, blockScope)`);
        lines.push(`${pad}if err != nil { return "", err }`);
        lines.push(`${pad}out.WriteString(blockHTML)`); break;
      case 'IfBlock':
        lines.push(`${pad}if _, ok := define.Get(${q(node.id)}); ok {`);
        lines.push(...goNodes(node.body, level + 1, scenario));
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...goNodes(node.else, level + 1, scenario)); }
        lines.push(`${pad}}`); break;
      default: throw new Error(`unsupported direct Go node: ${node.type}`);
    }
  }
  return lines;
};
const goFunctions = [];
const goDispatch = {};
for (const [scenario, templates] of Object.entries(all)) {
  goDispatch[scenario] = [];
  for (const [name, template] of Object.entries(templates)) {
    const safe = `${scenario}__${name}`.replace(/[^A-Za-z0-9_]/g, '_');
    goFunctions.push(`func generated_${safe}(root *value.OrderedMap, define DefineRegistry, parent map[string]value.Value) (string, error) {\n\tctx := map[string]value.Value{}\n\tfor key, item := range parent { ctx[key] = item }\n\tvar out strings.Builder\n${goNodes(template.body, 1, scenario).join('\n')}\n\treturn out.String(), nil\n}`);
    goDispatch[scenario].push(`\t\tcase ${q(name)}: return generated_${safe}(root, define, parent)`);
  }
}
const goDispatchText = Object.entries(goDispatch).map(([scenario, cases]) => `\tcase ${q(scenario)}:\n\t\tswitch name {\n${cases.join('\n')}\n\t\tdefault: return "", fmt.Errorf("generated template is missing: %s", name)\n\t\t}`).join('\n');
const goDirect = `// Generated by tools/showcase/generate-direct.mjs. Do not edit.\npackage main\n\nimport (\n\t"fmt"\n\t"path/filepath"\n\t"strings"\n\n\t"github.com/polyspec/template/functions"\n\t"github.com/polyspec/template/value"\n)\n\nfunc generatedLookup(ctx map[string]value.Value, root *value.OrderedMap, name string) value.Value {\n\tif item, ok := ctx[name]; ok { return item }\n\titem, _ := root.Get(name)\n\treturn item\n}\nfunc generatedMember(item value.Value, key string) value.Value {\n\tif object, ok := item.(*value.OrderedMap); ok { value, _ := object.Get(key); return value }\n\treturn nil\n}\nfunc generatedTruthy(item value.Value) bool { return value.IsTruthy(item) }\nfunc generatedEcho(out *strings.Builder, item value.Value) error {\n\ttext, err := value.Stringify(item); if err != nil { return err }; out.WriteString(functions.EscapeHTML(text)); return nil\n}\nfunc generatedDefault(args []value.Value) value.Value { if len(args) > 1 && value.IsTruthy(args[0]) { return args[0] }; if len(args) > 1 { return args[1] }; return nil }\nfunc generatedCall(name string, args []value.Value) value.Value { if name == "default" { return generatedDefault(args) }; return nil }\nfunc generatedUnary(op string, item value.Value) value.Value { if op == "!" { return !value.IsTruthy(item) }; return nil }\nfunc generatedBinary(op string, left, right value.Value) value.Value { if op == "&&" { return value.IsTruthy(left) && value.IsTruthy(right) }; if op == "||" { return value.IsTruthy(left) || value.IsTruthy(right) }; return nil }\nfunc generatedBlock(id, path, scenario string, root *value.OrderedMap, define DefineRegistry, scope map[string]value.Value) (string, error) {\n\tentry, ok := define.Get(id); if !ok { return "", nil }; typed, ok := entry.(DefineEntry); if !ok { return "", fmt.Errorf("generated define %s has invalid type", id) }; if typed.HTML != nil { return *typed.HTML, nil }; target := path; if typed.Template != nil { target = *typed.Template }; context := map[string]value.Value{}; for _, key := range root.Keys() { item, _ := root.Get(key); context[key] = item }; if typed.Data != nil { for _, key := range typed.Data.Keys() { item, _ := typed.Data.Get(key); context[key] = item } }; for key, item := range scope { context[key] = item }; return generatedTemplate(target, scenario, root, define, context)\n}\nfunc generatedTemplate(name, scenario string, root *value.OrderedMap, define DefineRegistry, parent map[string]value.Value) (string, error) {\n\tswitch scenario {\n${goDispatchText}\n\tdefault: return "", fmt.Errorf("generated scenario is missing: %s", filepath.Base(scenario))\n\t}\n}\nfunc generatedDirectRender(rootPath string, request RenderRequest) (string, error) {\n\tentry, ok := request.Define.Get(request.Target); name := request.Target; if ok { if path, isPath := entry.(string); isPath { name = path } else if typed, isTyped := entry.(DefineEntry); isTyped && typed.Template != nil { name = *typed.Template } }; return generatedTemplate(name, filepath.Base(rootPath), request.Assign, request.Define, map[string]value.Value{})\n}\n\n${goFunctions.join('\n\n')}\n`;
const rustExpr = node => {
  switch (node.type) {
    case 'Literal': return node.value === null ? 'Value::Null' : typeof node.value === 'string' ? `Value::String(${q(node.value)}.to_string())` : `serde_json::json!(${q(node.value)})`;
    case 'Var': return `generated_lookup(&ctx, root, ${q(node.name)})`;
    case 'Member': return `generated_member(${rustExpr(node.object)}, ${q(node.key)})`;
    case 'Call': return `generated_call(${q(node.name)}, vec![${node.args.map(rustExpr).join(', ')}])`;
    default: throw new Error(`unsupported direct Rust expression node: ${node.type}`);
  }
};
const rustNodes = (body, level = 1, scenario = '') => {
  const pad = '    '.repeat(level);
  const lines = [];
  for (const node of body) {
    switch (node.type) {
      case 'Text': lines.push(`${pad}out.push_str(${q(node.value)});`); break;
      case 'Echo': lines.push(`${pad}generated_echo(&mut out, ${rustExpr(node.expr)})?;`); break;
      case 'Set': lines.push(`${pad}ctx.insert(${q(node.name)}.to_string(), ${rustExpr(node.expr)});`); break;
      case 'Block':
        lines.push(`${pad}let mut block_scope = Map::new();`);
        for (const item of node.scope ?? []) lines.push(`${pad}block_scope.insert(${q(item.name)}.to_string(), ${rustExpr(item.expr)});`);
        lines.push(`${pad}out.push_str(&generated_block(${q(node.id)}, ${q(node.path ?? '')}, ${q(scenario)}, root, define, &block_scope)?);`); break;
      case 'IfBlock':
        lines.push(`${pad}if define.contains_key(${q(node.id)}) {`);
        lines.push(...rustNodes(node.body, level + 1, scenario));
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...rustNodes(node.else, level + 1, scenario)); }
        lines.push(`${pad}}`); break;
      default: throw new Error(`unsupported direct Rust node: ${node.type}`);
    }
  }
  return lines;
};
const rustFunctions = [];
const rustDispatch = {};
for (const [scenario, templates] of Object.entries(all)) {
  rustDispatch[scenario] = [];
  for (const [name, template] of Object.entries(templates)) {
    const safe = `${scenario}__${name}`.replace(/[^A-Za-z0-9_]/g, '_');
    rustFunctions.push(`fn generated_${safe}(root: &Map<String, Value>, define: &DefineRegistry, parent: &Map<String, Value>) -> Result<String, String> {\n    let mut ctx = parent.clone();\n    let mut out = String::new();\n${rustNodes(template.body, 1, scenario).join('\n')}\n    Ok(out)\n}`);
    rustDispatch[scenario].push(`            "${name}" => generated_${safe}(root, define, parent),`);
  }
}
const rustDispatchText = Object.entries(rustDispatch).map(([scenario, cases]) => `        "${scenario}" => match name {\n${cases.join('\n')}\n            _ => Err(format!("generated template is missing: {name}")),\n        },`).join('\n');
const rustDirect = `// Generated by tools/showcase/generate-direct.mjs. Do not edit.\nuse crate::render_adapter::{DefineRegistry, RenderRequest};\nuse serde_json::{Map, Value};\nuse std::path::Path;\n\nfn generated_lookup(ctx: &Map<String, Value>, root: &Map<String, Value>, name: &str) -> Value { ctx.get(name).cloned().or_else(|| root.get(name).cloned()).unwrap_or(Value::Null) }\nfn generated_member(value: Value, key: &str) -> Value { value.as_object().and_then(|map| map.get(key)).cloned().unwrap_or(Value::Null) }\nfn generated_truthy(value: &Value) -> bool { match value { Value::Null => false, Value::Bool(value) => *value, Value::Number(value) => value.as_f64().unwrap_or(0.0) != 0.0, Value::String(value) => !value.is_empty(), Value::Array(value) => !value.is_empty(), Value::Object(value) => !value.is_empty() } }\nfn generated_string(value: Value) -> Result<String, String> { match value { Value::Null => Ok(String::new()), Value::Bool(value) => Ok(value.to_string()), Value::Number(value) => Ok(value.to_string()), Value::String(value) => Ok(value), Value::Array(_) | Value::Object(_) => Err("a collection cannot be converted to text".to_string()) } }\nfn generated_escape(value: Value) -> Result<String, String> { Ok(generated_string(value)?.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('\\"', "&quot;").replace("'", "&#39;")) }\nfn generated_echo(out: &mut String, value: Value) -> Result<(), String> { out.push_str(&generated_escape(value)?); Ok(()) }\nfn generated_call(name: &str, args: Vec<Value>) -> Value { if name == "default" && args.len() > 1 { if generated_truthy(&args[0]) { args[0].clone() } else { args[1].clone() } } else { Value::Null } }\nfn generated_block(id: &str, path: &str, scenario: &str, root: &Map<String, Value>, define: &DefineRegistry, scope: &Map<String, Value>) -> Result<String, String> {\n    let Some(entry) = define.get(id) else { return Ok(String::new()) };\n    if let Some(html) = &entry.html { return Ok(html.clone()) }\n    let target = entry.template.as_deref().unwrap_or(path);\n    let mut context = root.clone();\n    if let Some(data) = &entry.data { context.extend(data.clone()) }\n    context.extend(scope.clone());\n    generated_template(target, scenario, root, define, &context)\n}\nfn generated_template(name: &str, scenario: &str, root: &Map<String, Value>, define: &DefineRegistry, parent: &Map<String, Value>) -> Result<String, String> {\n    match scenario {\n${rustDispatchText}\n        _ => Err(format!("generated scenario is missing: {}", Path::new(scenario).file_name().and_then(|v| v.to_str()).unwrap_or(scenario))),\n    }\n}\npub fn generated_direct_render(root_path: &Path, request: &RenderRequest) -> Result<String, String> {\n    let name = request.define.get(&request.target).and_then(|entry| entry.template.clone()).unwrap_or_else(|| request.target.clone());\n    generated_template(&name, root_path.file_name().and_then(|v| v.to_str()).unwrap_or_default(), &request.assign, &request.define, &Map::new())\n}\n\n${rustFunctions.join('\n\n')}\n`;
const phpQuote = value => "'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n') + "'";
const phpText = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('\r', '\\r').replaceAll('\n', '\\n') + '"';
const phpExpr = node => {
  switch (node.type) {
    case 'Literal': return node.value === null ? 'null' : typeof node.value === 'string' ? phpQuote(node.value) : JSON.stringify(node.value);
    case 'Var': return `generated_lookup($ctx, $root, ${phpQuote(node.name)})`;
    case 'Member': return `generated_member(${phpExpr(node.object)}, ${phpQuote(node.key)})`;
    case 'Call': return `generated_call(${phpQuote(node.name)}, [${node.args.map(phpExpr).join(', ')}])`;
    default: throw new Error(`unsupported direct PHP expression node: ${node.type}`);
  }
};
const phpNodes = (body, level = 1, scenario = '') => {
  const pad = '    '.repeat(level);
  const lines = [];
  for (const node of body) {
    switch (node.type) {
      case 'Text': lines.push(`${pad}$out .= ${phpText(node.value)};`); break;
      case 'Echo': lines.push(`${pad}$out .= generated_escape(${phpExpr(node.expr)});`); break;
      case 'Set': lines.push(`${pad}$ctx->set(${phpQuote(node.name)}, ${phpExpr(node.expr)});`); break;
      case 'Block':
        lines.push(`${pad}$blockScope = new MapValue();`);
        for (const item of node.scope ?? []) lines.push(`${pad}$blockScope->set(${phpQuote(item.name)}, ${phpExpr(item.expr)});`);
        lines.push(`${pad}$out .= generated_block(${phpQuote(node.id)}, ${phpQuote(node.path ?? '')}, ${phpQuote(scenario)}, $root, $define, $blockScope);`); break;
      case 'IfBlock':
        lines.push(`${pad}if ($define->has(${phpQuote(node.id)})) {`);
        lines.push(...phpNodes(node.body, level + 1, scenario));
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...phpNodes(node.else, level + 1, scenario)); }
        lines.push(`${pad}}`); break;
      default: throw new Error(`unsupported direct PHP node: ${node.type}`);
    }
  }
  return lines;
};
const phpFunctions = [];
const phpDispatch = {};
for (const [scenario, templates] of Object.entries(all)) {
  phpDispatch[scenario] = [];
  for (const [name, template] of Object.entries(templates)) {
    const safe = `${scenario}__${name}`.replace(/[^A-Za-z0-9_]/g, '_');
    phpFunctions.push(`function generated_${safe}(MapValue $root, MapValue $define, MapValue $parent): string {\n    $ctx = $parent->copy();\n    $out = '';\n${phpNodes(template.body, 1, scenario).join('\n')}\n    return $out;\n}`);
    phpDispatch[scenario].push(`            ${phpQuote(name)} => generated_${safe}($root, $define, $parent),`);
  }
}
const phpDispatchText = Object.entries(phpDispatch).map(([scenario, cases]) => `        ${phpQuote(scenario)} => match ($name) {\n${cases.join('\n')}\n            default => throw new RuntimeException('generated template is missing: ' . $name),\n        },`).join('\n');
const phpDirect = `<?php\n\ndeclare(strict_types=1);\n\nuse Polyspec\\Template\\Value\\MapValue;\nuse Polyspec\\Template\\Value\\Json;\nuse Polyspec\\Template\\TemplateError;\n\nfunction generated_lookup(MapValue $ctx, MapValue $root, string $name): mixed { return $ctx->has($name) ? $ctx->get($name) : $root->get($name); }\nfunction generated_member(mixed $value, string $key): mixed { return $value instanceof MapValue ? $value->get($key) : null; }\nfunction generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0; }\nfunction generated_escape(mixed $value): string { if ($value instanceof MapValue || is_array($value)) throw new RuntimeException('a collection cannot be converted to text'); return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }\nfunction generated_call(string $name, array $args): mixed { if ($name === 'default') return generated_truthy($args[0] ?? null) ? ($args[0] ?? null) : ($args[1] ?? null); return null; }\nfunction generated_block(string $id, string $path, string $scenario, MapValue $root, MapValue $define, MapValue $scope): string { $entry = $define->get($id); if (!$entry instanceof DefineEntry) return ''; if ($entry->html !== null) return $entry->html; $context = $root->copy(); if ($entry->data !== null) foreach ($entry->data->entries() as $key => $value) $context->set($key, $value); foreach ($scope->entries() as $key => $value) $context->set($key, $value); return generated_template($entry->template ?? $path, $scenario, $root, $define, $context); }\nfunction generated_template(string $name, string $scenario, MapValue $root, MapValue $define, MapValue $parent): string { return match ($scenario) {\n${phpDispatchText}\n        default => throw new RuntimeException('generated scenario is missing: ' . $scenario),\n    }; }\nfunction generatedDirectRender(string $rootPath, RenderRequest $request): string { $entry = $request->define->get($request->target); $name = $request->target; if ($entry instanceof DefineEntry && $entry->template !== null) $name = $entry->template; return generated_template($name, basename($rootPath), $request->assign, $request->define, new MapValue()); }\n\n${phpFunctions.join('\n\n')}\n`;
mkdirSync(outputRoot, { recursive: true });
for (const [name, content, relativePath] of [['native_direct.ts', ts, 'native_direct.ts'], ['native_direct.mjs', js, 'native_direct.mjs'], ['native_direct.go', goDirect, '../go/native_direct.go'], ['native_direct.rs', rustDirect, '../rust/src/native_direct.rs'], ['native_direct.php', phpDirect, 'native_direct.php']]) {
  const path = join(outputRoot, relativePath);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`[direct] generated file is stale: ${name}`);
  } else writeFileSync(path, content);
}
process.stdout.write(`[direct] ${check ? 'checked' : 'generated'} ${Object.keys(functions).length} direct template functions\n`);
