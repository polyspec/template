import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

const nodeKinds = new Set(['Text', 'Echo', 'If', 'For', 'Set', 'Include', 'Block', 'IfBlock']);
const exprKinds = new Set(['Literal', 'Var', 'LoopMeta', 'Member', 'Index', 'Call', 'Unary', 'Binary', 'Ternary', 'List', 'Map']);
const scalarTypes = new Set(['null', 'boolean', 'number', 'string', 'any']);
const hash = value => createHash('sha256').update(value).digest('hex');

/** A structured compile diagnostic with the same observable location fields as render errors. */
export class CompilerError extends Error {
  constructor(code, template, span, lines, message) {
    super(message);
    this.name = 'CompilerError';
    this.code = code;
    this.template = template;
    this.span = span;
    const offset = span?.[0] ?? 0;
    let line = 0;
    while (line + 1 < lines.length && lines[line + 1] <= offset) line++;
    this.line = line + 1;
    this.col = offset - lines[line] + 1;
  }
}

export function loadSourceGraph(manifestPath) {
  const absolute = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(absolute, 'utf8'));
  if (manifest.schema !== 3 || manifest.mode !== 'ast' || typeof manifest.compilerDigest !== 'string' || !manifest.files || typeof manifest.files !== 'object') {
    throw new Error('compiler: source graph manifest is invalid');
  }
  const base = dirname(absolute);
  const templates = new Map();
  const lines = new Map();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.artifactDigest !== 'string' || !Array.isArray(entry.lines) || entry.lines[0] !== 0) throw new Error(`compiler: ${name} has no complete AST artifact entry`);
    const bytes = readFileSync(resolve(base, entry.path));
    if (hash(bytes) !== entry.artifactDigest) throw new Error(`compiler: AST artifact ${name} is corrupt`);
    const ast = JSON.parse(bytes.toString('utf8'));
    if (ast?.type !== 'Template' || ast.name !== name || !Array.isArray(ast.body)) throw new Error(`compiler: ${name} is not a canonical Template AST`);
    templates.set(name, ast);
    lines.set(name, entry.lines);
  }
  return { manifest, templates, lines };
}

function parseType(source) {
  if (typeof source !== 'string' || source.length === 0) throw new Error(`compiler: invalid type ${JSON.stringify(source)}`);
  const optional = source.endsWith('?');
  const value = optional ? source.slice(0, -1) : source;
  const list = /^list<(.+)>$/.exec(value);
  if (list) return { kind: 'list', item: parseType(list[1]), optional, source };
  const map = /^map<([^,]+),(.+)>$/.exec(value);
  if (map) return { kind: 'map', key: parseType(map[1].trim()), value: parseType(map[2].trim()), optional, source };
  return { kind: scalarTypes.has(value) ? value : 'record', name: scalarTypes.has(value) ? undefined : value, optional, source };
}

function typeSource(type, optional = type.optional) {
  const base = type.kind === 'list' ? `list<${typeSource(type.item)}>` : type.kind === 'map' ? `map<${typeSource(type.key)},${typeSource(type.value)}>` : type.kind === 'record' ? type.name : type.kind;
  return base + (optional ? '?' : '');
}

function required(type) { return { ...type, optional: false, source: typeSource(type, false) }; }
function nullable(type) { return { ...type, optional: true, source: typeSource(type, true) }; }
function sameType(left, right) { return typeSource(required(left)) === typeSource(required(right)); }
function acceptsType(actual, expected) { return required(expected).kind === 'any' || sameType(actual, expected); }
function mergeType(left, right) { return sameType(left, right) ? { ...required(left), optional: left.optional || right.optional } : parseType('any'); }

function resolveTemplate(from, path, span = [0, 0], lines = [0]) {
  const value = path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path);
  const normalized = posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) throw new CompilerError('E_LOAD_OUTSIDE_ROOT', from, span, lines, `${path} leaves the source graph root`);
  return normalized;
}

export function lowerSourceGraph(graph, manifest) {
  if (manifest.schema !== 3) throw new Error('compiler: type manifest schema must be 3');
  if (manifest.root !== 'Assign' && manifest.root !== 'any') {
    throw new Error('compiler: type manifest root must be Assign or any');
  }
  const dynamicRoot = manifest.root === 'any';
  const records = new Map(Object.entries(manifest.records ?? {}).map(([name, fields]) => [name, new Map(Object.entries(fields).map(([field, type]) => [field, parseType(type)]))]));
  const root = new Map(Object.entries(manifest.fields ?? {}).map(([name, type]) => [name, parseType(type)]));
  const functions = new Map(Object.entries(manifest.functions ?? {}).map(([name, signature]) => {
    if (!signature || !['builtin', 'host'].includes(signature.implementation)) {
      throw new Error(`compiler: function ${name} must declare builtin or host implementation`);
    }
    return [name, { args: (signature.args ?? []).map(parseType), returns: parseType(signature.returns ?? 'any'), implementation: signature.implementation }];
  }));
  const definitions = new Map(Object.entries(manifest.defines ?? {}).map(([name, definition]) => {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error(`compiler: definition ${name} is invalid`);
    const template = definition.template ?? null;
    if (template !== null && (typeof template !== 'string' || !graph.templates.has(template))) throw new Error(`compiler: definition ${name} names an unknown template`);
    if (template === null && definition.html !== true) throw new Error(`compiler: definition ${name} needs a template or html support`);
    return [name, { template, optional: definition.optional === true, html: definition.html === true }];
  }));
  const templateInputs = new Map(Object.entries(manifest.templates ?? {}).map(([name, fields]) => {
    if (!graph.templates.has(name) || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new Error(`compiler: template input declaration ${name} is invalid`);
    }
    return [name, new Map(Object.entries(fields).map(([field, type]) => [field, parseType(type)]))];
  }));
  for (const name of graph.templates.keys()) if (!templateInputs.has(name)) templateInputs.set(name, new Map());
  const templates = new Map();

  function lowerExpr(node, scope, loops) {
    if (!node || !exprKinds.has(node.type)) throw new Error(`compiler: invalid expression ${node?.type ?? typeof node}`);
    switch (node.type) {
      case 'Literal': {
        const kind = node.kind === 'bool' ? 'boolean' : node.kind;
        return { op: 'literal', value: node.value, valueType: parseType(kind), span: node.span };
      }
      case 'Var': {
        const local = scope.get(node.name);
        const valueType = local ?? root.get(node.name) ?? (dynamicRoot ? parseType('any?') : null);
        if (!valueType) throw new Error(`compiler: variable ${node.name} is missing from the type manifest`);
        return { op: local ? 'local' : 'root', name: node.name, valueType, scope: local || dynamicRoot, span: node.span };
      }
      case 'LoopMeta': {
        const item = loops.get(node.loop);
        if (!item) throw new CompilerError('E_RUNTIME_UNKNOWN_LOOP', null, node.span, [0], `${node.loop}.${node.field} has no enclosing loop`);
        const valueType = node.field === 'key_' ? parseType('any') : node.field === 'value_' ? item : node.field === 'first_' || node.field === 'last_' ? parseType('boolean') : parseType('number');
        return { op: 'loop-meta', loop: node.loop, field: node.field, valueType, span: node.span };
      }
      case 'Member': {
        const object = lowerExpr(node.object, scope, loops);
        const owner = required(object.valueType);
        if (owner.kind === 'any') return { op: 'member', object, key: node.key, valueType: parseType('any?'), span: node.span };
        if (owner.kind !== 'record') throw new Error(`compiler: member ${node.key} requires a record or any, got ${typeSource(object.valueType)}`);
        const valueType = records.get(owner.name)?.get(node.key);
        if (!valueType) throw new Error(`compiler: ${owner.name}.${node.key} is missing from the type manifest`);
        return { op: 'member', object, key: node.key, valueType: object.valueType.optional ? nullable(valueType) : valueType, span: node.span };
      }
      case 'Index': {
        const object = lowerExpr(node.object, scope, loops);
        const index = lowerExpr(node.index, scope, loops);
        const owner = required(object.valueType);
        const valueType = owner.kind === 'list' ? owner.item : owner.kind === 'map' ? owner.value : owner.kind === 'any' ? parseType('any') : null;
        if (!valueType) throw new Error(`compiler: index requires a list, map or any, got ${typeSource(object.valueType)}`);
        return { op: 'index', object, index, valueType: nullable(valueType), span: node.span };
      }
      case 'Call': {
        const signature = functions.get(node.name);
        if (!signature) throw new Error(`compiler: function ${node.name} is missing from the type manifest`);
        const args = node.args.map(value => lowerExpr(value, scope, loops));
        if (signature.args.length && signature.args.length !== args.length) throw new Error(`compiler: function ${node.name} expects ${signature.args.length} arguments`);
        return { op: 'call', name: node.name, implementation: signature.implementation, args, valueType: signature.returns, span: node.span };
      }
      case 'Unary': return { op: 'unary', operator: node.op, operand: lowerExpr(node.operand, scope, loops), valueType: parseType(node.op === '!' ? 'boolean' : 'number'), span: node.span };
      case 'Binary': {
        const left = lowerExpr(node.left, scope, loops);
        const right = lowerExpr(node.right, scope, loops);
        const boolean = ['&&', '||', '==', '!=', '===', '!==', '<', '>', '<=', '>=', 'in'].includes(node.op);
        const arithmetic = ['-', '*', '/', '%'].includes(node.op);
        return { op: 'binary', operator: node.op, left, right, valueType: boolean ? parseType('boolean') : arithmetic ? parseType('number') : mergeType(left.valueType, right.valueType), span: node.span };
      }
      case 'Ternary': {
        const test = lowerExpr(node.test, scope, loops);
        const then = node.then === null ? test : lowerExpr(node.then, scope, loops);
        const otherwise = lowerExpr(node.else, scope, loops);
        return { op: 'ternary', test, then, otherwise, valueType: mergeType(then.valueType, otherwise.valueType), span: node.span };
      }
      case 'List': {
        const items = node.items.map(item => ({ spread: item.type === 'Spread', value: lowerExpr(item.type === 'Spread' ? item.expr : item, scope, loops), span: item.span }));
        let itemType = null;
        for (const item of items) {
          const spreadType = item.spread ? required(item.value.valueType) : null;
          if (item.spread && spreadType.kind !== 'list' && spreadType.kind !== 'any') throw new Error(`compiler: list spread requires a list or any, got ${typeSource(item.value.valueType)}`);
          const candidate = item.spread ? spreadType.kind === 'list' ? spreadType.item : parseType('any') : item.value.valueType;
          itemType = itemType === null ? candidate : mergeType(itemType, candidate);
        }
        return { op: 'list', items, valueType: parseType(`list<${typeSource(itemType ?? parseType('any'))}>`), span: node.span };
      }
      case 'Map': {
        const entries = node.entries.map(item => item.type === 'Spread' ? { spread: true, value: lowerExpr(item.expr, scope, loops), span: item.span } : { spread: false, key: lowerExpr(item.key, scope, loops), value: lowerExpr(item.value, scope, loops), span: item.span });
        let keyType = null;
        let valueType = null;
        for (const entry of entries) {
          const spreadType = entry.spread ? required(entry.value.valueType) : null;
          if (entry.spread && spreadType.kind !== 'map' && spreadType.kind !== 'any') throw new Error(`compiler: map spread requires a map or any, got ${typeSource(entry.value.valueType)}`);
          const key = entry.spread ? spreadType.kind === 'map' ? spreadType.key : parseType('any') : entry.key.valueType;
          const value = entry.spread ? spreadType.kind === 'map' ? spreadType.value : parseType('any') : entry.value.valueType;
          keyType = keyType === null ? key : mergeType(keyType, key);
          valueType = valueType === null ? value : mergeType(valueType, value);
        }
        return { op: 'map', entries, valueType: parseType(`map<${typeSource(keyType ?? parseType('any'))},${typeSource(valueType ?? parseType('any'))}>`), span: node.span };
      }
    }
  }

  function lowerNodes(body, templateName, inheritedScope = new Map(), inheritedLoops = new Map()) {
    if (!Array.isArray(body)) throw new Error(`compiler: ${templateName} body is not a node list`);
    const scope = new Map(inheritedScope);
    const loops = new Map(inheritedLoops);
    try {
      return body.map(node => {
      if (!nodeKinds.has(node?.type)) throw new Error(`compiler: invalid node ${node?.type ?? typeof node}`);
      switch (node.type) {
        case 'Text': return { op: 'text', value: node.value, span: node.span };
        case 'Echo': return { op: 'echo', expr: lowerExpr(node.expr, scope, loops), span: node.span };
        case 'Set': {
          const expr = lowerExpr(node.expr, scope, loops);
          scope.set(node.name, expr.valueType);
          return { op: 'set', name: node.name, expr, span: node.span };
        }
        case 'If': return { op: 'if', branches: node.branches.map(branch => ({ test: lowerExpr(branch.test, scope, loops), body: lowerNodes(branch.body, templateName, scope, loops), span: branch.span })), otherwise: node.else ? lowerNodes(node.else, templateName, scope, loops) : null, span: node.span };
        case 'For': {
          const iter = lowerExpr(node.iter, scope, loops);
          const collection = required(iter.valueType);
          if (collection.kind !== 'list' && collection.kind !== 'map' && collection.kind !== 'any') throw new Error(`compiler: loop ${node.name} requires list, map or any, got ${typeSource(iter.valueType)}`);
          const itemType = collection.kind === 'list' ? collection.item : collection.kind === 'map' ? collection.value : parseType('any');
          const nestedScope = new Map(scope).set(node.name, itemType);
          const nestedLoops = new Map(loops).set(node.name, itemType);
          return { op: 'for', name: node.name, iter, itemType, body: lowerNodes(node.body, templateName, nestedScope, nestedLoops), empty: node.empty ? lowerNodes(node.empty, templateName, scope, loops) : null, span: node.span };
        }
        case 'Include': {
          const target = resolveTemplate(templateName, node.path, node.span, graph.lines?.get(templateName) ?? [0]);
          if (!graph.templates.has(target)) throw new CompilerError('E_LOAD_NOT_FOUND', templateName, node.span, graph.lines?.get(templateName) ?? [0], `template ${target} does not exist`);
          const inputs = [...templateInputs.get(target)].map(([name, valueType]) => {
            const value = lowerExpr({ type: 'Var', name, span: node.span }, scope, loops);
            if (!acceptsType(value.valueType, valueType) || value.valueType.optional && !valueType.optional) {
              throw new Error(`compiler: include ${target} input ${name} requires ${typeSource(valueType)}, got ${typeSource(value.valueType)}`);
            }
            return { name, value, valueType };
          });
          return { op: 'include', target, inputs, span: node.span };
        }
        case 'Block': {
          if (node.id !== null && !definitions.has(node.id)) throw new Error(`compiler: definition ${node.id} is missing from the type manifest`);
          const path = node.path === null ? null : resolveTemplate(templateName, node.path, node.span, graph.lines?.get(templateName) ?? [0]);
          if (path !== null && !graph.templates.has(path)) throw new Error(`compiler: block template ${path} is missing from the source graph`);
          const definition = node.id === null ? null : definitions.get(node.id);
          const target = path ?? definition?.template ?? null;
          if (target === null && !definition?.html) throw new Error(`compiler: block ${node.id ?? '<anonymous>'} has no generated target`);
          const targetInputs = target === null ? new Map() : templateInputs.get(target);
          const blockScope = new Map(node.scope.map(item => [item.name, lowerExpr(item.expr, scope, loops)]));
          // An HTML definition is already rendered content. Its call-site scope is
          // intentionally ignored because there is no target template to receive it.
          if (target !== null) for (const name of blockScope.keys()) if (!targetInputs.has(name)) throw new Error(`compiler: block input ${name} is not declared by ${target}`);
          const inputs = [...targetInputs].map(([name, valueType]) => ({
            name,
            valueType,
            scope: blockScope.get(name) ?? null,
            root: root.has(name) || dynamicRoot ? { op: 'root', name, valueType: root.get(name) ?? parseType('any?'), scope: false, span: node.span } : null,
          }));
          return { op: 'block', id: node.id, path, target, definition, inputs, span: node.span };
        }
        case 'IfBlock': {
          if (!definitions.has(node.id)) throw new Error(`compiler: definition ${node.id} is missing from the type manifest`);
          return { op: 'if-block', id: node.id, body: lowerNodes(node.body, templateName, scope, loops), otherwise: node.else ? lowerNodes(node.else, templateName, scope, loops) : null, span: node.span };
        }
      }
      });
    } catch (error) {
      if (error instanceof CompilerError && error.template === null) {
        throw new CompilerError(error.code, templateName, error.span, graph.lines?.get(templateName) ?? [0], error.message);
      }
      throw error;
    }
  }

  for (const [name, ast] of graph.templates) {
    const inputs = templateInputs.get(name);
    templates.set(name, { name, lines: graph.lines?.get(name) ?? [0], inputs, body: lowerNodes(ast.body, name, inputs), span: ast.span ?? [0, 0] });
  }
  const entry = manifest.entry;
  if (typeof entry !== 'string' || !templates.has(entry)) throw new Error('compiler: type manifest entry must name a source graph template');
  if (templateInputs.get(entry).size !== 0) throw new Error('compiler: entry template cannot require template inputs');
  return { schema: 1, entry, dynamicRoot, fields: root, records, functions, definitions, templates };
}

export { parseType, typeSource };
