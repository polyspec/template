import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { AstDecodeError, decodeTemplate, type Expr as SourceExpr, type Node as SourceNode, type Span, type Template } from '@polyspec/template';
import { astManifestDocument, type AstManifest, type FunctionSignature, type TypeManifest } from './documents.mts';

type BinaryOp = Extract<SourceExpr, { type: 'Binary' }>['op'];
type LoopMetaField = Extract<SourceExpr, { type: 'LoopMeta' }>['field'];
/** The kinds of the scalar types of the type manifest. */
export const scalarKinds = ['null', 'boolean', 'number', 'string', 'any'] as const;
type ScalarKind = typeof scalarKinds[number];
const hash = (value: Buffer): string => createHash('sha256').update(value).digest('hex');

/** A type of the type manifest, parsed: `source` is its text, and `optional` whether it ends with `?`. */
export type ValueType =
  | { kind: ScalarKind; optional: boolean; source: string }
  | { kind: 'record'; name: string; optional: boolean; source: string }
  | { kind: 'list'; item: ValueType; optional: boolean; source: string }
  | { kind: 'map'; key: ValueType; value: ValueType; optional: boolean; source: string };

/** A root or local variable; `scope` tells whether its value is read from the render scope at runtime. */
export interface VariableExpr { op: 'root' | 'local'; name: string; valueType: ValueType; scope: boolean; span: Span }

/** A lowered expression: the operation `op` of its source expression with the type of its value. */
export type Expr =
  | { op: 'literal'; value: null | boolean | number | string; valueType: ValueType; span: Span }
  | { op: 'to-value'; value: Expr; valueType: ValueType; span: Span }
  | VariableExpr
  | { op: 'loop-meta'; loop: string; field: LoopMetaField; valueType: ValueType; span: Span }
  | { op: 'member'; object: Expr; key: string; valueType: ValueType; span: Span }
  | { op: 'index'; object: Expr; index: Expr; valueType: ValueType; span: Span }
  | { op: 'member-call'; object: Expr; method: string; args: Expr[]; valueType: ValueType; span: Span }
  | { op: 'class-call'; className: string; method: string; args: Expr[]; valueType: ValueType; span: Span }
  | { op: 'call'; name: string; implementation: FunctionSignature['implementation']; args: Expr[]; valueType: ValueType; span: Span }
  | { op: 'unary'; operator: '!' | '-'; operand: Expr; valueType: ValueType; span: Span }
  | { op: 'binary'; operator: BinaryOp; left: Expr; right: Expr; valueType: ValueType; span: Span }
  | { op: 'ternary'; test: Expr; consequent: Expr; otherwise: Expr; valueType: ValueType; span: Span }
  | { op: 'list'; items: ListItem[]; valueType: ValueType; span: Span }
  | { op: 'map'; entries: MapItem[]; valueType: ValueType; span: Span };

/** An item of a list literal: a value, or a spread list. */
interface ListItem { spread: boolean; value: Expr; span: Span }
/** An entry of a map literal: a key and its value, or a spread map. */
type MapItem = { spread: true; value: Expr; span: Span } | { spread: false; key: Expr; value: Expr };

/** A definition of the type manifest: the template that renders it, or null for HTML only. */
export interface Definition { template: string | null; optional: boolean; html: boolean }

/** An input of a template that a block passes: from the block scope, the root, or neither. */
export interface BlockInput { name: string; valueType: ValueType; scope: Expr | null; root: VariableExpr | null }

/**
 * A block: of a definition without a target template, which renders the HTML that the request defines; of a definition
 * with a target template, its path or the template of the definition; or anonymous, which renders the template of its path.
 */
type BlockNode =
  | { op: 'block'; id: string; path: null; target: null; definition: Definition; inputs: BlockInput[]; span: Span }
  | { op: 'block'; id: string; path: string | null; target: string; definition: Definition; inputs: BlockInput[]; span: Span }
  | { op: 'block'; id: null; path: string; target: string; definition: null; inputs: BlockInput[]; span: Span };

/** A lowered statement node. */
export type Node =
  | { op: 'text'; value: string; span: Span }
  | { op: 'echo'; expr: Expr; span: Span }
  | { op: 'set'; name: string; expr: Expr; span: Span }
  | { op: 'if'; branches: { test: Expr; body: Node[]; span: Span }[]; otherwise: Node[] | null; span: Span }
  | { op: 'for'; name: string; iter: Expr; itemType: ValueType; body: Node[]; empty: Node[] | null; span: Span }
  | { op: 'include'; target: string; inputs: { name: string; value: Expr; valueType: ValueType }[]; span: Span }
  | BlockNode
  | { op: 'if-block'; id: string; body: Node[]; otherwise: Node[] | null; span: Span };

/** A function of the type manifest with its argument counts. */
interface Signature {
  args: ValueType[];
  minArgs: number;
  maxArgs: number;
  returns: ValueType;
  implementation: FunctionSignature['implementation'];
  runtimeArity: boolean;
}

/** A lowered template: its line index, its inputs and its body. */
export interface LoweredTemplate { name: string; lines: number[]; inputs: Map<string, ValueType>; body: Node[]; span: Span }

/** The typed program of a source graph that the backends emit. */
export interface Program {
  schema: 1;
  entry: string;
  dynamicRoot: boolean;
  fields: Map<string, ValueType>;
  records: Map<string, Map<string, ValueType>>;
  functions: Map<string, Signature>;
  definitions: Map<string, Definition>;
  templates: Map<string, LoweredTemplate>;
}

/** The templates of a source graph by name, with the source line index of each. */
export interface SourceGraph {
  templates: Map<string, Template>;
  lines: Map<string, number[]>;
}

/** A structured compile diagnostic with the same observable location fields as render errors. */
class CompilerError extends Error {
  readonly code: string;
  readonly template: string | null;
  readonly span: Span;
  readonly line: number;
  readonly col: number;

  constructor(code: string, template: string | null, span: Span, lines: number[], message: string) {
    super(message);
    this.name = 'CompilerError';
    this.code = code;
    this.template = template;
    this.span = span;
    const offset = span[0];
    // The line index starts with the offset 0 and ascends, so the line of an offset is the last line that starts at or before it.
    const line = lines.findLastIndex(start => start <= offset);
    const start = lines[line];
    if (start === undefined) throw new Error(`compiler: the line index of ${template ?? 'a template'} has no line of the offset ${offset}`);
    this.line = line + 1;
    this.col = offset - start + 1;
  }
}

export function loadSourceGraph(manifestPath: string): SourceGraph & { manifest: AstManifest } {
  const absolute = resolve(manifestPath);
  const manifest = astManifestDocument.read(absolute);
  const base = dirname(absolute);
  const templates = new Map<string, Template>();
  const lines = new Map<string, number[]>();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (entry.lines[0] !== 0) throw new Error(`compiler: ${name} has no complete AST artifact entry`);
    const path = resolve(base, entry.path);
    const bytes = readFileSync(path);
    if (hash(bytes) !== entry.artifactDigest) throw new Error(`compiler: AST artifact ${name} is corrupt`);
    const ast = decodeAst(bytes.toString('utf8'), path);
    if (ast.name !== name) throw new Error(`compiler: ${name} is not a canonical Template AST`);
    templates.set(name, ast);
    lines.set(name, entry.lines);
  }
  return { manifest, templates, lines };
}

/** The template AST of the JSON text of the AST file at `path`. */
function decodeAst(text: string, path: string): Template {
  try {
    return decodeTemplate(text);
  } catch (error) {
    if (error instanceof AstDecodeError) throw new Error(`compiler: ${path} is no canonical Template AST: ${error.message}`, { cause: error });
    throw error;
  }
}

function parseType(source: string): ValueType {
  if (source.length === 0) throw new Error(`compiler: invalid type ${JSON.stringify(source)}`);
  const optional = source.endsWith('?');
  const value = optional ? source.slice(0, -1) : source;
  const list = /^list<(.+)>$/.exec(value);
  if (list?.[1] !== undefined) return { kind: 'list', item: parseType(list[1]), optional, source };
  const map = /^map<([^,]+),(.+)>$/.exec(value);
  if (map?.[1] !== undefined && map[2] !== undefined) return { kind: 'map', key: parseType(map[1].trim()), value: parseType(map[2].trim()), optional, source };
  const scalar = scalarKinds.find(kind => kind === value);
  return scalar === undefined ? { kind: 'record', name: value, optional, source } : { kind: scalar, optional, source };
}

function typeSource(type: ValueType, optional = type.optional): string {
  const base = type.kind === 'list' ? `list<${typeSource(type.item)}>` : type.kind === 'map' ? `map<${typeSource(type.key)},${typeSource(type.value)}>` : type.kind === 'record' ? type.name : type.kind;
  return base + (optional ? '?' : '');
}

function required(type: ValueType): ValueType { return { ...type, optional: false, source: typeSource(type, false) }; }
function nullable(type: ValueType): ValueType { return { ...type, optional: true, source: typeSource(type, true) }; }
function sameType(left: ValueType, right: ValueType): boolean { return typeSource(required(left)) === typeSource(required(right)); }
function acceptsType(actual: ValueType, expected: ValueType): boolean { return required(expected).kind === 'any' || sameType(actual, expected); }
function mergeType(left: ValueType, right: ValueType): ValueType { return sameType(left, right) ? { ...required(left), optional: left.optional || right.optional } : parseType('any'); }
function holdsRecord(type: ValueType): boolean {
  const value = required(type);
  return value.kind === 'record' || (value.kind === 'list' && holdsRecord(value.item)) || (value.kind === 'map' && holdsRecord(value.value));
}
// A typed value that holds a record reaches a runtime operation (a function argument, an operator
// operand or an echo) as a canonical value: a record becomes a map of its declared fields in
// declaration order, at every depth (VAL-21, docs/spec/compiler.md).
function dynamicValue(expr: Expr): Expr {
  return holdsRecord(expr.valueType) ? { op: 'to-value', value: expr, valueType: parseType('any'), span: expr.span } : expr;
}

// The type of a local after merging an assignment of `type` into the types assigned before.
function assign(assigned: Map<string, ValueType>, name: string, type: ValueType): void {
  const previous = assigned.get(name);
  assigned.set(name, previous === undefined ? type : mergeType(previous, type));
}

// The types that the assignments of lowered nodes give to locals, including assignments in nested
// branches and loop bodies.
function assignedTypes(nodes: Node[], assigned = new Map<string, ValueType>()): Map<string, ValueType> {
  for (const node of nodes) {
    if (node.op === 'set') assign(assigned, node.name, node.expr.valueType);
    if (node.op === 'if') {
      for (const branch of node.branches) assignedTypes(branch.body, assigned);
      if (node.otherwise) assignedTypes(node.otherwise, assigned);
    }
    if (node.op === 'for') {
      for (const [name, type] of assignedTypes(node.body)) if (name !== node.name) assign(assigned, name, type);
      if (node.empty) assignedTypes(node.empty, assigned);
    }
  }
  return assigned;
}

// A local that a branch or a loop body assigns with another type holds either type afterwards, and
// a loop body reads the value of the previous iteration, so the local takes the merged type of all
// its assignments. Returns whether a type changed.
function widenLocals(scope: Map<string, ValueType>, assigned: Map<string, ValueType>, except: string | null = null): boolean {
  let changed = false;
  for (const [name, type] of assigned) {
    const current = scope.get(name);
    if (name === except || current === undefined) continue;
    const merged = mergeType(current, type);
    if (typeSource(merged) !== typeSource(current)) {
      scope.set(name, merged);
      changed = true;
    }
  }
  return changed;
}

function resolveTemplate(from: string, path: string, span: Span, lines: number[]): string {
  const value = path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path);
  const normalized = posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) throw new CompilerError('E_LOAD_OUTSIDE_ROOT', from, span, lines, `${path} leaves the source graph root`);
  return normalized;
}

/** The parsed types of a map of types of the type manifest by name. */
const typeMap = (fields: Record<string, string>): Map<string, ValueType> => new Map(Object.entries(fields).map(([field, type]) => [field, parseType(type)]));

export function lowerSourceGraph(graph: SourceGraph, manifest: TypeManifest): Program {
  const dynamicRoot = manifest.root === 'any';
  const records = new Map(Object.entries(manifest.records).map(([name, fields]) => [name, typeMap(fields)]));
  const root = typeMap(manifest.fields);
  const functions = new Map(Object.entries(manifest.functions).map(([name, signature]): [string, Signature] => [name, {
    args: signature.args.map(parseType),
    minArgs: signature.minArgs ?? signature.args.length,
    maxArgs: signature.maxArgs ?? signature.args.length,
    returns: parseType(signature.returns),
    implementation: signature.implementation,
    runtimeArity: signature.runtimeArity === true,
  }]));
  const definitions = new Map(Object.entries(manifest.defines).map(([name, definition]): [string, Definition] => {
    const template = definition.template ?? null;
    if (template !== null && !graph.templates.has(template)) throw new Error(`compiler: definition ${name} names an unknown template`);
    if (template === null && definition.html !== true) throw new Error(`compiler: definition ${name} needs a template or html support`);
    return [name, { template, optional: definition.optional === true, html: definition.html === true }];
  }));
  const templateInputs = new Map(Object.entries(manifest.templates).map(([name, fields]) => {
    if (!graph.templates.has(name)) throw new Error(`compiler: template input declaration ${name} is invalid`);
    return [name, typeMap(fields)];
  }));
  for (const name of graph.templates.keys()) if (!templateInputs.has(name)) templateInputs.set(name, new Map());
  const templates = new Map<string, LoweredTemplate>();
  // Every template of the graph has its inputs, declared or none.
  const inputsOf = (name: string): Map<string, ValueType> => {
    const inputs = templateInputs.get(name);
    if (inputs === undefined) throw new Error(`compiler: template ${name} is missing from the source graph`);
    return inputs;
  };
  const linesOf = (name: string): number[] => graph.lines.get(name) ?? [0];
  const definitionOf = (id: string): Definition => {
    const definition = definitions.get(id);
    if (definition === undefined) throw new Error(`compiler: definition ${id} is missing from the type manifest`);
    return definition;
  };
  const anyType = (): ValueType => parseType('any');

  // The type of the items of a spread list or map, the item type of a list or the key and value types of a map.
  function spreadOf(value: Expr, kind: 'list' | 'map'): ValueType {
    const type = required(value.valueType);
    if (type.kind !== kind && type.kind !== 'any') throw new Error(`compiler: ${kind} spread requires a ${kind} or any, got ${typeSource(value.valueType)}`);
    return type;
  }

  function lowerExpr(node: SourceExpr, scope: Map<string, ValueType>, loops: Map<string, ValueType>): Expr {
    switch (node.type) {
      case 'Literal': {
        const kind = node.kind === 'bool' ? 'boolean' : node.kind;
        return { op: 'literal', value: node.value, valueType: parseType(kind), span: node.span };
      }
      case 'Var': {
        const local = scope.get(node.name);
        const valueType = local ?? root.get(node.name) ?? (dynamicRoot ? parseType('any?') : null);
        if (!valueType) throw new Error(`compiler: variable ${node.name} is missing from the type manifest`);
        return { op: local ? 'local' : 'root', name: node.name, valueType, scope: local !== undefined || dynamicRoot, span: node.span };
      }
      case 'LoopMeta': {
        const item = loops.get(node.loop);
        if (!item) throw new CompilerError('E_RUNTIME_UNKNOWN_LOOP', null, node.span, [0], `${node.loop}.${node.field} has no enclosing loop`);
        const valueType = node.field === 'key_' ? anyType() : node.field === 'value_' ? item : node.field === 'first_' || node.field === 'last_' ? parseType('boolean') : parseType('number');
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
        const valueType = owner.kind === 'list' ? owner.item : owner.kind === 'map' ? owner.value : owner.kind === 'any' ? anyType() : null;
        if (!valueType) throw new Error(`compiler: index requires a list, map or any, got ${typeSource(object.valueType)}`);
        return { op: 'index', object, index, valueType: nullable(valueType), span: node.span };
      }
      case 'MemberCall': {
        const object = lowerExpr(node.object, scope, loops);
        if (required(object.valueType).kind !== 'any') throw new Error(`compiler: member call ${node.method} requires an any object`);
        const args = node.args.map(value => dynamicValue(lowerExpr(value, scope, loops)));
        return { op: 'member-call', object, method: node.method, args, valueType: anyType(), span: node.span };
      }
      case 'ClassCall': {
        const signature = functions.get(`${node.className}::${node.method}`);
        if (!signature) throw new Error(`compiler: class function ${node.className}::${node.method} is missing from the type manifest`);
        const args = node.args.map(value => dynamicValue(lowerExpr(value, scope, loops)));
        if (!signature.runtimeArity && (args.length < signature.minArgs || (signature.maxArgs !== -1 && args.length > signature.maxArgs))) throw new Error(`compiler: class function ${node.className}::${node.method} expects ${signature.minArgs}-${signature.maxArgs} arguments`);
        return { op: 'class-call', className: node.className, method: node.method, args, valueType: signature.returns, span: node.span };
      }
      case 'Call': {
        const signature = functions.get(node.name);
        if (!signature) throw new Error(`compiler: function ${node.name} is missing from the type manifest`);
        const args = node.args.map(value => dynamicValue(lowerExpr(value, scope, loops)));
        const { minArgs, maxArgs } = signature;
        if (!signature.runtimeArity && (args.length < minArgs || (maxArgs !== -1 && args.length > maxArgs))) {
          const range = minArgs === maxArgs ? `${minArgs}` : `${minArgs}-${maxArgs === -1 ? '∞' : maxArgs}`;
          throw new Error(`compiler: function ${node.name} expects ${range} arguments`);
        }
        return { op: 'call', name: node.name, implementation: signature.implementation, args, valueType: signature.returns, span: node.span };
      }
      case 'Unary': return { op: 'unary', operator: node.op, operand: dynamicValue(lowerExpr(node.operand, scope, loops)), valueType: parseType(node.op === '!' ? 'boolean' : 'number'), span: node.span };
      case 'Binary': {
        // `&&`, `||` and `??` test truthiness or null and return an operand, which keeps its type.
        const shortCircuit = ['&&', '||', '??'].includes(node.op);
        const left = shortCircuit ? lowerExpr(node.left, scope, loops) : dynamicValue(lowerExpr(node.left, scope, loops));
        const right = shortCircuit ? lowerExpr(node.right, scope, loops) : dynamicValue(lowerExpr(node.right, scope, loops));
        const boolean = ['&&', '||', '==', '!=', '===', '!==', '<', '>', '<=', '>=', 'in'].includes(node.op);
        const arithmetic = ['-', '*', '/', '%'].includes(node.op);
        return { op: 'binary', operator: node.op, left, right, valueType: boolean ? parseType('boolean') : arithmetic ? parseType('number') : mergeType(left.valueType, right.valueType), span: node.span };
      }
      case 'Ternary': {
        const test = lowerExpr(node.test, scope, loops);
        // The IR names the branch taken on a truthy test `consequent`: an object with a `then` property is a thenable.
        const consequent = node.then === null ? test : lowerExpr(node.then, scope, loops);
        const otherwise = lowerExpr(node.else, scope, loops);
        return { op: 'ternary', test, consequent, otherwise, valueType: mergeType(consequent.valueType, otherwise.valueType), span: node.span };
      }
      case 'List': {
        const items = node.items.map((item): ListItem => ({ spread: item.type === 'Spread', value: lowerExpr(item.type === 'Spread' ? item.expr : item, scope, loops), span: item.span }));
        let itemType: ValueType | null = null;
        for (const item of items) {
          const spreadType = item.spread ? spreadOf(item.value, 'list') : null;
          const candidate = spreadType === null ? item.value.valueType : spreadType.kind === 'list' ? spreadType.item : anyType();
          itemType = itemType === null ? candidate : mergeType(itemType, candidate);
        }
        return { op: 'list', items, valueType: parseType(`list<${typeSource(itemType ?? anyType())}>`), span: node.span };
      }
      case 'Map': {
        const entries = node.entries.map((item): MapItem => 'type' in item ? { spread: true, value: lowerExpr(item.expr, scope, loops), span: item.span } : { spread: false, key: lowerExpr(item.key, scope, loops), value: lowerExpr(item.value, scope, loops) });
        let keyType: ValueType | null = null;
        let valueType: ValueType | null = null;
        for (const entry of entries) {
          const spreadType = entry.spread ? spreadOf(entry.value, 'map') : null;
          const key = entry.spread ? spreadType?.kind === 'map' ? spreadType.key : anyType() : entry.key.valueType;
          const value = entry.spread ? spreadType?.kind === 'map' ? spreadType.value : anyType() : entry.value.valueType;
          keyType = keyType === null ? key : mergeType(keyType, key);
          valueType = valueType === null ? value : mergeType(valueType, value);
        }
        return { op: 'map', entries, valueType: parseType(`map<${typeSource(keyType ?? anyType())},${typeSource(valueType ?? anyType())}>`), span: node.span };
      }
    }
  }

  function lowerNode(node: SourceNode, templateName: string, scope: Map<string, ValueType>, loops: Map<string, ValueType>): Node {
    switch (node.type) {
      case 'Text': return { op: 'text', value: node.value, span: node.span };
      case 'Echo': return { op: 'echo', expr: dynamicValue(lowerExpr(node.expr, scope, loops)), span: node.span };
      case 'Set': {
        const expr = lowerExpr(node.expr, scope, loops);
        scope.set(node.name, expr.valueType);
        return { op: 'set', name: node.name, expr, span: node.span };
      }
      case 'If': {
        const lowered: Node = { op: 'if', branches: node.branches.map(branch => ({ test: lowerExpr(branch.test, scope, loops), body: lowerNodes(branch.body, templateName, scope, loops), span: branch.span })), otherwise: node.else ? lowerNodes(node.else, templateName, scope, loops) : null, span: node.span };
        widenLocals(scope, assignedTypes([lowered]));
        return lowered;
      }
      case 'For': {
        const iter = lowerExpr(node.iter, scope, loops);
        const collection = required(iter.valueType);
        if (collection.kind !== 'list' && collection.kind !== 'map' && collection.kind !== 'any') throw new Error(`compiler: loop ${node.name} requires list, map or any, got ${typeSource(iter.valueType)}`);
        const itemType = collection.kind === 'list' ? collection.item : collection.kind === 'map' ? collection.value : anyType();
        const nestedLoops = new Map(loops).set(node.name, itemType);
        let body = lowerNodes(node.body, templateName, new Map(scope).set(node.name, itemType), nestedLoops);
        while (widenLocals(scope, assignedTypes(body), node.name)) body = lowerNodes(node.body, templateName, new Map(scope).set(node.name, itemType), nestedLoops);
        return { op: 'for', name: node.name, iter, itemType, body, empty: node.empty ? lowerNodes(node.empty, templateName, scope, loops) : null, span: node.span };
      }
      case 'Include': {
        const target = resolveTemplate(templateName, node.path, node.span, linesOf(templateName));
        if (!graph.templates.has(target)) throw new CompilerError('E_LOAD_NOT_FOUND', templateName, node.span, linesOf(templateName), `template ${target} does not exist`);
        const inputs = [...inputsOf(target)].map(([name, valueType]) => {
          const value = lowerExpr({ type: 'Var', name, span: node.span }, scope, loops);
          if (!acceptsType(value.valueType, valueType) || value.valueType.optional && !valueType.optional) {
            throw new Error(`compiler: include ${target} input ${name} requires ${typeSource(valueType)}, got ${typeSource(value.valueType)}`);
          }
          return { name, value, valueType };
        });
        return { op: 'include', target, inputs, span: node.span };
      }
      case 'Block': {
        const definition = node.id === null ? null : definitionOf(node.id);
        const path = node.path === null ? null : resolveTemplate(templateName, node.path, node.span, linesOf(templateName));
        if (path !== null && !graph.templates.has(path)) throw new Error(`compiler: block template ${path} is missing from the source graph`);
        const target = path ?? definition?.template ?? null;
        if (target === null && !definition?.html) throw new Error(`compiler: block ${node.id ?? '<anonymous>'} has no generated target`);
        const targetInputs = target === null ? new Map<string, ValueType>() : inputsOf(target);
        const blockScope = new Map(node.scope.map(item => [item.name, lowerExpr(item.expr, scope, loops)]));
        // An HTML definition is already rendered content. Its call-site scope is
        // intentionally ignored because there is no target template to receive it.
        if (target !== null) for (const name of blockScope.keys()) if (!targetInputs.has(name)) throw new Error(`compiler: block input ${name} is not declared by ${target}`);
        const inputs = [...targetInputs].map(([name, valueType]): BlockInput => ({
          name,
          valueType,
          scope: blockScope.get(name) ?? null,
          root: root.has(name) || dynamicRoot ? { op: 'root', name, valueType: root.get(name) ?? parseType('any?'), scope: false, span: node.span } : null,
        }));
        if (node.id !== null && definition !== null) {
          // A block has no target only when it has no path.
          if (target === null) return { op: 'block', id: node.id, path: null, target: null, definition, inputs, span: node.span };
          return { op: 'block', id: node.id, path, target, definition, inputs, span: node.span };
        }
        // An anonymous block has no definition, so the check above that it has a target is a check of its path.
        if (path === null) throw new Error('compiler: block <anonymous> has no generated target');
        return { op: 'block', id: null, path, target: path, definition: null, inputs, span: node.span };
      }
      case 'IfBlock': {
        definitionOf(node.id);
        return { op: 'if-block', id: node.id, body: lowerNodes(node.body, templateName, scope, loops), otherwise: node.else ? lowerNodes(node.else, templateName, scope, loops) : null, span: node.span };
      }
    }
  }

  function lowerNodes(body: SourceNode[], templateName: string, inheritedScope = new Map<string, ValueType>(), inheritedLoops = new Map<string, ValueType>()): Node[] {
    const scope = new Map(inheritedScope);
    const loops = new Map(inheritedLoops);
    try {
      return body.map(node => lowerNode(node, templateName, scope, loops));
    } catch (error) {
      if (error instanceof CompilerError && error.template === null) {
        throw new CompilerError(error.code, templateName, error.span, linesOf(templateName), error.message);
      }
      throw error;
    }
  }

  for (const [name, ast] of graph.templates) {
    const inputs = inputsOf(name);
    templates.set(name, { name, lines: linesOf(name), inputs, body: lowerNodes(ast.body, name, inputs), span: [0, 0] });
  }
  const entry = manifest.entry;
  if (!templates.has(entry)) throw new Error('compiler: type manifest entry must name a source graph template');
  if (inputsOf(entry).size !== 0) throw new Error('compiler: entry template cannot require template inputs');
  return { schema: 1, entry, dynamicRoot, fields: root, records, functions, definitions, templates };
}

/** The lowered template `name` of a program; every template that the program names is one of its templates. */
export function loweredTemplate(program: Program, name: string): LoweredTemplate {
  const template = program.templates.get(name);
  if (template === undefined) throw new Error(`compiler: the program has no template ${name}`);
  return template;
}

/** The lowered expression of the operation `Op`. */
export type ExprOf<Op extends Expr['op']> = Extract<Expr, { op: Op }>;
/** The lowered node of the operation `Op`. */
export type NodeOf<Op extends Node['op']> = Extract<Node, { op: Op }>;
