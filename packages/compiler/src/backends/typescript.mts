// The TypeScript backend. The generated program states the type of every value without an assertion: a value of a
// type of the type manifest has its TypeScript type (tsOf), a value that the runtime of @polyspec/template returns is a
// Value, and the program converts between the two where they meet: `encode` turns a typed value into a Value, which
// copies only a value that holds a record, and `decode` checks a Value and returns the typed value, or throws an error
// that names the value by its text in the template. A local is a variable of its typed value (FunctionLocals), so a
// Value is decoded once, where it enters the program from the runtime, the scope or the request, and never on a read.
import {
  assignedNames, baseTarget, definition, dependent, descriptor, emitExpression, emitNodes, expressionText, fieldName, FunctionLocals,
  functionName, indent, inputName, quote,
  type BackendContext, type Descriptor, type MergedLocal, type Part, type Target,
} from '../backend-support.mts';
import { loweredTemplate, type BlockInput, type Expr, type Node, type NodeOf, type Program, type ValueType } from '../ir.mts';

export const language = 'ts';

/** Whether a type admits null besides its values: an optional type other than any and null, which admit it anyway. */
const nullable = (type: Descriptor): boolean => type.optional && type.kind !== 'any' && type.kind !== 'null';

/** The TypeScript type of a value of `type`: an optional value may be null, and a value of any is a Value. */
function tsOf(type: Descriptor): string {
  const base = type.kind === 'any' ? 'Value'
    : type.kind === 'record' ? type.name
    : type.kind === 'list' ? `Array<${tsOf(type.item)}>`
    : type.kind === 'map' ? `Map<string, ${tsOf(type.value)}>`
    : type.kind;
  return nullable(type) ? `${base} | null` : base;
}

/** Whether a value of `type` is a Value as it is: it holds no record. */
function isValue(type: Descriptor): boolean {
  if (type.kind === 'record') return false;
  if (type.kind === 'list') return isValue(type.item);
  if (type.kind === 'map') return isValue(type.value);
  return true;
}

const span = (node: { span: readonly number[] }): string => quote(node.span);

const recordDecoder = (name: string): string => `generatedDecode_${fieldName(name)}`;
const recordEncoder = (name: string): string => `generatedEncode_${fieldName(name)}`;

/** The function that checks a Value as a value of `type` and returns it: (value, path) => value. */
function decoderOf(type: Descriptor): string {
  const required = type.kind === 'any' ? 'generatedAny'
    : type.kind === 'null' ? 'generatedNull'
    : type.kind === 'record' ? recordDecoder(type.name)
    : type.kind === 'list' ? `generatedListOf(${decoderOf(type.item)})`
    : type.kind === 'map' ? `generatedMapOf(${decoderOf(type.value)})`
    : `generated${type.kind.slice(0, 1).toUpperCase()}${type.kind.slice(1)}`;
  return nullable(type) ? `generatedOptional(${required})` : required;
}

/** The code of the value of `type` that the Value `code` holds; `path` is the code of the name of the value in an error. */
function decode(code: string, type: Descriptor, path: string): string {
  return type.kind === 'any' ? code : `${decoderOf(type)}(${code}, ${path})`;
}

/**
 * The code of the value of `type` that the Value `code` holds while the program renders: a value of another type fails
 * with E_RUNTIME_TYPE at the position of `node`. A decoder only checks, so every error that it throws is such a failure;
 * while the program binds a request, the same error reaches the host as an argument error.
 */
function check(code: string, type: Descriptor, path: string, node: { span: readonly number[] }): string {
  return type.kind === 'any' ? code : `generatedChecked(${decoderOf(type)}, ${code}, ${path}, runtime, frame, ${span(node)})`;
}

/** The function that turns a value of `type`, which holds a record, into a Value. */
function encoderOf(type: Descriptor): string {
  const required = type.kind === 'record' ? recordEncoder(type.name)
    : type.kind === 'list' ? `generatedEncodeList(${encoderOf(type.item)})`
    : type.kind === 'map' ? `generatedEncodeMap(${encoderOf(type.value)})`
    : null;
  if (required === null) throw new Error(`compiler backend ts: a value of ${tsOf(type)} holds no record and is a Value as it is`);
  return nullable(type) ? `generatedEncodeOptional(${required})` : required;
}

/** The code of the Value of the value `code` of `type`. */
function encode(code: string, type: Descriptor): string {
  return isValue(type) ? code : `${encoderOf(type)}(${code})`;
}

/**
 * The code of the value `code` of `from` as a value of `to` while the program renders: the value itself when its
 * TypeScript type is that of `to`, or of `to` without null, and otherwise its Value, checked when `to` is no Value.
 */
function convert(code: string, from: Descriptor, to: Descriptor, path: string, node: { span: readonly number[] }): string {
  if (tsOf(from) === tsOf(to) || tsOf({ ...from, optional: true }) === tsOf(to)) return code;
  if (to.kind === 'any') return encode(code, from);
  return check(encode(code, from), to, path, node);
}


export function createTarget({ program }: { program: Program }): Target {
  let locals = new FunctionLocals([]);
  // The item variable of each enclosing loop, innermost last.
  const loopItems: [loop: string, item: string][] = [];
  const valueOf = (value: string, type: ValueType): string => encode(value, type);
  const values = (args: string[], nodes: { valueType: ValueType }[]): string => `[${args.map((arg, index) => {
    const node = nodes[index];
    if (node === undefined) throw new Error('compiler backend ts: an argument has no expression');
    return valueOf(arg, node.valueType);
  }).join(', ')}]`;
  // The name of an intermediate value in an error: the text of its expression in the template.
  const label = (node: Expr): string => quote(expressionText(node));
  // The variables that hold the merged locals after a branch or a loop, declared before it with the value before it.
  const declare = (merged: MergedLocal[], node: { span: readonly number[] }): string[] => merged.map(item =>
    `let ${item.variable}: ${tsOf(item.type)} = ${convert(item.before.code, item.before.type, item.type, quote(item.name), node)};`);
  // The statements at the end of a branch or a loop body that give each merged local the value that it has there.
  const assignMerged = (merged: MergedLocal[], node: { span: readonly number[] }, except: string | null = null): string[] => merged.flatMap(item => {
    const end = locals.bindings.get(item.name);
    if (end === undefined) throw new Error(`compiler backend ts: local ${item.name} has no binding`);
    return item.name === except || end.code === item.variable ? [] : [`${item.variable} = ${convert(end.code, end.type, item.type, quote(item.name), node)};`];
  });
  // The statements of a branch at level `n`, which end by giving each merged local its value.
  const branch = (nodes: Node[], n: number, merged: MergedLocal[], node: { span: readonly number[] }, except: string | null = null): string =>
    [emitNodes(nodes, target, n), ...assignMerged(merged, node, except).map(line => indent(n, line))].filter(line => line !== '').join('\n');
  // A branching node that may assign locals: each branch starts from the bindings before it, and the locals hold the
  // merged values after it.
  const branching = (merged: MergedLocal[], node: { span: readonly number[] }, n: number, emit: (body: (nodes: Node[]) => string) => string): string => {
    const start = locals.save();
    const code = emit(nodes => {
      locals.restore(start);
      return branch(nodes, n + 1, merged, node);
    });
    locals.restore(start);
    locals.enter(merged);
    return [...declare(merged, node).map(line => indent(n, line)), code].join('\n');
  };
  // A block of a definition or of a path: its input takes each field from the block scope, the data of the definition
  // or the root, in this order of precedence, and an optional field that none of them gives is null.
  const block = (node: NodeOf<'block'>, n: number): string => {
    if (node.target === null) return indent(n, `{ const definition = definitions.${fieldName(node.id)};\nif (definition?.html === undefined) throw runtime.error(frame, ${span(node)}, 'E_RUNTIME_BLOCK_UNDEFINED', ${quote(`define ${node.id} is not registered`)});\ncontext.at(frame, ${span(node)}); context.output.write(definition.html);\n}`);
    const blockTarget = node.target;
    const field = (item: BlockInput): string => {
      const name = fieldName(item.name);
      const path = quote(`${blockTarget}.${item.name}`);
      if (item.scope !== null) return `${name}: ${convert(emitExpression(item.scope, target), item.scope.valueType, item.valueType, path, node)}`;
      const fallback = item.root !== null ? convert(emitExpression(item.root, target), item.root.valueType, item.valueType, path, node)
        : item.valueType.optional ? 'null'
        : `generatedThrow(runtime.error(frame, ${span(node)}, 'E_RUNTIME_TYPE', ${quote(`generated input ${blockTarget}.${item.name} is missing`)}))`;
      return node.id === null ? `${name}: ${fallback}` : `${name}: definition?.data?.${name} !== undefined ? definition.data.${name} : ${fallback}`;
    };
    const input = `const input: ${inputName(blockTarget)} = { ${node.inputs.map(field).join(', ')} };`;
    const call = `${functionName(blockTarget)}(assign, definitions, input, context, runtime, rootData, blockScope)`;
    const render = `const blockScope = new Scope(); context.enter(${quote(blockTarget)}, frame, ${span(node)}); try { ${call}; } finally { context.leave(); }`;
    if (node.id === null) return indent(n, `{ ${input}\n${render}\n}`);
    const registration = node.path === null
      ? `if (definition === undefined) throw runtime.error(frame, ${span(node)}, 'E_RUNTIME_BLOCK_UNDEFINED', ${quote(`define ${node.id} is not registered`)});`
      : `if (definition === undefined) { definition = { template: ${quote(blockTarget)} }; definitions.${fieldName(node.id)} = definition; } else if (definition.html !== undefined || definition.template !== ${quote(blockTarget)}) throw runtime.error(frame, ${span(node)}, 'E_RUNTIME_BLOCK_REDEFINED', ${quote(`define ${node.id} is registered with a different template`)});`;
    return indent(n, `{ let definition = definitions.${fieldName(node.id)};\n${registration}\nif (definition?.html !== undefined) { context.at(frame, ${span(node)}); context.output.write(definition.html); }\nelse { ${input} ${render} }\n}`);
  };
  // A loop iterates the entries of a typed list or map as they are, and the entries of a Value through the runtime; its
  // item is a variable of the type of the items, which the body reads without a check.
  const forNode = (node: NodeOf<'for'>, n: number): string => {
    const name = fieldName(node.name);
    const entries = `${name}_entries`;
    const iter = emitExpression(node.iter, target);
    const iterate = node.iter.valueType.kind === 'any' ? `runtime.entries(${iter}, frame, ${span(node)})` : `generatedEntries(${iter})`;
    // The body reads the locals that it assigns as the IR widens them; the loop restores its variable.
    const names = assignedNames(program, node.body);
    names.delete(node.name);
    for (const item of assignedNames(program, node.empty ?? [])) names.add(item);
    const merged = locals.merged(names, node.widened);
    const declarations = declare(merged, node);
    locals.enter(merged);
    const start = locals.save();
    const item = locals.variable(node.name);
    locals.bindings.set(node.name, { code: item, type: node.itemType });
    loopItems.push([node.name, item]);
    const body = branch(node.body, n + 1, merged, node, node.name);
    loopItems.pop();
    locals.restore(start);
    const empty = node.empty ? branch(node.empty, n + 1, merged, node) : null;
    locals.restore(start);
    // The loop declares the metadata that its body reads, and no other.
    const uses = (meta: string): boolean => new RegExp(`\\b${name}_${meta}\\b`).test(body);
    const indexed = uses('index') || uses('first') || uses('last');
    const lastIndex = uses('last') ? ` const ${name}_last_index = ${name}_size - 1;` : '';
    const first = uses('first') ? `\n    const ${name}_first = ${name}_index === 0;` : '';
    const last = uses('last') ? `\n    const ${name}_last = ${name}_index === ${name}_last_index;` : '';
    const entry = `[${uses('key') ? `${name}_key` : ''}, ${item}]`;
    const loop = indexed ? `for (const [${name}_index, ${entry}] of ${entries}.entries())` : `for (const ${entry} of ${entries})`;
    return [...declarations.map(line => indent(n, line)), indent(n, `{ const ${entries} = ${iterate};\nconst ${name}_size = ${entries}.length;${lastIndex}\nconst ${name}_previous = scope.locals.get(${quote(node.name)});\ntry {\n${loop} {\n    scope.locals.set(${quote(node.name)}, ${valueOf(item, node.itemType)});${first}${last}\n    context.iterations += 1;\n    runtime.limit('iteration', context.iterations, frame, ${span(node)});\n${body}\n}\n} finally { if (${name}_previous !== undefined) scope.locals.set(${quote(node.name)}, ${name}_previous); else scope.locals.delete(${quote(node.name)}); }${empty === null ? '' : `\nif (${name}_size === 0) {\n${empty}\n}`}\n}`)].join('\n');
  };
  const loopItem = (loop: string): string => {
    const item = loopItems.findLast(([name]) => name === loop);
    if (item === undefined) throw new Error(`compiler backend ts: loop ${loop} has no item`);
    return item[1];
  };
  const target: Target = {
    ...baseTarget(language),
    var: (name, type, node) => program.dynamicRoot
      ? check(node.scope ? `scope.lookup(frame, ${quote(name)})` : `runtime.member(rootData, ${quote(name)}, frame, ${span(node)})`, descriptor(type), quote(name), node)
      : `assign.${name}`,
    local: (_name, _type, node) => locals.read(node).code,
    set: (_name, value, level, node) => {
      const variable = locals.variable(node.name);
      locals.bindings.set(node.name, { code: variable, type: node.expr.valueType });
      return indent(level, `const ${variable}: ${tsOf(node.expr.valueType)} = ${value};\nscope.locals.set(${quote(node.name)}, ${valueOf(variable, node.expr.valueType)});`);
    },
    member: (object, key, owner, node) => owner.kind === 'any' ? `runtime.member(${object}, ${quote(key)}, frame, ${span(node)})`
      : owner.optional ? `((${object})?.${key} ?? null)` : `(${object}).${key}`,
    text: (value, level, node) => indent(level, `context.at(frame, ${span(node)}); context.output.write(${quote(value)});`),
    echo: (expression, level, node) => indent(level, `context.at(frame, ${span(node)}); context.output.write(runtime.escape(${valueOf(expression, node.expr.valueType)}, frame, ${span(node.expr)}));`),
    block,
    // An if-block keeps the types of the locals that it assigns (the IR does not widen them).
    ifBlock: (node, n) => branching(locals.merged(assignedNames(program, [...node.body, ...node.otherwise ?? []]), null), node, n, body =>
      indent(n, `if (definitions.${fieldName(node.id)} !== undefined) {`) + `\n${body(node.body)}\n${indent(n, '}')}${node.otherwise ? ` else {\n${body(node.otherwise)}\n${indent(n, '}')}` : ''}`),
    loopMeta: (loop, field) => field === 'value_' ? loopItem(loop) : `${fieldName(loop)}_${field.replace(/_$/, '')}`,
    index: (object, index, _owner, node) => check(`runtime.index(${valueOf(object, node.object.valueType)}, ${valueOf(index, node.index.valueType)}, frame, ${span(node)})`, node.valueType, label(node), node),
    memberCall: (object, method, args, node) => `runtime.memberCall(${valueOf(object, node.object.valueType)}, ${quote(method)}, ${values(args, node.args)}, frame, ${span(node)})`,
    classCall: (className, method, args, node) => check(`runtime.classCall(${quote(className)}, ${quote(method)}, ${values(args, node.args)}, frame, ${span(node)})`, node.valueType, label(node), node),
    toValue: (value, type) => encode(value, type),
    call: (name, args, node) => check(`runtime.call(${quote(name)}, ${values(args, node.args)}, frame, ${span(node)})`, node.valueType, label(node), node),
    unary: (operator, operand, node) => check(`runtime.unary(${quote(operator)}, ${valueOf(operand, node.operand.valueType)}, frame, ${span(node)})`, node.valueType, label(node), node),
    binary: (operator, left, right, node) => {
      const leftValue = valueOf('left', node.left.valueType);
      if (operator === '&&') return `(() => { const left = ${left}; return runtime.truthy(${leftValue}) ? runtime.truthy(${valueOf(right, node.right.valueType)}) : false; })()`;
      if (operator === '||') return `(() => { const left = ${left}; return runtime.truthy(${leftValue}) ? true : runtime.truthy(${valueOf(right, node.right.valueType)}); })()`;
      // `??` returns an operand: the merged type is the type of both, or any, which holds the Value of either.
      if (operator === '??') return node.valueType.kind === 'any'
        ? `(() => { const left = ${left}; return left !== null ? ${leftValue} : ${valueOf(right, node.right.valueType)}; })()`
        : `(() => { const left = ${left}; return left !== null ? left : ${right}; })()`;
      return check(`runtime.binary(${quote(operator)}, ${valueOf(left, node.left.valueType)}, ${valueOf(right, node.right.valueType)}, frame, ${span(node)})`, node.valueType, label(node), node);
    },
    ternary: (test, consequent, otherwise, node) => node.valueType.kind === 'any'
      ? `(runtime.truthy(${valueOf(test, node.test.valueType)}) ? ${valueOf(consequent, node.consequent.valueType)} : ${valueOf(otherwise, node.otherwise.valueType)})`
      : `(runtime.truthy(${valueOf(test, node.test.valueType)}) ? ${consequent} : ${otherwise})`,
    list: (items, valueType, node) => check(`runtime.depth([${items.map(item => item.spread ? `...runtime.listSpread(${valueOf(item.value, item.node.valueType)}, frame, ${span(item)})` : valueOf(item.value, item.node.valueType)).join(', ')}], frame, ${span(node)})`, valueType, label(node), node),
    map: (entries, valueType, node) => check(`runtime.depth(new Map<string, Value>([${entries.map(item => item.spread ? `...runtime.mapSpread(${valueOf(item.value, item.node.valueType)}, frame, ${span(item)})` : `[runtime.stringify(${valueOf(item.value[0], item.node.key.valueType)}, frame, ${span(item.node.key)}), ${valueOf(item.value[1], item.node.value.valueType)}]`).join(', ')}]), frame, ${span(node)})`, valueType, label(node), node),
    // The tests read the locals before the if; a branch that assigns a local widens it as the IR does.
    ifNode: (node, n) => {
      const tested = node.branches.map(item => ({ test: valueOf(emitExpression(item.test, target), item.test.valueType), statements: item.body }));
      return branching(locals.merged(assignedNames(program, [node]), node.widened), node, n, body =>
        tested.map(({ test, statements }, index) => `${index === 0 ? indent(n, 'if') : `${indent(n, '}')} else if`} (runtime.truthy(${test})) {\n${body(statements)}`).join('\n')
        + `\n${indent(n, '}')}${node.otherwise ? ` else {\n${body(node.otherwise)}\n${indent(n, '}')}` : ''}`);
    },
    forNode,
    // An include may assign the locals of its caller in the shared scope (RT-21): each local that it may assign is
    // decoded once from the scope after it.
    include: (node, n) => {
      const call = `context.enter(${quote(node.target)}, frame, ${span(node)});\ntry { ${functionName(node.target)}(assign, definitions, { ${node.inputs.map(item => `${fieldName(item.name)}: ${convert(emitExpression(item.value, target), item.value.valueType, item.valueType, quote(`${node.target}.${item.name}`), node)}`).join(', ')} }, context, runtime, rootData, scope); } finally { context.leave(); }`;
      const refreshed = [...assignedNames(program, [node])].flatMap(name => {
        const before = locals.bindings.get(name);
        if (before === undefined) return [];
        const variable = locals.variable(name, true);
        locals.bindings.set(name, { code: variable, type: before.type });
        return [`const ${variable} = ${check(`scope.lookup(frame, ${quote(name)})`, before.type, quote(name), node)};`];
      });
      return indent(n, [call, ...refreshed].join('\n'));
    },
    // The inputs of the template are the fields of its input, and the body reads each local from its variable.
    templateBody: (template, level) => {
      locals = new FunctionLocals([...template.inputs].map(([name, type]) => [name, { code: `input.${fieldName(name)}`, type }]));
      return locals.prune(emitNodes(template.body, target, level));
    },
  };
  return target;
}

/** The fields of an interface, one per line, each with the TypeScript type of its type. */
const interfaceFields = (fields: [string, Descriptor][]): string => fields.map(([name, type]) => `  ${name}: ${tsOf(type)};`).join('\n');

/** The decoder of a record: a map with a value of each field, checked by the type of the field. */
const recordDecoderCode = (name: string, type: string, fields: [string, Descriptor][]): string =>
  `function ${name}(value: Value | undefined, path: string): ${type} { const object = generatedObject(value, path); return { ${fields.map(([field, fieldType]) => `${field}: ${decode(`object.get(${quote(field)})`, fieldType, `path + ${quote(`.${field}`)}`)}`).join(', ')} }; }`;

/** The decoder of the data of a definition: each field that the map has, checked by the type of the input. */
const dataDecoderCode = (input: string, fields: [string, Descriptor][]): string => fields.length === 0
  ? `function generatedDecodeData_${input}(value: Value, path: string): DefinitionData<${input}> { generatedDataObject(value, path); return {}; }`
  : `function generatedDecodeData_${input}(value: Value, path: string): DefinitionData<${input}> { const object = generatedDataObject(value, path); const data: DefinitionData<${input}> = {}; ${fields.map(([field, fieldType]) => `if (object.has(${quote(field)})) data.${fieldName(field)} = ${decode(`object.get(${quote(field)})`, fieldType, `path + ${quote(`.${field}`)}`)};`).join(' ')} return data; }`;

/** The encoder of a record: the map of the Value of each field. */
const recordEncoderCode = (name: string, fields: [string, Descriptor][]): string =>
  `function ${recordEncoder(name)}(value: ${name}): Value { return new Map<string, Value>([${fields.map(([field, fieldType]) => `[${quote(field)}, ${encode(`value.${field}`, fieldType)}]`).join(', ')}]); }`;

const fieldsOf = (fields: Record<string, string>): [string, Descriptor][] => Object.entries(fields).map(([name, type]) => [name, descriptor(type)]);

export function emitDeclarations(context: BackendContext): Part[] {
  const { program, manifest, templateBodies } = context;
  const tsRecords = Object.entries(manifest.records).map(([name, members]) => `export interface ${name} {\n${interfaceFields(fieldsOf(members))}\n}`).join('\n');
  const assignType = program.dynamicRoot ? 'export type Assign = MapValue;' : `export interface Assign {\n${interfaceFields(fieldsOf(manifest.fields))}\n}`;
  const inputTypes = templateBodies.map(template => `export interface ${template.input} { ${[...template.inputs].map(([name, type]) => `${fieldName(name)}: ${tsOf(type)};`).join(' ')} }`).join('\n');
  const definitionsType = `export type DefinitionData<T> = Partial<T>;\nexport interface Definition<T> { template?: string; html?: string; data?: DefinitionData<T>; }\nexport interface Definitions { ${[...program.definitions].map(([name, definition]) => `${fieldName(name)}?: Definition<${definition.template !== null ? inputName(definition.template) : 'Record<never, never>'}>;`).join(' ')} }`;
  const names = ['BindError', 'Frame', 'RenderContext', 'RuntimeBindings', 'RuntimeEnvironment', 'Scope', 'TemplateError', 'bindData', 'bindMap', 'checkText', 'internalBoundary', 'type MapValue', 'type PreparedRender', 'type Program', 'type RenderOptions', 'type Span', 'type Template', 'type Value'];
  // The import names what the program uses of the package.
  const imports = dependent(text => `import { ${names.filter(name => new RegExp(`\\b${name.replace('type ', '')}\\b`).test(text)).join(', ')} } from '@polyspec/template';`);
  return ['// Generated.', imports, `${tsRecords}\n${assignType}\n${inputTypes}\n${definitionsType}\nexport interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }`];
}

/** The binding of a definition of the request that the program declares, as a case of its id. */
function definitionCase(id: string, template: string | null, html: boolean): string {
  const field = fieldName(id);
  const invalidTemplate = `throw new Error(${quote(`define.${id} has an invalid template`)});`;
  const invalidHtml = `throw new Error(${quote(`define.${id} has an invalid html entry`)});`;
  const registerHtml = `definitions.${field} = { html }; targets.set(${quote(id)}, { target: null, html }); break;`;
  const htmlEntry = html ? `if (template !== undefined || data !== undefined) ${invalidHtml}\n        ${registerHtml}` : invalidHtml;
  // A definition without a template accepts no template entry, so an entry that is no HTML ends in an error.
  const templateEntry = template === null ? invalidTemplate
    : `if (template !== ${quote(template)}) ${invalidTemplate}\n      definitions.${field} = { template: ${quote(template)}, data: data === undefined ? {} : generatedDecodeData_${inputName(template)}(data, ${quote(`define.${id}.data`)}) }; targets.set(${quote(id)}, { target: ${quote(template)} }); break;`;
  const stringEntry = template === null ? invalidTemplate
    : `if (raw !== ${quote(template)}) ${invalidTemplate}\n        definitions.${field} = { template: ${quote(template)} }; targets.set(${quote(id)}, { target: ${quote(template)} }); break;`;
  return `case ${quote(id)}: {
      if (typeof raw === 'string') {
        ${stringEntry}
      }
      if (typeof raw !== 'object' || raw === null) throw new Error(${quote(`define.${id} is not an object`)});
      const template = 'template' in raw ? raw.template : undefined;
      const html = 'html' in raw ? raw.html : undefined;
      const data = 'data' in raw && raw.data !== undefined ? bindData(raw.data) : undefined;
      if (typeof html === 'string') {
        ${htmlEntry}
      }
      ${templateEntry}
    }`;
}

export function emitRuntime(context: BackendContext): Part[] {
  const { manifest, program } = context;
  const records = Object.entries(manifest.records).map(([name, fields]): [string, [string, Descriptor][]] => [name, fieldsOf(fields)]);
  const bindAssign = program.dynamicRoot
    ? `function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: root, root }; }`
    : `function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: generatedDecodeAssign(root, 'assign'), root }; }`;
  const dataInputs = [...new Set([...program.definitions.values()].flatMap(item => item.template === null ? [] : [item.template]))]
    .map(template => definition(`generatedDecodeData_${inputName(template)}`, dataDecoderCode(inputName(template), [...loweredTemplate(program, template).inputs])));
  const cases = [...program.definitions].map(([id, item]) => definitionCase(id, item.template, item.html)).join('\n    ');
  // A helper is kept only when the program uses it.
  return [
    definition('GeneratedDecoder', 'type GeneratedDecoder<T> = (value: Value | undefined, path: string) => T;'),
    definition('generatedThrow', 'function generatedThrow(error: Error): never { throw error; }'),
    definition('generatedTypeError', `function generatedTypeError(value: Value | undefined, path: string, expected: string): Error { return new Error(value === null || value === undefined ? path + ' is required' : path + ' is not ' + expected); }`),
    definition('generatedChecked', `function generatedChecked<T>(decode: GeneratedDecoder<T>, value: Value, path: string, runtime: RuntimeBindings, frame: Frame, span: Span): T { try { return decode(value, path); } catch (error) { if (error instanceof Error) throw runtime.error(frame, span, 'E_RUNTIME_TYPE', error.message); throw error; } }`),
    definition('generatedDataObject', 'function generatedDataObject(value: Value, path: string): MapValue { if (value instanceof Map) return value; throw new Error(path + \' is not an object\'); }'),
    definition('generatedPlain', 'function generatedPlain(value: unknown): value is object { if (typeof value !== \'object\' || value === null) return false; const prototype = Reflect.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }'),
    definition('generatedObject', 'function generatedObject(value: Value | undefined, path: string): MapValue { if (value instanceof Map) return value; throw generatedTypeError(value, path, \'an object\'); }'),
    definition('generatedAny', 'function generatedAny(value: Value | undefined): Value { return value ?? null; }'),
    definition('generatedNull', `function generatedNull(value: Value | undefined, path: string): null { if (value === null || value === undefined) return null; throw new Error(path + ' is not null'); }`),
    definition('generatedString', `function generatedString(value: Value | undefined, path: string): string { if (typeof value === 'string') return value; throw generatedTypeError(value, path, 'a string'); }`),
    definition('generatedNumber', `function generatedNumber(value: Value | undefined, path: string): number { if (typeof value === 'number') return value; throw generatedTypeError(value, path, 'a number'); }`),
    definition('generatedBoolean', `function generatedBoolean(value: Value | undefined, path: string): boolean { if (typeof value === 'boolean') return value; throw generatedTypeError(value, path, 'a boolean'); }`),
    definition('generatedOptional', 'function generatedOptional<T>(decode: GeneratedDecoder<T>): GeneratedDecoder<T | null> { return (value, path) => value === null || value === undefined ? null : decode(value, path); }'),
    definition('generatedListOf', `function generatedListOf<T>(item: GeneratedDecoder<T>): GeneratedDecoder<T[]> { return (value, path) => { if (Array.isArray(value)) return value.map((element, index) => item(element, path + '[' + index + ']')); throw generatedTypeError(value, path, 'a list'); }; }`),
    definition('generatedMapOf', `function generatedMapOf<T>(item: GeneratedDecoder<T>): GeneratedDecoder<Map<string, T>> { return (value, path) => new Map([...generatedObject(value, path)].map(([key, element]): [string, T] => [key, item(element, path + '.' + key)])); }`),
    definition('generatedEntries', 'function generatedEntries<T>(value: T[] | Map<string, T> | null): [Value, T][] { if (value === null) return []; if (Array.isArray(value)) return value.map((item, index): [Value, T] => [index, item]); return [...value]; }'),
    definition('generatedEncodeOptional', 'function generatedEncodeOptional<T>(encode: (value: T) => Value): (value: T | null) => Value { return value => value === null ? null : encode(value); }'),
    definition('generatedEncodeList', 'function generatedEncodeList<T>(encode: (value: T) => Value): (value: T[]) => Value { return value => value.map(item => encode(item)); }'),
    definition('generatedEncodeMap', 'function generatedEncodeMap<T>(encode: (value: T) => Value): (value: Map<string, T>) => Value { return value => new Map([...value].map(([key, item]): [string, Value] => [key, encode(item)])); }'),
    ...records.map(([name, fields]) => definition(recordDecoder(name), recordDecoderCode(recordDecoder(name), name, fields))),
    ...records.map(([name, fields]) => definition(recordEncoder(name), recordEncoderCode(name, fields))),
    ...(program.dynamicRoot ? [] : [definition('generatedDecodeAssign', recordDecoderCode('generatedDecodeAssign', 'Assign', fieldsOf(manifest.fields)))]),
    ...dataInputs,
    bindAssign,
    `type GeneratedTarget = { target: string | null; html?: string };\ntype GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, GeneratedTarget> };`,
    definition('generatedBindDefinitions', `function generatedBindDefinitions(input: unknown): GeneratedBoundDefinitions {
  const definitions: Definitions = {};
  const targets = new Map<string, GeneratedTarget>();
  if (input === undefined || input === null) return { definitions, targets };
  if (!generatedPlain(input)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'define is not an object');
  const entries: [string, unknown][] = Object.entries(input);
  for (const [id, raw] of entries) {
    checkText(id);
    switch (id) {
    ${cases}
    default: throw new Error('define.' + id + ' is not declared');
    }
  }
  return { definitions, targets };
}`),
  ];
}

export function emitTemplates(context: BackendContext): string {
  const { program, templateBodies } = context;
  return templateBodies.map(template => {
    const typed = loweredTemplate(program, template.name);
    const body = `  const frame = new Frame(${quote(template.name)}, ${quote(typed.lines)}, rootData);\n${[...template.inputs].map(([name, type]) => `  scope.locals.set(${quote(name)}, ${encode(`input.${fieldName(name)}`, type)});`).join('\n')}\n${template.body}`;
    // A parameter that the body does not read is named with a leading `_`, the convention of an unused parameter.
    const parameter = (name: string, type: string): string => `${new RegExp(`\\b${name}\\b`).test(body) ? name : `_${name}`}: ${type}`;
    const parameters = ([['assign', 'Assign'], ['definitions', 'Definitions'], ['input', template.input], ['context', 'RenderContext'], ['runtime', 'RuntimeBindings'], ['rootData', 'MapValue'], ['scope', 'Scope']] satisfies [string, string][]).map(([name, type]) => parameter(name, type)).join(', ');
    return `function ${template.function}(${parameters}): void {\n${body}\n}`;
  }).join('\n');
}

export function emitEntry(context: BackendContext): string {
  const { templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `    case ${quote(template.name)}: ${template.function}(assign, definitions, {}, context, runtime, rootData, scope); return;`).join('\n');
  return `function renderTemplate(target: string, assign: Assign, definitions: Definitions, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {\n  switch (target) {\n${dispatch}\n    default: throw context.fail('E_LOAD_NOT_FOUND', null, null, 'template ' + target + ' does not exist');\n  }\n}\nfunction generatedEnv(input: unknown): { timezone: string; now: number } { if (input === undefined || input === null) return { timezone: 'Z', now: Math.floor(Date.now() / 1000) }; if (!generatedPlain(input)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object'); const timezone = ('timezone' in input ? input.timezone : undefined) ?? 'Z'; const now = ('now' in input ? input.now : undefined) ?? Math.floor(Date.now() / 1000); if (typeof timezone !== 'string') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string'); if (typeof now !== 'number') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number'); return { timezone, now }; }\nclass GeneratedPreparedRender implements PreparedRender { private readonly name: string; private readonly execute: () => string; constructor(name: string, execute: () => string) { this.name = name; this.execute = execute; } render(): string { return internalBoundary(this.name, this.execute); } }\nexport class GeneratedProgram implements Program {\n  readonly runtime: RuntimeEnvironment;\n  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }\n  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); return internalBoundary(target, () => this.prepareBound(target, assign, options)); }\n  private prepareBound(target: string, assign: unknown, options: RenderOptions): PreparedRender { let boundAssign: { assign: Assign; root: MapValue }; let bound: GeneratedBoundDefinitions; let env: { timezone: string; now: number }; try { boundAssign = generatedBindAssign(assign); bound = generatedBindDefinitions(options.define); env = generatedEnv(options.env); } catch (error) { if (error instanceof BindError) throw new TemplateError({ code: error.code, template: target, line: 0, col: 0, offset: 0, end: 0, message: error.message }); throw error; } const registered = bound.targets.get(target); const html = registered?.html; if (html !== undefined) return new GeneratedPreparedRender(target, () => html); const targetName = registered?.target ?? target; return new GeneratedPreparedRender(target, () => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); const scope = new Scope(); context.enter(targetName, null, null); try { renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root, scope); return context.output.toString(); } finally { context.leave(); } }); }\n  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }\n}`;
}
