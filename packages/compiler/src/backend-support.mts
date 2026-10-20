import type { Span } from '@polyspec/template';
import type { TypeManifest } from './documents.mts';
import { loweredTemplate, scalarKinds, type Expr, type ExprOf, type LoweredTemplate, type Node, type NodeOf, type Program, type ValueType, type VariableExpr } from './ir.mts';

const scalarTypes = {
  go: { string: 'string', number: 'float64', boolean: 'bool', any: 'any', null: 'any', Template: 'string' },
  rust: { string: 'String', number: 'f64', boolean: 'bool', any: 'GeneratedValue', null: 'GeneratedValue', Template: 'String' },
  php: { string: 'string', number: 'float', boolean: 'bool', any: 'mixed', null: 'mixed', Template: 'string' },
};

export const quote = (value: unknown): string => JSON.stringify(value);

// Exact string literals of each target language (docs/spec/compiler.md). Template text is valid
// Unicode text, so every character is a scalar value; only the characters that a literal
// interprets are escaped.
// A string iterates by code point, so a character outside the Basic Multilingual Plane stays one character.
const escapeControls = (value: string, escape: (code: number) => string): string => Array.from(value, char => {
  // A control character is one UTF-16 code unit.
  const code = char.charCodeAt(0);
  if (char === '\\') return '\\\\';
  if (char === '"') return '\\"';
  return code < 0x20 || code === 0x7f ? escape(code) : char;
}).join('');
export const goString = (value: string): string => `"${escapeControls(value, code => `\\u${code.toString(16).padStart(4, '0')}`)}"`;
export const rustString = (value: string): string => `"${escapeControls(value, code => `\\u{${code.toString(16)}}`)}"`;
const phpQuoted = (value: string): string => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
// A PHP string is single-quoted text with only \ and ' escaped. A control character is written as a
// double-quoted escape ("\n", "\r" or "\xHH") joined with `.`, so no literal spans two source lines,
// indentation of the generated source cannot change the text, and the source holds no control
// character, which the PHP backend uses to mark its argument lists (T25.2).
export const phpString = (value: string): string => {
  const control = (part: string): string => part === '\n' ? '"\\n"' : part === '\r' ? '"\\r"' : `"\\x${part.charCodeAt(0).toString(16).padStart(2, '0')}"`;
  // A control character (U+0000 to U+001F and U+007F) is written by its escape, every other run of text quoted.
  const isControl = (character: string): boolean => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f;
  const parts: string[] = [];
  let text = '';
  for (const character of value) {
    if (!isControl(character)) {
      text += character;
      continue;
    }
    if (text !== '') parts.push(phpQuoted(text));
    text = '';
    parts.push(control(character));
  }
  if (text !== '') parts.push(phpQuoted(text));
  const [only] = parts;
  if (only === undefined) return "''";
  return parts.length === 1 ? only : `(${parts.join(' . ')})`;
};
/** A value that a PHP literal writes: a scalar, null, or a list of them. */
export type PhpValue = string | number | boolean | null | readonly PhpValue[];
export const phpLiteral = (value: PhpValue): string => {
  if (typeof value === 'string') return phpString(value);
  if (Array.isArray(value)) return `[${value.map(phpLiteral).join(', ')}]`;
  if (value === null) return 'null';
  return String(value);
};
export const fieldName = (name: string): string => name.replace(/[^A-Za-z0-9_]/g, '_');
export const exportedName = (name: string): string => fieldName(name).slice(0, 1).toUpperCase() + fieldName(name).slice(1);
export const functionName = (name: string): string => `render_${fieldName(name)}`;
export const inputName = (name: string): string => `Input_${fieldName(name)}`;
export const definitionDataName = (name: string): string => `DefinitionData_${fieldName(name)}`;
export const optional = (type: string): boolean => type.endsWith('?');
const typeName = (type: string): string => type.replace(/\?$/, '');

function genericType(type: string, scalar: Record<string, string>, list: (item: string) => string, map: (key: string, value: string) => string): string {
  const source = typeName(type);
  const listMatch = /^list<(.+)>$/.exec(source);
  if (listMatch?.[1] !== undefined) return list(genericType(listMatch[1], scalar, list, map));
  const mapMatch = /^map<([^,]+),(.+)>$/.exec(source);
  if (mapMatch?.[1] !== undefined && mapMatch[2] !== undefined) return map(genericType(mapMatch[1].trim(), scalar, list, map), genericType(mapMatch[2].trim(), scalar, list, map));
  return scalar[source] ?? source;
}

/**
 * A type of the type manifest as the binder of a generated program reads it (`GeneratedType`), whose fields a program
 * writes as JSON in this order.
 */
export type Descriptor =
  | { kind: typeof scalarKinds[number]; optional: boolean }
  | { kind: 'record'; name: string; optional: boolean }
  | { kind: 'list'; item: Descriptor; optional: boolean }
  | { kind: 'map'; key: Descriptor; value: Descriptor; optional: boolean };

export function descriptor(source: string): Descriptor {
  const optionalType = source.endsWith('?');
  const value = optionalType ? source.slice(0, -1) : source;
  const list = /^list<(.+)>$/.exec(value);
  if (list?.[1] !== undefined) return { kind: 'list', item: descriptor(list[1]), optional: optionalType };
  const map = /^map<([^,]+),(.+)>$/.exec(value);
  if (map?.[1] !== undefined && map[2] !== undefined) return { kind: 'map', key: descriptor(map[1].trim()), value: descriptor(map[2].trim()), optional: optionalType };
  const scalar = scalarKinds.find(kind => kind === value);
  if (scalar !== undefined) return { kind: scalar, optional: optionalType };
  return { kind: 'record', name: value, optional: optionalType };
}

/** The descriptors of a map of types by name. */
export const descriptors = (fields: Record<string, string>): Record<string, Descriptor> => Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, descriptor(type)]));

export const goType = (type: string): string => (optional(type) && typeName(type) !== 'any' ? '*' : '') + genericType(type, scalarTypes.go, item => `[]${item}`, (key, value) => `OrderedMap[${key}, ${value}]`);
export const rustType = (type: string): string => `${optional(type) ? 'Option<' : ''}${genericType(type, scalarTypes.rust, item => `Vec<${item}>`, (key, value) => `OrderedMap<${key}, ${value}>`)}${optional(type) ? '>' : ''}`;
export const phpType = (type: string): string => genericType(type, scalarTypes.php, () => 'array', () => 'MapValue');

/**
 * A definition of generated code that the program keeps only when the code it keeps uses it (T25.1): `name` is the
 * identifier that the definition declares, and `pattern` a use of it.
 */
export interface CodeDefinition { name: string; code: string; pattern: RegExp }
/** Code written from the code of every other kept part of the program. */
export interface Dependent { render: (text: string) => string }
/** The start of a file of a target that writes one file per declaration, at `file` under the output directory. */
export interface FileStart { file: string }
/** A part of a generated program: code that it always keeps, a definition, a dependent part or a file start. */
export type Part = string | CodeDefinition | Dependent | FileStart;

/** A definition of generated code; `pattern`, a use of it, is the whole word `name` by default. */
export const definition = (name: string, code: string, pattern = new RegExp(`\\b${name}\\b`)): CodeDefinition => ({ name, code, pattern });

/**
 * Code that is written from the rest of the program, such as an import list that names what the program uses: `render`
 * receives the code of every other kept part and returns this part.
 */
export const dependent = (render: (text: string) => string): Dependent => ({ render });

/** The start of a file of a target that writes one file per declaration, at `path` under the output directory. */
export const file = (path: string): FileStart => ({ file: path });

/** The definitions that `text` uses, with the definitions that those use, in their order. */
export function usedDefinitions(definitions: CodeDefinition[], text: string): CodeDefinition[] {
  const kept = new Set<CodeDefinition>();
  let used = text;
  for (let changed = true; changed;) {
    changed = false;
    for (const item of definitions) {
      if (kept.has(item) || !item.pattern.test(used)) continue;
      kept.add(item);
      used += `\n${item.code}`;
      changed = true;
    }
  }
  return definitions.filter(item => kept.has(item));
}

const isDefinition = (part: Part): part is CodeDefinition => typeof part !== 'string' && 'pattern' in part;

/**
 * The parts of a program in order, each a string or a file start: every string, every definition that a kept part
 * uses, until no further definition is used, and every dependent part, so the program carries no helper, type, method
 * or import that it does not use.
 */
function usedParts(parts: Part[]): (string | FileStart)[] {
  const strings = parts.filter(part => typeof part === 'string').join('\n');
  const definitions = new Set(usedDefinitions(parts.filter(isDefinition), strings));
  const text = [strings, ...[...definitions].map(item => item.code)].join('\n');
  return parts.flatMap(part => {
    if (typeof part === 'string' || 'file' in part) return [part];
    if ('render' in part) return [part.render(text)];
    return definitions.has(part) ? [part.code] : [];
  });
}

/** The code of a program that is one file: its used parts, one per line. */
export function usedCode(parts: Part[]): string {
  return usedParts(parts).map(part => {
    if (typeof part !== 'string') throw new Error('compiler backend: a program of one file has no file start');
    return part;
  }).join('\n');
}

/** The files of a program that is one file per declaration: the used parts after each file start, by path. */
export function usedFiles(parts: Part[]): Record<string, string> {
  const files = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const part of usedParts(parts)) {
    if (typeof part !== 'string') {
      current = [];
      files.set(part.file, current);
    } else if (current === null) {
      throw new Error('compiler backend: code before the first file start');
    } else {
      current.push(part);
    }
  }
  return Object.fromEntries([...files].map(([path, code]) => [path, `${code.join('\n')}\n`]));
}

export const indent = (level: number, source: string): string => source.split('\n').map(line => line.length === 0 ? '' : '    '.repeat(level) + line).join('\n');

/** An item of a list literal with its emitted value. */
interface EmittedListItem { spread: boolean; value: string; node: Expr; span: Span }
/** An entry of a map literal with its emitted spread map, or its emitted key and value. */
type EmittedMapEntry =
  | { spread: true; value: string; node: Expr; span: Span }
  | { spread: false; value: [key: string, value: string]; node: { key: Expr; value: Expr } };

/**
 * The code that a backend writes for each lowered expression and node: an expression method receives the code of the
 * operands, a node method the indentation level.
 */
export interface Target {
  literal(value: ExprOf<'literal'>['value'], type: ValueType): string;
  toValue(value: string, type: ValueType, node: ExprOf<'to-value'>): string;
  var(name: string, type: string, node: VariableExpr): string;
  local(name: string, type: string, node: VariableExpr): string;
  loopMeta(loop: string, field: ExprOf<'loop-meta'>['field'], node: ExprOf<'loop-meta'>): string;
  member(object: string, key: string, owner: ValueType, node: ExprOf<'member'>): string;
  memberCall(object: string, method: string, args: string[], node: ExprOf<'member-call'>): string;
  classCall(className: string, method: string, args: string[], node: ExprOf<'class-call'>): string;
  index(object: string, index: string, owner: ValueType, node: ExprOf<'index'>): string;
  call(name: string, args: string[], node: ExprOf<'call'>): string;
  unary(operator: ExprOf<'unary'>['operator'], operand: string, node: ExprOf<'unary'>): string;
  binary(operator: ExprOf<'binary'>['operator'], left: string, right: string, node: ExprOf<'binary'>): string;
  ternary(test: string, consequent: string, otherwise: string, node: ExprOf<'ternary'>): string;
  list(items: EmittedListItem[], type: ValueType, node: ExprOf<'list'>): string;
  map(entries: EmittedMapEntry[], type: ValueType, node: ExprOf<'map'>): string;
  text(value: string, level: number, node: NodeOf<'text'>): string;
  echo(expression: string, level: number, node: NodeOf<'echo'>): string;
  set(name: string, value: string, level: number, node: NodeOf<'set'>): string;
  block(node: NodeOf<'block'>, level: number): string;
  ifBlock(node: NodeOf<'if-block'>, level: number): string;
  ifNode(node: NodeOf<'if'>, level: number): string;
  forNode(node: NodeOf<'for'>, level: number): string;
  include(node: NodeOf<'include'>, level: number): string;
  /** The body of the function of `template` at `level`; without it, the nodes of the body as emitNodes emits them. */
  templateBody?(template: LoweredTemplate, level: number): string;
}

/** A local of a generated template function: the code that reads its typed value and the type of that value. */
export interface LocalBinding { code: string; type: ValueType }

/** A local that a branch or a loop may assign: its binding before, the variable that holds it after, and its type there. */
export interface MergedLocal { name: string; before: LocalBinding; variable: string; type: ValueType }

/**
 * The locals of the template function that a backend emits (T25.8). Each local is a variable of the function that holds
 * its typed value: a template input is its field of the input, an assignment and a loop item declare a variable, and
 * every read of the local reads that variable without checking it again. The render scope keeps the Value of each
 * local for includes and dynamic lookups, so a value that the scope gives back, after an include, is decoded once where
 * it enters. A branch or a loop that may assign a local holds it afterwards in a variable that the backend declares
 * before it, of the type that the IR gives the local there. Such a variable, and a variable that holds a local that an
 * include gave back, is droppable: `prune` removes it with its statements when the function reads it nowhere.
 */
export class FunctionLocals {
  readonly bindings = new Map<string, LocalBinding>();
  private readonly droppable = new Set<string>();
  private count = 0;

  constructor(inputs: Iterable<[string, LocalBinding]>) {
    for (const [name, binding] of inputs) this.bindings.set(name, binding);
  }

  /** A new variable of the local `name`. */
  variable(name: string, droppable = false): string {
    this.count += 1;
    const variable = `local_${fieldName(name)}_${this.count}`;
    if (droppable) this.droppable.add(variable);
    return variable;
  }

  /** The binding that a read of a local uses; its type is the type that the IR gives the read. */
  read(node: VariableExpr): LocalBinding {
    const binding = this.bindings.get(node.name);
    if (binding === undefined) throw new Error(`compiler backend: local ${node.name} has no binding`);
    if (typeKey(binding.type) !== typeKey(node.valueType)) throw new Error(`compiler backend: local ${node.name} is held as ${typeKey(binding.type)} and read as ${typeKey(node.valueType)}`);
    return binding;
  }

  /** The bindings, to restore after a branch. */
  save(): Map<string, LocalBinding> { return new Map(this.bindings); }
  restore(saved: Map<string, LocalBinding>): void {
    this.bindings.clear();
    for (const [name, binding] of saved) this.bindings.set(name, binding);
  }

  /**
   * The locals of `names` that have a binding, each with a new variable that holds it after a branch or a loop: of its
   * type in `widened`, the type that the IR gives it after the node, which names each local of the enclosing scope that
   * the node assigns; or, with `widened` null, for a node that the IR does not widen, of its type before.
   */
  merged(names: Set<string>, widened: Map<string, ValueType> | null): MergedLocal[] {
    return [...names].flatMap(name => {
      const before = this.bindings.get(name);
      if (before === undefined) return [];
      const type = widened === null ? before.type : widened.get(name);
      if (type === undefined) throw new Error(`compiler backend: the IR gives no type after the node to local ${name}, which it assigns`);
      return [{ name, before, variable: this.variable(name, true), type }];
    });
  }

  /** Binds each merged local to its variable. */
  enter(merged: MergedLocal[]): void {
    for (const item of merged) this.bindings.set(item.name, { code: item.variable, type: item.type });
  }

  /**
   * The locals that a loop assigns: those of its body without the loop variable, which the loop restores, and those of its
   * empty branch.
   */
  loopNames(program: Program, node: { name: string; body: Node[]; empty?: Node[] | null | undefined }): Set<string> {
    const names = assignedNames(program, node.body);
    names.delete(node.name);
    for (const item of assignedNames(program, node.empty ?? [])) names.add(item);
    return names;
  }

  /**
   * Binds the `merged` locals and a new variable of the loop item `name` of `type`; returns the bindings before the item, to
   * restore after the loop, and the variable.
   */
  enterLoop(merged: MergedLocal[], name: string, type: ValueType): { start: Map<string, LocalBinding>; item: string } {
    this.enter(merged);
    const start = this.save();
    const item = this.variable(name);
    this.bindings.set(name, { code: item, type });
    return { start, item };
  }

  /**
   * The statements that read again, from the scope after the included template `node`, each local it assigns that has a
   * binding: each gets a new variable, and `declare` writes its statement from the variable, the name and the type.
   */
  refreshed(program: Program, node: Node, declare: (variable: string, name: string, type: ValueType) => string): string[] {
    return [...assignedNames(program, [node])].flatMap(name => {
      const before = this.bindings.get(name);
      if (before === undefined) return [];
      const variable = this.variable(name, true);
      this.bindings.set(name, { code: variable, type: before.type });
      return [declare(variable, name, before.type)];
    });
  }

  /**
   * `body` without the statements of each droppable variable that nothing else in it reads: a statement of a variable is
   * a line that declares it or assigns it.
   */
  prune(body: string): string {
    let lines = body.split('\n');
    for (let changed = true; changed;) {
      changed = false;
      for (const variable of this.droppable) {
        const statement = new RegExp(`^\\s*(?:(?:let|const|var) )?${variable}(?::| =| )`);
        const statements = lines.filter(line => statement.test(line)).length;
        if (statements === 0) continue;
        const uses = lines.join('\n').match(new RegExp(`\\b${variable}\\b`, 'g'))?.length ?? 0;
        if (uses !== statements) continue;
        lines = lines.filter(line => !statement.test(line));
        this.droppable.delete(variable);
        changed = true;
      }
    }
    return lines.join('\n');
  }
}

/**
 * The type of a value as text, with `?` when it is optional at its top level; any and null admit null anyway, so they
 * have no optional form.
 */
export const typeKey = (type: ValueType): string => `${type.source.replace(/\?$/, '')}${type.optional && type.kind !== 'any' && type.kind !== 'null' ? '?' : ''}`;

/**
 * The locals that rendering `nodes` may assign in its scope: each assignment, in a branch, a loop or an if-block too,
 * and the assignments of an included template (RT-21), but not the variable of a loop, which the loop restores, and
 * nothing of a block, which renders in a scope of its own.
 */
export function assignedNames(program: Program, nodes: Node[], included = new Set<string>()): Set<string> {
  const names = new Set<string>();
  const visit = (items: Node[]): void => {
    for (const node of items) {
      if (node.op === 'set') names.add(node.name);
      if (node.op === 'if') {
        for (const branch of node.branches) visit(branch.body);
        if (node.otherwise) visit(node.otherwise);
      }
      if (node.op === 'if-block') {
        visit(node.body);
        if (node.otherwise) visit(node.otherwise);
      }
      if (node.op === 'for') {
        const assignedBefore = names.has(node.name);
        visit(node.body);
        if (!assignedBefore) names.delete(node.name);
        if (node.empty) visit(node.empty);
      }
      // A template that the chain of includes renders already is a cycle, which fails with E_LOAD_CYCLE.
      if (node.op === 'include' && !included.has(node.target)) {
        for (const name of assignedNames(program, loweredTemplate(program, node.target).body, new Set([...included, node.target]))) names.add(name);
      }
    }
  };
  visit(nodes);
  return names;
}

/**
 * The text of a lowered expression in the syntax of the template (EXP-*), which names the expression in an error (T25.8):
 * a variable, a member, an index or a call with its operands, an operator between its operands, an operand that is
 * itself an operation in parentheses, and a filter as the call that it is.
 */
export function expressionText(node: Expr): string {
  const operand = (item: Expr): string => item.op === 'binary' || item.op === 'ternary' ? `(${expressionText(item)})` : expressionText(item);
  const args = (items: Expr[]): string => items.map(expressionText).join(', ');
  switch (node.op) {
    case 'literal': return node.value === null ? 'null' : typeof node.value === 'string' ? quote(node.value) : String(node.value);
    case 'to-value': return expressionText(node.value);
    case 'root': case 'local': return node.name;
    case 'loop-meta': return `${node.loop}.${node.field}`;
    case 'member': return `${operand(node.object)}.${node.key}`;
    case 'index': return `${operand(node.object)}[${expressionText(node.index)}]`;
    case 'member-call': return `${operand(node.object)}.${node.method}(${args(node.args)})`;
    case 'class-call': return `${node.className}::${node.method}(${args(node.args)})`;
    case 'call': return `${node.name}(${args(node.args)})`;
    case 'unary': return `${node.operator}${operand(node.operand)}`;
    case 'binary': return `${operand(node.left)} ${node.operator} ${operand(node.right)}`;
    case 'ternary': return `${operand(node.test)} ? ${operand(node.consequent)} : ${operand(node.otherwise)}`;
    case 'list': return `[${node.items.map(item => `${item.spread ? '...' : ''}${expressionText(item.value)}`).join(', ')}]`;
    case 'map': return `[${node.entries.map(item => item.spread ? `...${expressionText(item.value)}` : `${expressionText(item.key)} => ${expressionText(item.value)}`).join(', ')}]`;
  }
}

export function emitExpression(node: Expr, target: Target): string {
  switch (node.op) {
    case 'literal': return target.literal(node.value, node.valueType);
    case 'to-value': return target.toValue(emitExpression(node.value, target), node.value.valueType, node);
    case 'root': return target.var(fieldName(node.name), node.valueType.source, node);
    case 'local': return target.local(fieldName(node.name), node.valueType.source, node);
    case 'loop-meta': return target.loopMeta(node.loop, node.field, node);
    case 'member': return target.member(emitExpression(node.object, target), fieldName(node.key), node.object.valueType, node);
    case 'member-call': return target.memberCall(emitExpression(node.object, target), node.method, node.args.map(item => emitExpression(item, target)), node);
    case 'class-call': return target.classCall(node.className, node.method, node.args.map(item => emitExpression(item, target)), node);
    case 'index': return target.index(emitExpression(node.object, target), emitExpression(node.index, target), node.object.valueType, node);
    case 'call': return target.call(node.name, node.args.map(item => emitExpression(item, target)), node);
    case 'unary': return target.unary(node.operator, emitExpression(node.operand, target), node);
    case 'binary': return target.binary(node.operator, emitExpression(node.left, target), emitExpression(node.right, target), node);
    case 'ternary': return target.ternary(emitExpression(node.test, target), emitExpression(node.consequent, target), emitExpression(node.otherwise, target), node);
    case 'list': return target.list(node.items.map(item => ({ spread: item.spread, value: emitExpression(item.value, target), node: item.value, span: item.span })), node.valueType, node);
    case 'map': return target.map(node.entries.map((item): EmittedMapEntry => item.spread ? { spread: true, value: emitExpression(item.value, target), node: item.value, span: item.span } : { spread: false, value: [emitExpression(item.key, target), emitExpression(item.value, target)], node: item }), node.valueType, node);
  }
}

export function emitNodes(body: Node[], target: Target, level = 1): string {
  return body.map(node => {
    switch (node.op) {
      case 'text': return target.text(node.value, level, node);
      case 'echo': return target.echo(emitExpression(node.expr, target), level, node);
      case 'block': return target.block(node, level);
      case 'if-block': return target.ifBlock(node, level);
      case 'set': return target.set(node.name, emitExpression(node.expr, target), level, node);
      case 'if': return target.ifNode(node, level);
      case 'for': return target.forNode(node, level);
      case 'include': return target.include(node, level);
    }
  }).join('\n');
}

/** The methods of a target that the TypeScript, Go, Rust and PHP backends share; each backend replaces some of them. */
export type BaseTarget = Pick<Target, 'literal' | 'var' | 'local' | 'member' | 'text' | 'echo' | 'set'>;

const baseTargets: Record<'ts' | 'go' | 'rust' | 'php', BaseTarget> = {
  ts: {
    literal: value => value === null ? 'null' : typeof value === 'string' ? quote(value) : String(value),
    var: name => `assign.${name}`,
    local: name => name,
    member: (object, key) => `${object}?.${key}`,
    text: (value, level) => indent(level, `out += ${quote(value)};`),
    echo: (expression, level) => indent(level, `out += escape(stringify(${expression}));`),
    set: (name, value, level) => indent(level, `const ${fieldName(name)} = ${value};`),
  },
  go: {
    literal: (value, type) => value === null ? 'nil' : typeof value === 'string' ? goString(value) : type.kind === 'number' ? `float64(${value})` : String(value),
    var: name => `assign.${exportedName(name)}`,
    local: name => name,
    member: (object, key) => `${object}.${exportedName(key)}`,
    text: (value, level) => indent(level, `out.WriteString(${goString(value)})`),
    echo: (expression, level) => indent(level, `out.WriteString(generatedEscape(${expression}))`),
    set: (name, value, level) => indent(level, `${fieldName(name)} := ${value}\n_ = ${fieldName(name)}`),
  },
  rust: {
    literal: (value, type) => value === null ? 'GeneratedValue::Null' : typeof value === 'string' ? rustString(value) + '.to_string()' : type.kind === 'number' ? `${value}f64` : String(value),
    var: (name, type) => `assign.${name}${optional(type) ? '.clone().unwrap_or_default()' : '.clone()'}`,
    local: (name, type) => optional(type) ? `${name}.clone().unwrap_or_default()` : name,
    member: (object, key) => `${object}.${key}`,
    text: (value, level) => indent(level, `out.push_str(${rustString(value)});`),
    echo: (expression, level) => indent(level, `out.push_str(&escape(&${expression}.to_string()));`),
    set: (name, value, level) => indent(level, `let ${fieldName(name)} = ${value};`),
  },
  php: {
    literal: value => phpLiteral(value),
    var: name => `$assign->${name}`,
    local: name => `$${name}`,
    member: (object, key) => `${object}?->${key}`,
    text: (value, level) => indent(level, `$out .= ${phpString(value)};`),
    echo: (expression, level) => indent(level, `$out .= generated_escape(${expression});`),
    set: (name, value, level) => indent(level, `$${fieldName(name)} = ${value};`),
  },
};

export function baseTarget(language: keyof typeof baseTargets): BaseTarget {
  return { ...baseTargets[language] };
}

/** The emitted body of a template with the names of its function and input type. */
export interface TemplateBody {
  name: string;
  function: string;
  input: string;
  inputs: Map<string, ValueType>;
  body: string;
}

export function templateBodies(program: Program, target: Target): TemplateBody[] {
  return [...program.templates.values()].map(template => ({
    name: template.name,
    function: functionName(template.name),
    input: inputName(template.name),
    inputs: template.inputs,
    body: target.templateBody === undefined ? emitNodes(template.body, target, 1) : target.templateBody(template, 1),
  }));
}

/** The options of a compilation: the namespace of the PHP target. */
export interface CompileOptions { phpNamespace?: string }

/** What a backend emits from: the program, its type manifest, the options, the target and the template bodies. */
export interface BackendContext {
  program: Program;
  manifest: TypeManifest;
  options: CompileOptions;
  target: Target;
  templateBodies: TemplateBody[];
}

/** A backend of one target language: it creates the target of a program and emits the parts of the program. */
export interface Backend {
  readonly language: string;
  createTarget(input: { program: Program; manifest: TypeManifest }): Target;
  emitDeclarations(context: BackendContext): Part | Part[];
  emitRuntime(context: BackendContext): Part | Part[];
  emitTemplates(context: BackendContext): Part | Part[];
  emitEntry(context: BackendContext): Part | Part[];
}

/** A group of the line layout of a backend: the control characters that open it, separate its items and close it. */
export interface GroupKind { open: string; separator: string; close: string }

/** The first group that opens in `line`, by the index of its opening marker in the UTF-16 code units of the line. */
export function firstGroup<Kind extends GroupKind>(line: string, kinds: readonly Kind[]): { start: number; kind: Kind } | null {
  for (let index = 0; index < line.length; index += 1) {
    const kind = kinds.find(item => item.open === line[index]);
    if (kind !== undefined) return { start: index, kind };
  }
  return null;
}

/** The items of the group of `kind` that opens at `start` in `line`, and the index of its closing marker (-1 when none closes). */
export function splitGroup(line: string, start: number, kind: GroupKind, kinds: readonly GroupKind[]): { items: string[]; end: number } {
  const items: string[] = [];
  let depth = 0;
  let item = start + 1;
  let end = -1;
  for (let index = start + 1; index < line.length && end < 0; index += 1) {
    const character = line[index];
    if (kinds.some(other => other.open === character)) depth += 1;
    else if (kinds.some(other => other.close === character) && depth > 0) depth -= 1;
    else if (character === kind.close) end = index;
    else if (character === kind.separator && depth === 0) {
      items.push(line.slice(item, index));
      item = index + 1;
    }
  }
  items.push(line.slice(item, end));
  return { items, end };
}

/** `line` on one line: the markers of its groups removed and each separator a space. A string iterates by code point, so a character outside the Basic Multilingual Plane stays one character. */
export function flatText(line: string, kinds: readonly GroupKind[]): string {
  const markers = kinds.flatMap(kind => [kind.open, kind.separator, kind.close]);
  return Array.from(line, character => kinds.some(kind => kind.separator === character) ? ' ' : markers.includes(character) ? '' : character).join('');
}

/** The first group of `line` to split when `line` is longer than `width` flat, with its items and the index of its closing marker; null when `line` fits or has no group. */
export function groupToSplit<Kind extends GroupKind>(line: string, kinds: readonly Kind[], width: number): { start: number; kind: Kind; items: string[]; end: number } | null {
  const found = firstGroup(line, kinds);
  if (found === null || flatText(line, kinds).length <= width) return null;
  return { ...found, ...splitGroup(line, found.start, found.kind, kinds) };
}

/**
 * The lines of `line` in a backend: `line` on one line when it fits in `width` columns or holds no group; otherwise the
 * lines that `split` returns for its first group, with the indentation of `line`.
 */
export function layoutLine<Kind extends GroupKind>(
  line: string, kinds: readonly Kind[], width: number,
  split: (group: { start: number; kind: Kind; items: string[]; end: number; indentation: string }) => string[],
): string[] {
  const found = groupToSplit(line, kinds, width);
  if (found === null) return [flatText(line, kinds)];
  return split({ ...found, indentation: /^ */.exec(line)?.[0] ?? '' });
}

/**
 * The definitions of the program as the descriptors that a backend embeds: the field, the target template, the HTML and the
 * type of each input of the template; `extra` adds the fields of the backend after the HTML.
 */
export function definitionDescriptors<Extra extends object>(program: Program, extra: (template: string | null) => Extra): Record<string, { field: string; target: string | null; html: boolean; input: Record<string, Descriptor> } & Extra> {
  return Object.fromEntries([...program.definitions].map(([id, definition]) => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    ...extra(definition.template),
    input: definition.template === null ? {} : Object.fromEntries([...loweredTemplate(program, definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
}
