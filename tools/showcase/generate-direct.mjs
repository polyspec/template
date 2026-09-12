#!/usr/bin/env node
// Lowers showcase AST nodes into host-language render functions.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

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
    case 'Ternary': return `truthy(${expr(node.test)}) ? ${expr(node.then ?? node.test)} : ${expr(node.else)}`;
    case 'List': return `[${node.items.map(item => item.type === 'Spread' ? `...asList(${expr(item.expr)})` : expr(item)).join(', ')}]`;
    case 'Map': return `mapValue([${node.entries.map(item => item.type === 'Spread' ? `{ spread: ${expr(item.expr)} }` : `{ key: ${expr(item.key)}, value: ${expr(item.value)} }`).join(', ')}])`;
    default: throw new Error(`unsupported generated expression node: ${node.type}`);
  }
};

function resolveTemplate(from, path) {
  const target = path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path);
  return posix.normalize(target);
}

function nodes(body, level = 1, scenario = "", template = "") {
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
          lines.push(...nodes(branch.body, level + 1, scenario, template));
        });
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...nodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      }
      case 'For': {
        lines.push(`${pad}{ const loopEntries = entries(${expr(node.iter)});`);
        lines.push(`${pad}for (let loopIndex = 0; loopIndex < loopEntries.length; loopIndex += 1) {`);
        lines.push(`${pad}  const [loopKey, loopValue] = loopEntries[loopIndex];`);
        lines.push(`${pad}  const previous = ctx;`);
        lines.push(`${pad}  ctx = new Map(ctx);`);
        lines.push(`${pad}  ctx.set(${q(node.name)}, loopValue);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.key_`)}, loopKey);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.value_`)}, loopValue);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.index_`)}, loopIndex);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.size_`)}, loopEntries.length);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.first_`)}, loopIndex === 0);`);
        lines.push(`${pad}  ctx.set(${q(`${node.name}.last_`)}, loopIndex + 1 === loopEntries.length);`);
        lines.push(...nodes(node.body, level + 1, scenario, template));
        lines.push(`${pad}  ctx = previous;`);
        lines.push(`${pad}}`);
        if (node.empty) { lines.push(`${pad}if (loopEntries.length === 0) {`); lines.push(...nodes(node.empty, level + 1, scenario, template)); lines.push(`${pad}}`); }
        lines.push(`${pad}}`);
        break;
      }
      case 'Block':
        lines.push(`${pad}const blockScope = new Map();`);
        for (const item of node.scope ?? []) lines.push(`${pad}blockScope.set(${q(item.name)}, ${expr(item.expr)});`);
        lines.push(`${pad}out += renderBlock(${q(node.id)}, ${q(node.path)}, scenario, root, define, env, blockScope);`);
        break;
      case 'IfBlock':
        lines.push(`${pad}if (define.has(${q(node.id)})) {`);
        lines.push(...nodes(node.body, level + 1, scenario, template));
        if (node.else) {
          lines.push(`${pad}} else {`);
          lines.push(...nodes(node.else, level + 1, scenario, template));
        }
        lines.push(`${pad}}`);
        break;
      case 'Include': lines.push(`${pad}out += renderTemplate(${q(resolveTemplate(template, node.path))}, root, define, env, ctx, scenario);`); break;
      default: throw new Error(`unsupported generated node: ${node.type}`);
    }
  }
  return lines;
}

const functions = {};
const scenarioDispatch = {};
const collectionHelpers = `function asList(value) { if (!Array.isArray(value)) throw new Error('generated list spread requires a list'); return value; }\nfunction mapValue(items) { const result = new Map(); for (const item of items) { if ('spread' in item) { if (!(item.spread instanceof Map)) throw new Error('generated map spread requires a map'); for (const [key, value] of item.spread) result.set(key, value); } else result.set(item.key, item.value); } return result; }\n`;
for (const [scenario, templates] of Object.entries(all)) {
  scenarioDispatch[scenario] = [];
  for (const [name, template] of Object.entries(templates)) {
    const id = `${scenario}__${name}`;
    const safe = id.replace(/[^A-Za-z0-9_]/g, '_');
    functions[id] = `function render_${safe}(root, define, env, parent, scenario) {\n  let ctx = new Map(parent ?? root);\n  let out = '';\n${nodes(template.body, 1, scenario, name).join('\n')}\n  return out;\n}`;
    scenarioDispatch[scenario].push(`      case ${q(name)}: return render_${safe}(root, define, env, parent, scenario);`);
  }
}
const dispatch = Object.entries(scenarioDispatch).map(([scenario, cases]) => `    case ${q(scenario)}:\n      switch (name) {\n${cases.join('\n')}\n        default: throw new Error('generated template is missing: ' + name);\n      }`).join('\n');
const common = `// Generated by tools/showcase/generate-direct.mjs. Do not edit.\nfunction lookup(ctx, root, name) {\n  if (ctx.has(name)) return ctx.get(name);\n  return root.get(name);\n}\nfunction member(value, key) {\n  if (value instanceof Map) return value.get(key);\n  if (value !== null && typeof value === 'object') return value[key];\n  return undefined;\n}\nfunction truthy(value) { if (value === null || value === undefined || value === false || value === '' || value === 0) return false; if (Array.isArray(value)) return value.length !== 0; if (value instanceof Map) return value.size !== 0; return true; }\nfunction escapeValue(value) {\n  if (value instanceof Map || Array.isArray(value)) throw new Error('generated renderer cannot stringify a collection');\n  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');\n}\nfunction entries(value) {\n  if (value instanceof Map) return [...value.entries()];\n  if (Array.isArray(value)) return value.map((item, index) => [index, item]);\n  if (value === null || value === undefined) return [];\n  throw new Error('generated renderer expected an iterable');\n}\nfunction call(name, args) {\n  if (name === 'default') return truthy(args[0]) ? args[0] : args[1];\n  throw new Error('unknown generated function: ' + name);\n}\nfunction unary(op, value) { return op === '!' ? !truthy(value) : -value; }\nfunction binary(op, left, right) {\n  if (op === '&&') return truthy(left) && truthy(right);\n  if (op === '||') return truthy(left) || truthy(right);\n  if (op === '??') return left ?? right;\n  if (op === '+') return typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : left + right;\n  return ({'==': left == right, '!=': left != right, '===': left === right, '!==': left !== right, '<': left < right, '>': left > right, '<=': left <= right, '>=': left >= right})[op];\n}\nfunction renderBlock(id, path, scenario, root, define, env, scope) {\n  const entry = define.get(id);\n  if (!entry) return '';\n  if (entry.html !== undefined) return entry.html;\n  const target = entry.template ?? path;\n  const data = entry.data instanceof Map ? entry.data : new Map();\n  const context = new Map(root);\n  for (const [key, value] of data) context.set(key, value);\n  for (const [key, value] of scope) context.set(key, value);\n  return renderTemplate(target, root, define, env, context, scenario);\n}\nfunction renderTemplate(name, root, define, env, parent, scenario) {\n  switch (scenario) {\n${dispatch}\n    default: throw new Error('generated scenario is missing: ' + scenario);\n  }\n}\nexport function renderGenerated(scenarioRoot, target, root, define, env) {\n  const entry = define.get(target);\n  const name = typeof entry === 'string' ? entry : entry?.template ?? target;\n  const scenario = scenarioRoot.split('/').pop();\n  return renderTemplate(name, root, define, env, root, scenario);\n}\nexport class GeneratedProgram {\n  constructor(scenarioRoot) { this.scenarioRoot = scenarioRoot; }\n  prepare(target, assign, options = {}) {\n    if (!(assign instanceof Map)) throw new Error('generated assign must be a map');\n    const define = options.define instanceof Map ? options.define : new Map(Object.entries(options.define ?? {}));\n    const env = { timezone: options.env?.timezone ?? 'Z', now: options.env?.now ?? Math.floor(Date.now() / 1000) };\n    return { render: () => renderGenerated(this.scenarioRoot, target, assign, define, env) };\n  }\n  render(target, assign, options = {}) { return this.prepare(target, assign, options).render(); }\n}\n`;
const ts = `// @ts-nocheck\n${collectionHelpers}${common}\n${Object.values(functions).join('\n\n')}\n`;
const js = `${collectionHelpers}${common}\n${Object.values(functions).join('\n\n')}\n`;
const goExpr = node => {
  switch (node.type) {
    case 'Literal':
      if (node.value === null) return 'nil';
      if (typeof node.value === 'string') return q(node.value);
      if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
      return `float64(${node.value})`;
    case 'Var': return `generatedLookup(ctx, root, ${q(node.name)})`;
    case 'LoopMeta': return `generatedLookup(ctx, root, ${q(`${node.loop}.${node.field}`)})`;
    case 'Member': return `generatedMember(${goExpr(node.object)}, ${q(node.key)})`;
    case 'Index': return `generatedIndex(${goExpr(node.object)}, ${goExpr(node.index)})`;
    case 'Call': return `generatedCall(${q(node.name)}, []value.Value{${node.args.map(goExpr).join(', ')}})`;
    case 'Binary': return `generatedBinaryFull(${q(node.op)}, ${goExpr(node.left)}, ${goExpr(node.right)})`;
    case 'Unary': return `generatedUnaryFull(${q(node.op)}, ${goExpr(node.operand)})`;
    case 'Ternary': return `generatedTernary(${goExpr(node.test)}, ${goExpr(node.then ?? node.test)}, ${goExpr(node.else)})`;
    case 'List': return `generatedList([]generatedCollectionItem{${node.items.map(item => `{Value: ${goExpr(item.expr ?? item)}${item.type === 'Spread' ? ', Spread: true' : ''}}`).join(', ')}})`;
    case 'Map': return `generatedMap([]generatedCollectionItem{${node.entries.map(item => item.type === 'Spread' ? `{Value: ${goExpr(item.expr)}, Spread: true}` : `{Key: ${goExpr(item.key)}, Value: ${goExpr(item.value)}}`).join(', ')}})`;
    default: throw new Error(`unsupported direct Go expression node: ${node.type}`);
  }
};
const goNodes = (body, level = 1, scenario = '', template = '') => {
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
          lines.push(...goNodes(branch.body, level + 1, scenario, template));
        });
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...goNodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      case 'Block':
        lines.push(`${pad}blockScope := map[string]value.Value{}`);
        for (const item of node.scope ?? []) lines.push(`${pad}blockScope[${q(item.name)}] = ${goExpr(item.expr)}`);
        lines.push(`${pad}blockHTML, err := generatedBlock(${q(node.id)}, ${node.path === null ? '""' : q(node.path)}, ${q(scenario)}, root, define, blockScope)`);
        lines.push(`${pad}if err != nil { return "", err }`);
        lines.push(`${pad}out.WriteString(blockHTML)`); break;
      case 'IfBlock':
        lines.push(`${pad}if _, ok := define.Get(${q(node.id)}); ok {`);
        lines.push(...goNodes(node.body, level + 1, scenario, template));
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...goNodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      case 'For':
        lines.push(`${pad}{`);
        lines.push(`${pad}\tloopEntries, err := generatedEntries(${goExpr(node.iter)})`);
        lines.push(`${pad}\tif err != nil { return "", err }`);
        lines.push(`${pad}\tfor loopIndex, loopEntry := range loopEntries {`);
        lines.push(`${pad}\t\tprevious := ctx`);
        lines.push(`${pad}\t\tctx = generatedCloneContext(ctx)`);
        lines.push(`${pad}\t\tctx[${q(node.name)}] = loopEntry.Value`);
        lines.push(`${pad}\t\tctx[${q(`${node.name}.key_`)}] = loopEntry.Key`);
        lines.push(`${pad}\t\tctx[${q(`${node.name}.value_`)}] = loopEntry.Value`);
        lines.push(`${pad}\t\tctx[${q(`${node.name}.index_`)}] = float64(loopIndex)`);
        lines.push(`${pad}\t\tctx[${q(`${node.name}.size_`)}] = float64(len(loopEntries))`);
        lines.push(`${pad}\t\tctx[${q(`${node.name}.first_`)}] = loopIndex == 0`);
        lines.push(`${pad}\t\tctx[${q(`${node.name}.last_`)}] = loopIndex+1 == len(loopEntries)`);
        lines.push(...goNodes(node.body, level + 2, scenario, template));
        lines.push(`${pad}\t\tctx = previous`);
        lines.push(`${pad}\t}`);
        if (node.empty) { lines.push(`${pad}\tif len(loopEntries) == 0 {`); lines.push(...goNodes(node.empty, level + 2, scenario, template)); lines.push(`${pad}\t}`); }
        lines.push(`${pad}}`); break;
      case 'Include':
        lines.push(`${pad}included, err := generatedTemplate(${q(resolveTemplate(template, node.path))}, ${q(scenario)}, root, define, ctx)`);
        lines.push(`${pad}if err != nil { return "", err }`);
        lines.push(`${pad}out.WriteString(included)`); break;
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
    goFunctions.push(`func generated_${safe}(root *value.OrderedMap, define DefineRegistry, parent map[string]value.Value) (string, error) {\n\tctx := map[string]value.Value{}\n\tfor key, item := range parent { ctx[key] = item }\n\tvar out strings.Builder\n${goNodes(template.body, 1, scenario, name).join('\n')}\n\treturn out.String(), nil\n}`);
    goDispatch[scenario].push(`\t\tcase ${q(name)}: return generated_${safe}(root, define, parent)`);
  }
}
goFunctions.unshift(`type generatedCollectionItem struct { Key value.Value; Value value.Value; Spread bool }
type generatedEntry struct { Key value.Value; Value value.Value }
func generatedCloneContext(source map[string]value.Value) map[string]value.Value { result := map[string]value.Value{}; for key, item := range source { result[key] = item }; return result }
func generatedIndex(item, key value.Value) value.Value { if list, ok := item.(value.List); ok { index, ok := key.(float64); if ok && index >= 0 && int(index) < len(list) { return list[int(index)] }; return nil }; text, err := value.Stringify(key); if err != nil { return nil }; return generatedMember(item, text) }
func generatedEntries(item value.Value) ([]generatedEntry, error) { result := []generatedEntry{}; if list, ok := item.(value.List); ok { for index, entry := range list { result = append(result, generatedEntry{float64(index), entry}) }; return result, nil }; if object, ok := item.(*value.OrderedMap); ok { for _, key := range object.Keys() { entry, _ := object.Get(key); result = append(result, generatedEntry{key, entry}) }; return result, nil }; if item == nil { return result, nil }; return nil, fmt.Errorf("generated renderer expected an iterable") }
func generatedList(items []generatedCollectionItem) value.List { result := value.List{}; for _, item := range items { if item.Spread { if list, ok := item.Value.(value.List); ok { result = append(result, list...); continue }; panic("generated list spread requires a list") }; result = append(result, item.Value) }; return result }
func generatedMap(items []generatedCollectionItem) *value.OrderedMap { result := value.NewOrderedMap(); for _, item := range items { if item.Spread { object, ok := item.Value.(*value.OrderedMap); if !ok { panic("generated map spread requires a map") }; for _, key := range object.Keys() { entry, _ := object.Get(key); result.Set(key, entry) }; continue }; key, err := value.Stringify(item.Key); if err != nil { panic(err) }; result.Set(key, item.Value) }; return result }
func generatedTernary(test, thenValue, elseValue value.Value) value.Value { if generatedTruthy(test) { return thenValue }; return elseValue }
func generatedUnaryFull(op string, item value.Value) value.Value { if op == "!" { return !generatedTruthy(item) }; if number, ok := item.(float64); ok { return -number }; panic("generated unary operator requires a number") }
func generatedBinaryFull(op string, left, right value.Value) value.Value { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==": return value.LooseEquals(left, right); case "!=": return !value.LooseEquals(left, right); case "===": return value.StrictEquals(left, right); case "!==": return !value.StrictEquals(left, right); case "<", ">", "<=", ">=": order, ok := value.Compare(left, right); if !ok { panic("generated values have no order") }; if op == "<" { return order < 0 }; if op == ">" { return order > 0 }; if op == "<=" { return order <= 0 }; return order >= 0; case "+": if value.IsString(left) || value.IsString(right) { a, _ := value.Stringify(left); b, _ := value.Stringify(right); return a+b }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "in": if list, ok := right.(value.List); ok { for _, item := range list { if value.LooseEquals(left, item) { return true } }; return false }; if object, ok := right.(*value.OrderedMap); ok { key, _ := value.Stringify(left); return object.Has(key) }; if text, ok := value.TextOf(right); ok { needle, _ := value.Stringify(left); return strings.Contains(text, needle) } }; panic("unknown generated binary operator: "+op) }`);
const goDispatchText = Object.entries(goDispatch).map(([scenario, cases]) => `\tcase ${q(scenario)}:\n\t\tswitch name {\n${cases.join('\n')}\n\t\tdefault: return "", fmt.Errorf("generated template is missing: %s", name)\n\t\t}`).join('\n');
const goDirect = `// Generated by tools/showcase/generate-direct.mjs. Do not edit.\npackage main\n\nimport (\n\t"fmt"\n\t"path/filepath"\n\t"strings"\n\t"time"\n\n\ttemplate "github.com/polyspec/template"\n\t"github.com/polyspec/template/functions"\n\t"github.com/polyspec/template/value"\n)\n\nfunc generatedLookup(ctx map[string]value.Value, root *value.OrderedMap, name string) value.Value {\n\tif item, ok := ctx[name]; ok { return item }\n\titem, _ := root.Get(name)\n\treturn item\n}\nfunc generatedMember(item value.Value, key string) value.Value {\n\tif object, ok := item.(*value.OrderedMap); ok { value, _ := object.Get(key); return value }\n\treturn nil\n}\nfunc generatedTruthy(item value.Value) bool { return value.IsTruthy(item) }\nfunc generatedEcho(out *strings.Builder, item value.Value) error {\n\ttext, err := value.Stringify(item); if err != nil { return err }; out.WriteString(functions.EscapeHTML(text)); return nil\n}\nfunc generatedDefault(args []value.Value) value.Value { if len(args) > 1 && value.IsTruthy(args[0]) { return args[0] }; if len(args) > 1 { return args[1] }; return nil }\nfunc generatedCall(name string, args []value.Value) value.Value { if name == "default" { return generatedDefault(args) }; return nil }\nfunc generatedUnary(op string, item value.Value) value.Value { if op == "!" { return !value.IsTruthy(item) }; return nil }\nfunc generatedBinary(op string, left, right value.Value) value.Value { if op == "&&" { return value.IsTruthy(left) && value.IsTruthy(right) }; if op == "||" { return value.IsTruthy(left) || value.IsTruthy(right) }; return nil }\nfunc generatedBlock(id, path, scenario string, root *value.OrderedMap, define DefineRegistry, scope map[string]value.Value) (string, error) {\n\tentry, ok := define.Get(id); if !ok { return "", nil }; typed, ok := entry.(DefineEntry); if !ok { return "", fmt.Errorf("generated define %s has invalid type", id) }; if typed.HTML != nil { return *typed.HTML, nil }; target := path; if typed.Template != nil { target = *typed.Template }; context := map[string]value.Value{}; for _, key := range root.Keys() { item, _ := root.Get(key); context[key] = item }; if typed.Data != nil { for _, key := range typed.Data.Keys() { item, _ := typed.Data.Get(key); context[key] = item } }; for key, item := range scope { context[key] = item }; return generatedTemplate(target, scenario, root, define, context)\n}\nfunc generatedTemplate(name, scenario string, root *value.OrderedMap, define DefineRegistry, parent map[string]value.Value) (string, error) {\n\tswitch scenario {\n${goDispatchText}\n\tdefault: return "", fmt.Errorf("generated scenario is missing: %s", filepath.Base(scenario))\n\t}\n}\nfunc generatedDirectRender(rootPath string, request RenderRequest) (string, error) {\n\tentry, ok := request.Define.Get(request.Target); name := request.Target; if ok { if path, isPath := entry.(string); isPath { name = path } else if typed, isTyped := entry.(DefineEntry); isTyped && typed.Template != nil { name = *typed.Template } }; return generatedTemplate(name, filepath.Base(rootPath), request.Assign, request.Define, map[string]value.Value{})\n}\n\ntype GeneratedProgram struct { Root string }\ntype generatedPrepared struct { Program *GeneratedProgram; Request RenderRequest }\nfunc (p *generatedPrepared) Render() (string, error) { return generatedDirectRender(p.Program.Root, p.Request) }\nfunc (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) {\n\tname, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }\n\troot, err := value.BindMap(assign); if err != nil { return nil, err }\n\tdefinitions := value.NewOrderedMap()\n\tfor id, input := range options.Define { if input.HTML != nil { definitions.Set(id, DefineEntry{HTML: input.HTML}); continue }; templateName := input.Template; var data *value.OrderedMap; if input.Data != nil { data, err = value.BindMap(input.Data); if err != nil { return nil, err } }; definitions.Set(id, DefineEntry{Template: &templateName, Data: data}) }\n\ttimezone := "Z"; now := float64(time.Now().Unix()); if options.Env != nil { if options.Env.Timezone != "" { timezone = options.Env.Timezone }; now = options.Env.Now }\n\treturn &generatedPrepared{Program: p, Request: RenderRequest{Target: name, Assign: root, Define: definitions, Env: &Environment{Timezone: &timezone, Now: &now}}}, nil\n}\nfunc (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }\n\n${goFunctions.join('\n\n')}\n`;
const rustExpr = node => {
  switch (node.type) {
    case 'Literal': return node.value === null ? 'Value::Null' : typeof node.value === 'string' ? `Value::String(${q(node.value)}.to_string())` : `serde_json::json!(${q(node.value)})`;
    case 'Var': return `generated_lookup(&ctx, root, ${q(node.name)})`;
    case 'LoopMeta': return `generated_lookup(&ctx, root, ${q(`${node.loop}.${node.field}`)})`;
    case 'Member': return `generated_member(${rustExpr(node.object)}, ${q(node.key)})`;
    case 'Index': return `generated_index(${rustExpr(node.object)}, ${rustExpr(node.index)})`;
    case 'Call': return `generated_call(${q(node.name)}, vec![${node.args.map(rustExpr).join(', ')}])`;
    case 'Unary': return `generated_unary_full(${q(node.op)}, ${rustExpr(node.operand)})`;
    case 'Binary': return `generated_binary_full(${q(node.op)}, ${rustExpr(node.left)}, ${rustExpr(node.right)})`;
    case 'Ternary': return `generated_ternary(${rustExpr(node.test)}, ${rustExpr(node.then ?? node.test)}, ${rustExpr(node.else)})`;
    case 'List': return `generated_list(vec![${node.items.map(item => `GeneratedCollectionItem { key: Value::Null, value: ${rustExpr(item.expr ?? item)}, spread: ${item.type === 'Spread'} }`).join(', ')}])`;
    case 'Map': return `generated_map(vec![${node.entries.map(item => item.type === 'Spread' ? `GeneratedCollectionItem { key: Value::Null, value: ${rustExpr(item.expr)}, spread: true }` : `GeneratedCollectionItem { key: ${rustExpr(item.key)}, value: ${rustExpr(item.value)}, spread: false }`).join(', ')}])`;
    default: throw new Error(`unsupported direct Rust expression node: ${node.type}`);
  }
};
const rustNodes = (body, level = 1, scenario = '', template = '') => {
  const pad = '    '.repeat(level);
  const lines = [];
  for (const node of body) {
    switch (node.type) {
      case 'Text': lines.push(`${pad}out.push_str(${q(node.value)});`); break;
      case 'Echo': lines.push(`${pad}generated_echo_full(&mut out, ${rustExpr(node.expr)})?;`); break;
      case 'Set': lines.push(`${pad}ctx.insert(${q(node.name)}.to_string(), ${rustExpr(node.expr)});`); break;
      case 'If':
        node.branches.forEach((branch, index) => {
          lines.push(`${pad}${index === 0 ? 'if' : '} else if'} generated_truthy(&${rustExpr(branch.test)}) {`);
          lines.push(...rustNodes(branch.body, level + 1, scenario, template));
        });
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...rustNodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      case 'Block':
        lines.push(`${pad}let mut block_scope = Map::new();`);
        for (const item of node.scope ?? []) lines.push(`${pad}block_scope.insert(${q(item.name)}.to_string(), ${rustExpr(item.expr)});`);
        lines.push(`${pad}out.push_str(&generated_block(${q(node.id)}, ${q(node.path ?? '')}, ${q(scenario)}, root, define, &block_scope)?);`); break;
      case 'IfBlock':
        lines.push(`${pad}if define.contains_key(${q(node.id)}) {`);
        lines.push(...rustNodes(node.body, level + 1, scenario, template));
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...rustNodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      case 'For':
        lines.push(`${pad}{`);
        lines.push(`${pad}    let loop_entries = generated_entries(${rustExpr(node.iter)})?;`);
        lines.push(`${pad}    for (loop_index, (loop_key, loop_value)) in loop_entries.iter().enumerate() {`);
        lines.push(`${pad}        let previous = ctx.clone();`);
        lines.push(`${pad}        ctx.insert(${q(node.name)}.to_string(), loop_value.clone());`);
        lines.push(`${pad}        ctx.insert(${q(`${node.name}.key_`)}.to_string(), loop_key.clone());`);
        lines.push(`${pad}        ctx.insert(${q(`${node.name}.value_`)}.to_string(), loop_value.clone());`);
        lines.push(`${pad}        ctx.insert(${q(`${node.name}.index_`)}.to_string(), serde_json::json!(loop_index));`);
        lines.push(`${pad}        ctx.insert(${q(`${node.name}.size_`)}.to_string(), serde_json::json!(loop_entries.len()));`);
        lines.push(`${pad}        ctx.insert(${q(`${node.name}.first_`)}.to_string(), Value::Bool(loop_index == 0));`);
        lines.push(`${pad}        ctx.insert(${q(`${node.name}.last_`)}.to_string(), Value::Bool(loop_index + 1 == loop_entries.len()));`);
        lines.push(...rustNodes(node.body, level + 2, scenario, template));
        lines.push(`${pad}        ctx = previous;`);
        lines.push(`${pad}    }`);
        if (node.empty) { lines.push(`${pad}    if loop_entries.is_empty() {`); lines.push(...rustNodes(node.empty, level + 2, scenario, template)); lines.push(`${pad}    }`); }
        lines.push(`${pad}}`); break;
      case 'Include': lines.push(`${pad}out.push_str(&generated_template(${q(resolveTemplate(template, node.path))}, ${q(scenario)}, root, define, &ctx)?);`); break;
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
    rustFunctions.push(`fn generated_${safe}(root: &Map<String, Value>, define: &DefineRegistry, parent: &Map<String, Value>) -> Result<String, String> {\n    let mut ctx = parent.clone();\n    let mut out = String::new();\n${rustNodes(template.body, 1, scenario, name).join('\n')}\n    Ok(out)\n}`);
    rustDispatch[scenario].push(`            "${name}" => generated_${safe}(root, define, parent),`);
  }
}
rustFunctions.unshift(`struct GeneratedCollectionItem { key: Value, value: Value, spread: bool }
fn generated_echo_full(out: &mut String, value: Value) -> Result<(), String> { let text = match value { Value::Number(number) if number.as_f64().is_some_and(|number| number.fract() == 0.0) => format!("{:.0}", number.as_f64().unwrap()), other => generated_string(other)? }; out.push_str(&text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('\\"', "&quot;").replace("'", "&#39;")); Ok(()) }
fn generated_index(item: Value, key: Value) -> Value { match item { Value::Array(items) => key.as_u64().and_then(|index| items.get(index as usize)).cloned().unwrap_or(Value::Null), Value::Object(items) => generated_string(key).ok().and_then(|key| items.get(&key).cloned()).unwrap_or(Value::Null), _ => Value::Null } }
fn generated_entries(item: Value) -> Result<Vec<(Value, Value)>, String> { match item { Value::Null => Ok(vec![]), Value::Array(items) => Ok(items.into_iter().enumerate().map(|(index, value)| (serde_json::json!(index), value)).collect()), Value::Object(items) => Ok(items.into_iter().map(|(key, value)| (Value::String(key), value)).collect()), _ => Err("generated renderer expected an iterable".to_string()) } }
fn generated_list(items: Vec<GeneratedCollectionItem>) -> Value { let mut result = vec![]; for item in items { if item.spread { if let Value::Array(values) = item.value { result.extend(values); } else { panic!("generated list spread requires a list") } } else { result.push(item.value) } } Value::Array(result) }
fn generated_map(items: Vec<GeneratedCollectionItem>) -> Value { let mut result = Map::new(); for item in items { if item.spread { if let Value::Object(values) = item.value { result.extend(values); } else { panic!("generated map spread requires a map") } } else { let key = generated_string(item.key).expect("generated map key must stringify"); result.insert(key, item.value); } } Value::Object(result) }
fn generated_ternary(test: Value, then_value: Value, else_value: Value) -> Value { if generated_truthy(&test) { then_value } else { else_value } }
fn generated_unary_full(op: &str, item: Value) -> Value { if op == "!" { return Value::Bool(!generated_truthy(&item)); } if let Some(number) = item.as_f64() { return serde_json::json!(-number); } panic!("generated unary operator requires a number") }
fn generated_binary_full(op: &str, left: Value, right: Value) -> Value { match op { "&&" => Value::Bool(generated_truthy(&left) && generated_truthy(&right)), "||" => Value::Bool(generated_truthy(&left) || generated_truthy(&right)), "??" => if left.is_null() { right } else { left }, "==" | "===" => Value::Bool(left == right), "!=" | "!==" => Value::Bool(left != right), "+" => { if left.is_string() || right.is_string() { Value::String(format!("{}{}", generated_string(left).unwrap(), generated_string(right).unwrap())) } else { serde_json::json!(left.as_f64().unwrap() + right.as_f64().unwrap()) } }, "-" => serde_json::json!(left.as_f64().unwrap() - right.as_f64().unwrap()), "*" => serde_json::json!(left.as_f64().unwrap() * right.as_f64().unwrap()), "/" => serde_json::json!(left.as_f64().unwrap() / right.as_f64().unwrap()), "%" => serde_json::json!(left.as_i64().unwrap() % right.as_i64().unwrap()), "<" | ">" | "<=" | ">=" => { let order = if let (Some(a), Some(b)) = (left.as_f64(), right.as_f64()) { a.partial_cmp(&b) } else if let (Some(a), Some(b)) = (left.as_str(), right.as_str()) { Some(a.cmp(b)) } else { None }; let order = order.expect("generated values have no order"); Value::Bool(match op { "<" => order.is_lt(), ">" => order.is_gt(), "<=" => !order.is_gt(), _ => !order.is_lt() }) }, "in" => Value::Bool(match right { Value::Array(items) => items.contains(&left), Value::Object(items) => generated_string(left).ok().is_some_and(|key| items.contains_key(&key)), Value::String(text) => generated_string(left).ok().is_some_and(|needle| text.contains(&needle)), _ => false }), _ => panic!("unknown generated binary operator: {op}") } }`);
const rustDispatchText = Object.entries(rustDispatch).map(([scenario, cases]) => `        "${scenario}" => match name {\n${cases.join('\n')}\n            _ => Err(format!("generated template is missing: {name}")),\n        },`).join('\n');
const rustDirect = `// Generated by tools/showcase/generate-direct.mjs. Do not edit.\nuse crate::render_adapter::{DefineEntry, DefineRegistry, Environment, RenderRequest};\nuse polyspec_template::{ErrorCode, PreparedRender, Program, RenderOptions, RenderTarget, TemplateError};\nuse serde_json::{Map, Value};\nuse std::path::{Path, PathBuf};\n\nfn generated_lookup(ctx: &Map<String, Value>, root: &Map<String, Value>, name: &str) -> Value { ctx.get(name).cloned().or_else(|| root.get(name).cloned()).unwrap_or(Value::Null) }\nfn generated_member(value: Value, key: &str) -> Value { value.as_object().and_then(|map| map.get(key)).cloned().unwrap_or(Value::Null) }\nfn generated_truthy(value: &Value) -> bool { match value { Value::Null => false, Value::Bool(value) => *value, Value::Number(value) => value.as_f64().unwrap_or(0.0) != 0.0, Value::String(value) => !value.is_empty(), Value::Array(value) => !value.is_empty(), Value::Object(value) => !value.is_empty() } }\nfn generated_string(value: Value) -> Result<String, String> { match value { Value::Null => Ok(String::new()), Value::Bool(value) => Ok(value.to_string()), Value::Number(value) => Ok(value.to_string()), Value::String(value) => Ok(value), Value::Array(_) | Value::Object(_) => Err("a collection cannot be converted to text".to_string()) } }\nfn generated_escape(value: Value) -> Result<String, String> { Ok(generated_string(value)?.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('\\"', "&quot;").replace("'", "&#39;")) }\nfn generated_echo(out: &mut String, value: Value) -> Result<(), String> { out.push_str(&generated_escape(value)?); Ok(()) }\nfn generated_call(name: &str, args: Vec<Value>) -> Value { if name == "default" && args.len() > 1 { if generated_truthy(&args[0]) { args[0].clone() } else { args[1].clone() } } else { Value::Null } }\nfn generated_block(id: &str, path: &str, scenario: &str, root: &Map<String, Value>, define: &DefineRegistry, scope: &Map<String, Value>) -> Result<String, String> {\n    let Some(entry) = define.get(id) else { return Ok(String::new()) };\n    if let Some(html) = &entry.html { return Ok(html.clone()) }\n    let target = entry.template.as_deref().unwrap_or(path);\n    let mut context = root.clone();\n    if let Some(data) = &entry.data { context.extend(data.clone()) }\n    context.extend(scope.clone());\n    generated_template(target, scenario, root, define, &context)\n}\nfn generated_template(name: &str, scenario: &str, root: &Map<String, Value>, define: &DefineRegistry, parent: &Map<String, Value>) -> Result<String, String> {\n    match scenario {\n${rustDispatchText}\n        _ => Err(format!("generated scenario is missing: {}", Path::new(scenario).file_name().and_then(|v| v.to_str()).unwrap_or(scenario))),\n    }\n}\npub fn generated_direct_render(root_path: &Path, request: &RenderRequest) -> Result<String, String> {\n    let name = request.define.get(&request.target).and_then(|entry| entry.template.clone()).unwrap_or_else(|| request.target.clone());\n    generated_template(&name, root_path.file_name().and_then(|v| v.to_str()).unwrap_or_default(), &request.assign, &request.define, &Map::new())\n}\n\npub struct GeneratedProgram { pub root: PathBuf }\nimpl Program for GeneratedProgram {\n    fn prepare(&self, target: RenderTarget<'_>, assign: &Value, options: &RenderOptions) -> Result<PreparedRender<'static>, TemplateError> {\n        let RenderTarget::Name(name) = target else { return Err(TemplateError::without_position(ErrorCode::E_RUNTIME_TYPE, "generated", "generated target must be a template name")); };\n        let assign = assign.as_object().cloned().ok_or_else(|| TemplateError::without_position(ErrorCode::E_DATA_UNSUPPORTED_TYPE, name, "assign is not a map"))?;\n        let define = options.define.iter().map(|(id, entry)| (id.clone(), DefineEntry { template: entry.template.clone(), data: entry.data.as_ref().and_then(Value::as_object).cloned(), html: entry.html.clone() })).collect();\n        let env = options.env.as_ref().map(|env| Environment { timezone: Some(env.timezone.clone()), now: Some(env.now) });\n        let root = self.root.clone(); let request = RenderRequest { target: name.to_string(), assign, define, env };\n        Ok(PreparedRender::new(move || generated_direct_render(&root, &request).map_err(|message| TemplateError::without_position(ErrorCode::E_RUNTIME_TYPE, &request.target, message))))\n    }\n    fn render(&self, target: RenderTarget<'_>, assign: &Value, options: &RenderOptions) -> Result<String, TemplateError> { self.prepare(target, assign, options)?.render() }\n}\n\n${rustFunctions.join('\n\n')}\n`;
const phpQuote = value => "'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n') + "'";
const phpText = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('\r', '\\r').replaceAll('\n', '\\n') + '"';
const phpExpr = node => {
  switch (node.type) {
    case 'Literal': return node.value === null ? 'null' : typeof node.value === 'string' ? phpQuote(node.value) : JSON.stringify(node.value);
    case 'Var': return `generated_lookup($ctx, $root, ${phpQuote(node.name)})`;
    case 'LoopMeta': return `generated_lookup($ctx, $root, ${phpQuote(`${node.loop}.${node.field}`)})`;
    case 'Member': return `generated_member(${phpExpr(node.object)}, ${phpQuote(node.key)})`;
    case 'Index': return `generated_index(${phpExpr(node.object)}, ${phpExpr(node.index)})`;
    case 'Call': return `generated_call(${phpQuote(node.name)}, [${node.args.map(phpExpr).join(', ')}])`;
    case 'Unary': return `generated_unary_full(${phpQuote(node.op)}, ${phpExpr(node.operand)})`;
    case 'Binary': return `generated_binary_full(${phpQuote(node.op)}, ${phpExpr(node.left)}, ${phpExpr(node.right)})`;
    case 'Ternary': return `generated_ternary(${phpExpr(node.test)}, ${phpExpr(node.then ?? node.test)}, ${phpExpr(node.else)})`;
    case 'List': return `generated_list([${node.items.map(item => `['value' => ${phpExpr(item.expr ?? item)}, 'spread' => ${item.type === 'Spread'}]`).join(', ')}])`;
    case 'Map': return `generated_map([${node.entries.map(item => item.type === 'Spread' ? `['value' => ${phpExpr(item.expr)}, 'spread' => true]` : `['key' => ${phpExpr(item.key)}, 'value' => ${phpExpr(item.value)}, 'spread' => false]`).join(', ')}])`;
    default: throw new Error(`unsupported direct PHP expression node: ${node.type}`);
  }
};
const phpNodes = (body, level = 1, scenario = '', template = '') => {
  const pad = '    '.repeat(level);
  const lines = [];
  for (const node of body) {
    switch (node.type) {
      case 'Text': lines.push(`${pad}$out .= ${phpText(node.value)};`); break;
      case 'Echo': lines.push(`${pad}$out .= generated_escape_full(${phpExpr(node.expr)});`); break;
      case 'Set': lines.push(`${pad}$ctx->set(${phpQuote(node.name)}, ${phpExpr(node.expr)});`); break;
      case 'If':
        node.branches.forEach((branch, index) => {
          lines.push(`${pad}${index === 0 ? 'if' : '} elseif'} (generated_truthy(${phpExpr(branch.test)})) {`);
          lines.push(...phpNodes(branch.body, level + 1, scenario, template));
        });
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...phpNodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      case 'Block':
        lines.push(`${pad}$blockScope = new MapValue();`);
        for (const item of node.scope ?? []) lines.push(`${pad}$blockScope->set(${phpQuote(item.name)}, ${phpExpr(item.expr)});`);
        lines.push(`${pad}$out .= generated_block(${phpQuote(node.id)}, ${phpQuote(node.path ?? '')}, ${phpQuote(scenario)}, $root, $define, $blockScope);`); break;
      case 'IfBlock':
        lines.push(`${pad}if ($define->has(${phpQuote(node.id)})) {`);
        lines.push(...phpNodes(node.body, level + 1, scenario, template));
        if (node.else) { lines.push(`${pad}} else {`); lines.push(...phpNodes(node.else, level + 1, scenario, template)); }
        lines.push(`${pad}}`); break;
      case 'For':
        lines.push(`${pad}$loopEntries = generated_entries(${phpExpr(node.iter)});`);
        lines.push(`${pad}foreach ($loopEntries as $loopIndex => [$loopKey, $loopValue]) {`);
        lines.push(`${pad}    $previous = $ctx;`);
        lines.push(`${pad}    $ctx = $ctx->copy();`);
        lines.push(`${pad}    $ctx->set(${phpQuote(node.name)}, $loopValue);`);
        lines.push(`${pad}    $ctx->set(${phpQuote(`${node.name}.key_`)}, $loopKey);`);
        lines.push(`${pad}    $ctx->set(${phpQuote(`${node.name}.value_`)}, $loopValue);`);
        lines.push(`${pad}    $ctx->set(${phpQuote(`${node.name}.index_`)}, (float) $loopIndex);`);
        lines.push(`${pad}    $ctx->set(${phpQuote(`${node.name}.size_`)}, (float) count($loopEntries));`);
        lines.push(`${pad}    $ctx->set(${phpQuote(`${node.name}.first_`)}, $loopIndex === 0);`);
        lines.push(`${pad}    $ctx->set(${phpQuote(`${node.name}.last_`)}, $loopIndex + 1 === count($loopEntries));`);
        lines.push(...phpNodes(node.body, level + 1, scenario, template));
        lines.push(`${pad}    $ctx = $previous;`);
        lines.push(`${pad}}`);
        if (node.empty) { lines.push(`${pad}if (count($loopEntries) === 0) {`); lines.push(...phpNodes(node.empty, level + 1, scenario, template)); lines.push(`${pad}}`); }
        break;
      case 'Include': lines.push(`${pad}$out .= generated_template(${phpQuote(resolveTemplate(template, node.path))}, ${phpQuote(scenario)}, $root, $define, $ctx);`); break;
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
    phpFunctions.push(`function generated_${safe}(MapValue $root, MapValue $define, MapValue $parent): string {\n    $ctx = $parent->copy();\n    $out = '';\n${phpNodes(template.body, 1, scenario, name).join('\n')}\n    return $out;\n}`);
    phpDispatch[scenario].push(`            ${phpQuote(name)} => generated_${safe}($root, $define, $parent),`);
  }
}
phpFunctions.unshift(`function generated_escape_full(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; return generated_escape($value); }
function generated_index(mixed $value, mixed $key): mixed { if ($value instanceof MapValue) return $value->get((string) $key); if (is_array($value)) return $value[(int) $key] ?? null; return null; }
function generated_entries(mixed $value): array { $result = []; if ($value instanceof MapValue) { foreach ($value->entries() as $key => $item) $result[] = [$key, $item]; return $result; } if (is_array($value)) { foreach ($value as $key => $item) $result[] = [$key, $item]; return $result; } if ($value === null) return []; throw new RuntimeException('generated renderer expected an iterable'); }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { if (!is_array($item['value'])) throw new RuntimeException('generated list spread requires a list'); array_push($result, ...$item['value']); } else $result[] = $item['value']; } return $result; }
function generated_map(array $items): MapValue { $result = new MapValue(); foreach ($items as $item) { if ($item['spread']) { if (!$item['value'] instanceof MapValue) throw new RuntimeException('generated map spread requires a map'); foreach ($item['value']->entries() as $key => $value) $result->set($key, $value); } else $result->set((string) $item['key'], $item['value']); } return $result; }
function generated_ternary(mixed $test, mixed $thenValue, mixed $elseValue): mixed { return generated_truthy($test) ? $thenValue : $elseValue; }
function generated_unary_full(string $op, mixed $value): mixed { if ($op === '!') return !generated_truthy($value); if (is_float($value) || is_int($value)) return -$value; throw new RuntimeException('generated unary operator requires a number'); }
function generated_binary_full(string $op, mixed $left, mixed $right): mixed { return match ($op) { '&&' => generated_truthy($left) && generated_truthy($right), '||' => generated_truthy($left) || generated_truthy($right), '??' => $left ?? $right, '==', '===' => $left === $right, '!=', '!==' => $left !== $right, '+' => is_string($left) || is_string($right) ? (string) $left . (string) $right : $left + $right, '-' => $left - $right, '*' => $left * $right, '/' => $left / $right, '%' => $left % $right, '<' => $left < $right, '>' => $left > $right, '<=' => $left <= $right, '>=' => $left >= $right, 'in' => is_array($right) ? in_array($left, $right, true) : ($right instanceof MapValue ? $right->has((string) $left) : (is_string($right) && str_contains($right, (string) $left))), default => throw new RuntimeException('unknown generated binary operator: ' . $op), }; }`);
const phpDispatchText = Object.entries(phpDispatch).map(([scenario, cases]) => `        ${phpQuote(scenario)} => match ($name) {\n${cases.join('\n')}\n            default => throw new RuntimeException('generated template is missing: ' . $name),\n        },`).join('\n');
const phpDirect = `<?php\n\ndeclare(strict_types=1);\n\nuse Polyspec\\Template\\PreparedExecution;\nuse Polyspec\\Template\\PreparedRender;\nuse Polyspec\\Template\\Program;\nuse Polyspec\\Template\\Value\\Bind;\nuse Polyspec\\Template\\Value\\MapValue;\nuse Polyspec\\Template\\Value\\Json;\nuse Polyspec\\Template\\TemplateError;\n\nfunction generated_lookup(MapValue $ctx, MapValue $root, string $name): mixed { return $ctx->has($name) ? $ctx->get($name) : $root->get($name); }\nfunction generated_member(mixed $value, string $key): mixed { return $value instanceof MapValue ? $value->get($key) : null; }\nfunction generated_truthy(mixed $value): bool { if ($value === null || $value === false || $value === '' || $value === 0) return false; if (is_array($value)) return $value !== []; if ($value instanceof MapValue) return $value->keys() !== []; return true; }\nfunction generated_escape(mixed $value): string { if ($value instanceof MapValue || is_array($value)) throw new RuntimeException('a collection cannot be converted to text'); return str_replace('&#039;', '&#39;', htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')); }\nfunction generated_call(string $name, array $args): mixed { if ($name === 'default') return generated_truthy($args[0] ?? null) ? ($args[0] ?? null) : ($args[1] ?? null); return null; }\nfunction generated_block(string $id, string $path, string $scenario, MapValue $root, MapValue $define, MapValue $scope): string { $entry = $define->get($id); if (!$entry instanceof DefineEntry) return ''; if ($entry->html !== null) return $entry->html; $context = $root->copy(); if ($entry->data !== null) foreach ($entry->data->entries() as $key => $value) $context->set($key, $value); foreach ($scope->entries() as $key => $value) $context->set($key, $value); return generated_template($entry->template ?? $path, $scenario, $root, $define, $context); }\nfunction generated_template(string $name, string $scenario, MapValue $root, MapValue $define, MapValue $parent): string { return match ($scenario) {\n${phpDispatchText}\n        default => throw new RuntimeException('generated scenario is missing: ' . $scenario),\n    }; }\nfunction generatedDirectRender(string $rootPath, RenderRequest $request): string { $entry = $request->define->get($request->target); $name = $request->target; if ($entry instanceof DefineEntry && $entry->template !== null) $name = $entry->template; return generated_template($name, basename($rootPath), $request->assign, $request->define, new MapValue()); }\n\nfinal class GeneratedExecution implements PreparedExecution { public function __construct(private readonly string $root, private readonly RenderRequest $request) {} public function render(): string { return generatedDirectRender($this->root, $this->request); } }\nfinal class GeneratedProgram implements Program {\n    public function __construct(private readonly string $root) {}\n    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender {\n        if (!is_string($target)) throw new InvalidArgumentException('generated target must be a template name');\n        $root = $assign instanceof MapValue ? $assign : Bind::map($assign); $define = new MapValue();\n        foreach ($options['define'] ?? [] as $id => $entry) { if (is_string($entry)) { $define->set((string) $id, new DefineEntry($entry, null, null)); continue; } if (isset($entry['html'])) { $define->set((string) $id, new DefineEntry(null, null, $entry['html'])); continue; } $data = array_key_exists('data', $entry) ? Bind::map($entry['data']) : null; $define->set((string) $id, new DefineEntry($entry['template'], $data, null)); }\n        $env = $options['env'] ?? []; $request = new RenderRequest($target, $root, $define, new Environment($env['timezone'] ?? 'Z', isset($env['now']) ? (float) $env['now'] : (float) time()));\n        return new PreparedRender(new GeneratedExecution($this->root, $request));\n    }\n    public function render(string|array $target, mixed $assign = [], array $options = []): string { return $this->prepare($target, $assign, $options)->render(); }\n}\n\n${phpFunctions.join('\n\n')}\n`;
mkdirSync(outputRoot, { recursive: true });
for (const [name, content, relativePath] of [['native_direct.ts', ts, 'native_direct.ts'], ['native_direct.mjs', js, 'native_direct.mjs'], ['native_direct.go', goDirect, '../go/native_direct.go'], ['native_direct.rs', rustDirect, '../rust/src/native_direct.rs'], ['native_direct.php', phpDirect, 'native_direct.php']]) {
  const path = join(outputRoot, relativePath);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`[direct] generated file is stale: ${name}`);
  } else writeFileSync(path, content);
}
process.stdout.write(`[direct] ${check ? 'checked' : 'generated'} ${Object.keys(functions).length} direct template functions\n`);
