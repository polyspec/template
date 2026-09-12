import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField, tsType,
} from '../backend-support.mjs';

export const language = 'ts';

function descriptor(source) {
  const optionalType = source.endsWith('?');
  const value = optionalType ? source.slice(0, -1) : source;
  const list = /^list<(.+)>$/.exec(value);
  if (list) return { kind: 'list', item: descriptor(list[1]), optional: optionalType };
  const map = /^map<([^,]+),(.+)>$/.exec(value);
  if (map) return { kind: 'map', key: descriptor(map[1].trim()), value: descriptor(map[2].trim()), optional: optionalType };
  if (['null', 'boolean', 'number', 'string', 'any'].includes(value)) return { kind: value, optional: optionalType };
  return { kind: 'record', name: value, optional: optionalType };
}

function bindingSchema(context) {
  const { manifest, program } = context;
  const records = Object.fromEntries(Object.entries({ ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) })
    .map(([name, fields]) => [name, Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, descriptor(type)]))]));
  const assign = Object.fromEntries(Object.entries(manifest.fields ?? {}).map(([field, type]) => [field, descriptor(type)]));
  const definitions = Object.fromEntries([...program.definitions].map(([id, definition]) => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    input: definition.template === null ? {} : Object.fromEntries([...program.templates.get(definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
  return { records, assign, definitions };
}

export function createTarget({ program }) {
  const target = baseTarget(language);
  target.var = (name, _type, node) => program.dynamicRoot ? node.scope ? `scope.lookup(frame, ${quote(name)})` : `runtime.member(rootData, ${quote(name)})` : `assign.${name}`;
  target.local = (name, type) => `scope.lookup(frame, ${quote(name)}) as unknown as ${tsType(type)}`;
  target.set = (name, value, level) => indent(level, `scope.locals.set(${quote(name)}, ${value} as unknown as Value);`);
  target.member = (object, key, owner) => owner.kind === 'any' ? `runtime.member(${object} as unknown as Value, ${quote(key)})` : `(${object})?.${key}`;
  target.text = (value, level, node) => indent(level, `context.at(frame, ${quote(node.span)}); context.output.write(${quote(value)});`);
  target.echo = (expression, level, node) => indent(level, `context.at(frame, ${quote(node.span)}); context.output.write(runtime.escape(${expression} as unknown as Value, frame, ${quote(node.expr.span)}));`);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `{ const definition = definitions.${fieldName(node.id)};\nif (definition?.html === undefined) throw runtime.error(frame, ${quote(node.span)}, 'E_RUNTIME_BLOCK_UNDEFINED', ${quote(`define ${node.id} is not registered`)});\ncontext.at(frame, ${quote(node.span)}); context.output.write(definition.html);\n}`);
    const base = node.inputs.filter(item => item.root).map(item => `${fieldName(item.name)}: ${emitExpression(item.root, target)}`);
    const scoped = node.inputs.filter(item => item.scope).map(item => `${fieldName(item.name)}: ${emitExpression(item.scope, target)}`);
    const call = `${functionName(node.target)}(assign, definitions, input, context, runtime, rootData, blockScope)`;
    if (node.id === null) return indent(n, `{ const input = Object.assign({ ${base.join(', ')} }, { ${scoped.join(', ')} }) as ${inputName(node.target)};\nconst blockScope = new Scope();\ncontext.enter(${quote(node.target)}, frame, ${quote(node.span)});\ntry { ${call}; } finally { context.leave(); }\n}`);
    const registration = node.path === null
      ? `if (definition === undefined) throw runtime.error(frame, ${quote(node.span)}, 'E_RUNTIME_BLOCK_UNDEFINED', ${quote(`define ${node.id} is not registered`)});`
      : `if (definition === undefined) { definition = { template: ${quote(node.target)} }; definitions.${fieldName(node.id)} = definition; } else if (definition.html !== undefined || definition.template !== ${quote(node.target)}) throw runtime.error(frame, ${quote(node.span)}, 'E_RUNTIME_BLOCK_REDEFINED', ${quote(`define ${node.id} is registered with a different template`)});`;
    return indent(n, `{ let definition = definitions.${fieldName(node.id)};\n${registration}\nif (definition?.html !== undefined) { context.at(frame, ${quote(node.span)}); context.output.write(definition.html); }\nelse { const input = Object.assign({ ${base.join(', ')} }, definition?.data ?? {}, { ${scoped.join(', ')} }) as ${inputName(node.target)}; const blockScope = new Scope(); context.enter(${quote(node.target)}, frame, ${quote(node.span)}); try { ${call}; } finally { context.leave(); } }\n}`);
  };
  target.ifBlock = (node, n) => indent(n, `if (definitions.${fieldName(node.id)} !== undefined) {\n${emitNodes(node.body, target, n + 1)}\n}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1)}\n}` : ''}`);
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index) => `runtime.index(${object} as unknown as Value, ${index} as unknown as Value)`;
  target.call = (name, args, node) => `runtime.call(${quote(name)}, [${args.join(', ')}] as unknown as Value[], frame, ${quote(node.span)})`;
  target.unary = (operator, operand, node) => `runtime.unary(${quote(operator)}, ${operand} as unknown as Value, frame, ${quote(node.span)})`;
  target.binary = (operator, left, right, node) => {
    if (operator === '&&') return `(() => { const left = ${left}; return runtime.truthy(left as unknown as Value) ? runtime.truthy(${right} as unknown as Value) : false; })()`;
    if (operator === '||') return `(() => { const left = ${left}; return runtime.truthy(left as unknown as Value) ? true : runtime.truthy(${right} as unknown as Value); })()`;
    if (operator === '??') return `(() => { const left = ${left}; return left !== null ? left : ${right}; })()`;
    return `runtime.binary(${quote(operator)}, ${left} as unknown as Value, ${right} as unknown as Value, frame, ${quote(node.span)})`;
  };
  target.ternary = (test, thenValue, elseValue) => `(runtime.truthy(${test} as unknown as Value) ? ${thenValue} : ${elseValue})`;
  target.list = items => `[${items.map(item => item.spread ? `...(runtime.listSpread(${item.value} as unknown as Value, frame, ${quote(item.span)}) as unknown as ${item.node.valueType.kind === 'any' ? 'Value[]' : tsType(item.node.valueType.source)})` : item.value).join(', ')}]`;
  target.map = entries => `new Map([${entries.map(item => item.spread ? `...(runtime.mapSpread(${item.value} as unknown as Value, frame, ${quote(item.span)}) as unknown as ${item.node.valueType.kind === 'any' ? 'Map<string, Value>' : tsType(item.node.valueType.source)})` : `[runtime.stringify(${item.value[0]} as unknown as Value, frame, ${quote(item.node.key.span)}), ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((branch, index) => `${'    '.repeat(n)}${index ? '} else if' : 'if'} (runtime.truthy(${emitExpression(branch.test, target)} as unknown as Value)) {\n${emitNodes(branch.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const entries = `${name}_entries`;
    const iterable = emitExpression(node.iter, target);
    return indent(n, `{ const ${entries} = runtime.entries(${iterable} as unknown as Value, frame, ${quote(node.span)});\nconst ${name}_had = scope.locals.has(${quote(node.name)}); const ${name}_previous = scope.locals.get(${quote(node.name)});\ntry {\nfor (let ${name}_index = 0; ${name}_index < ${entries}.length; ${name}_index += 1) {\n    const [${name}_key, ${name}_value] = ${entries}[${name}_index]!;\n    scope.locals.set(${quote(node.name)}, ${name}_value);\n    const ${name}_size = ${entries}.length;\n    const ${name}_first = ${name}_index === 0;\n    const ${name}_last = ${name}_index + 1 === ${entries}.length;\n    context.iterations += 1;\n    runtime.limit('iteration', context.iterations, frame, ${quote(node.span)});\n${emitNodes(node.body, target, n + 1)}\n}\n} finally { if (${name}_had) scope.locals.set(${quote(node.name)}, ${name}_previous as Value); else scope.locals.delete(${quote(node.name)}); }${node.empty ? `\nif (${entries}.length === 0) {\n${emitNodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `context.enter(${quote(node.target)}, frame, ${quote(node.span)});\ntry { ${functionName(node.target)}(assign, definitions, { ${node.inputs.map(item => `${fieldName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')} }, context, runtime, rootData, scope); } finally { context.leave(); }`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const tsRecords = Object.entries(records).map(([name, members]) => `export interface ${name} {\n${Object.entries(members).map(([key, type]) => `  ${tsField(key, type)}`).join('\n')}\n}`).join('\n');
  const assignType = program.dynamicRoot ? 'export type Assign = MapValue;' : `export interface Assign {\n${Object.entries(fields).map(([name, type]) => `  ${tsField(name, type)}`).join('\n')}\n}`;
  const inputTypes = templateBodies.map(template => `export interface ${template.input} { ${[...template.inputs].map(([name, type]) => tsField(name, type.source)).join(' ')} }`).join('\n');
  const definitionsType = `export type DefinitionData<T> = Partial<T>;\nexport interface Definition<T> { template?: string; html?: string; data?: DefinitionData<T>; }\nexport interface Definitions { ${[...program.definitions].map(([name, definition]) => `${fieldName(name)}?: Definition<${definition.template ? inputName(definition.template) : 'Record<never, never>'}>;`).join(' ')} }`;
  return `// Generated.\nimport { Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, bind, bindMap, type MapValue, type PreparedRender, type Program, type RenderOptions, type Template, type Value } from '@polyspec/template';\n${tsRecords}\n${assignType}\n${inputTypes}\n${definitionsType}\nexport interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }`;
}

export function emitRuntime(context) {
  const schema = bindingSchema(context);
  const bindAssign = context.program.dynamicRoot
    ? `function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: root, root }; }`
    : `function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: generatedBindRecord(root, generatedAssign as Record<string, GeneratedType>, 'assign') as unknown as Assign, root }; }`;
  return `type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };\nconst generatedRecords = ${JSON.stringify(schema.records)} as const;\nconst generatedAssign = ${JSON.stringify(schema.assign)} as const;\nconst generatedDefinitionSpecs = ${JSON.stringify(schema.definitions)} as const;\nfunction generatedObject(value: unknown, path: string): Map<string, unknown> { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }\nfunction generatedBindType(value: unknown, type: GeneratedType, path: string): unknown { if (value === null || value === undefined) { if (type.optional || type.kind === 'null' || type.kind === 'any') return null; throw new Error(path + ' is required'); } if (type.kind === 'any') return value; if (type.kind === 'null') { if (value !== null) throw new Error(path + ' is not null'); return null; } if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') { if (typeof value !== type.kind) throw new Error(path + ' is not a ' + type.kind); return value; } if (type.kind === 'list') { if (!Array.isArray(value)) throw new Error(path + ' is not a list'); return value.map((item, index) => generatedBindType(item, type.item as GeneratedType, path + '[' + index + ']')); } if (type.kind === 'map') { const object = generatedObject(value, path); return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key as GeneratedType, path + '.key'), generatedBindType(item, type.value as GeneratedType, path + '.' + key)])); } if (type.kind === 'record') return generatedBindRecord(value, generatedRecords[type.name as keyof typeof generatedRecords] as Record<string, GeneratedType>, path); throw new Error(path + ' has an unknown generated type'); }\nfunction generatedBindRecord(value: unknown, fields: Record<string, GeneratedType>, path: string, partial = false): Record<string, unknown> { const object = generatedObject(value, path); const result: Record<string, unknown> = {}; for (const [name, type] of Object.entries(fields)) { if (!object.has(name)) { if (!partial && !type.optional) throw new Error(path + '.' + name + ' is required'); if (!partial) result[name] = null; continue; } result[name] = generatedBindType(object.get(name), type, path + '.' + name); } return result; }\n${bindAssign}\ntype GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, { target: string | null; html?: string }> };\nfunction generatedBindDefinitions(input: RenderOptions['define']): GeneratedBoundDefinitions { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions: Record<string, unknown> = {}; const targets = new Map<string, { target: string | null; html?: string }>(); for (const [id, raw] of object) { const spec = (generatedDefinitionSpecs as Record<string, { field: string; target: string | null; html: boolean; input: Record<string, GeneratedType> }>)[id]; if (spec === undefined) throw new Error('define.' + id + ' is not declared'); if (typeof raw === 'string') { if (spec.target === null || raw !== spec.target) throw new Error('define.' + id + ' has an invalid template'); definitions[spec.field] = { template: spec.target }; targets.set(id, { target: spec.target }); continue; } const entry = generatedObject(raw, 'define.' + id); const template = entry.get('template'); const html = entry.get('html'); const data = entry.get('data'); if (typeof html === 'string') { if (!spec.html || template !== undefined || data !== undefined) throw new Error('define.' + id + ' has an invalid html entry'); definitions[spec.field] = { html }; targets.set(id, { target: null, html }); continue; } if (typeof template !== 'string' || spec.target === null || template !== spec.target) throw new Error('define.' + id + ' has an invalid template'); const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true); definitions[spec.field] = { template: spec.target, data: boundData }; targets.set(id, { target: spec.target }); } return { definitions: definitions as Definitions, targets }; }`;
}

export function emitTemplates(context) {
  const { program, templateBodies } = context;
  return templateBodies.map(template => {
    const typed = program.templates.get(template.name);
    return `function ${template.function}(assign: Assign, definitions: Definitions, input: ${template.input}, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {\n  const frame = new Frame(${quote(template.name)}, ${quote(typed.lines)}, rootData);\n${[...template.inputs].map(([name, type]) => `  scope.locals.set(${quote(name)}, ${type.optional ? `input.${fieldName(name)} ?? null` : `input.${fieldName(name)}`} as unknown as Value);`).join('\n')}\n${template.body}\n}`;
  }).join('\n');
}

export function emitEntry(context) {
  const { program, templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `    case ${quote(template.name)}: ${template.function}(assign, definitions, {}, context, runtime, rootData, scope); return;`).join('\n');
  return `function renderTemplate(target: string, assign: Assign, definitions: Definitions, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {\n  switch (target) {\n${dispatch}\n    default: throw context.fail('E_LOAD_NOT_FOUND', null, null, 'template ' + target + ' does not exist');\n  }\n}\nfunction generatedEnv(input: RenderOptions['env']): { timezone: string; now: number } { const timezone = input?.timezone ?? 'Z'; const now = input?.now ?? Math.floor(Date.now() / 1000); if (typeof timezone !== 'string') throw new Error('env.timezone is not a string'); if (typeof now !== 'number') throw new Error('env.now is not a number'); return { timezone, now }; }\nclass GeneratedPreparedRender implements PreparedRender { private readonly execute: () => string; constructor(execute: () => string) { this.execute = execute; } render(): string { return this.execute(); } }\nexport class GeneratedProgram implements Program {\n  readonly runtime: RuntimeEnvironment;\n  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }\n  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); const boundAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined) return new GeneratedPreparedRender(() => registered.html as string); const targetName = registered?.target ?? target; const env = generatedEnv(options.env); return new GeneratedPreparedRender(() => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); const scope = new Scope(); context.enter(targetName, null, null); try { renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root, scope); return context.output.toString(); } finally { context.leave(); } }); }\n  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }\n}`;
}
