import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
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

export function createTarget() {
  const target = baseTarget(language);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `{ const definition = definitions.${fieldName(node.id)};\nif (definition?.html === undefined) throw new Error(${quote(`generated definition ${node.id} requires html`)});\nout += definition.html;\n}`);
    const base = node.inputs.filter(item => item.root).map(item => `${fieldName(item.name)}: ${emitExpression(item.root, target)}`);
    const scoped = node.inputs.filter(item => item.scope).map(item => `${fieldName(item.name)}: ${emitExpression(item.scope, target)}`);
    if (node.id === null) return indent(n, `out += ${functionName(node.target)}(assign, definitions, Object.assign({ ${base.join(', ')} }, { ${scoped.join(', ')} }) as ${inputName(node.target)});`);
    const missing = node.path === null ? `if (definition === undefined) throw new Error(${quote(`generated definition ${node.id} is missing`)});` : '';
    return indent(n, `{ const definition = definitions.${fieldName(node.id)};\n${missing}\nif (definition?.html !== undefined) out += definition.html;\nelse { const input = Object.assign({ ${base.join(', ')} }, definition?.data ?? {}, { ${scoped.join(', ')} }) as ${inputName(node.target)}; out += ${functionName(node.target)}(assign, definitions, input); }\n}`);
  };
  target.ifBlock = (node, n) => indent(n, `if (definitions.${fieldName(node.id)} !== undefined) {\n${emitNodes(node.body, target, n + 1)}\n}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1)}\n}` : ''}`);
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index, type) => type.kind === 'map' ? `${object}?.get(${index})` : `${object}?.[${index}]`;
  target.call = (name, args) => {
    if (name !== 'default') throw new Error(`compiler: function ${name} reached the TypeScript backend without support`);
    return `generatedDefault(${args.join(', ')})`;
  };
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => op === 'in' ? `generatedIn(${left}, ${right})` : op === '&&' || op === '||' ? `(generatedTruthy(${left}) ${op} generatedTruthy(${right}))` : `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(generatedTruthy(${test}) ? ${thenValue} : ${elseValue})`;
  target.list = items => `[${items.map(item => item.spread ? `...${item.value}` : item.value).join(', ')}]`;
  target.map = entries => `new Map([${entries.map(item => item.spread ? `...${item.value}` : `[${item.value[0]}, ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} else if' : 'if'} (generatedTruthy(${emitExpression(b.test, target)})) {\n${emitNodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const entries = `${name}_entries`;
    const iterable = emitExpression(node.iter, target);
    const makeEntries = node.iter.valueType.kind === 'map' ? `Array.from(${iterable}?.entries() ?? [])` : `(${iterable} ?? []).map((value, key) => [key, value] as const)`;
    return indent(n, `{ const ${entries} = ${makeEntries};\nfor (let ${name}_index = 0; ${name}_index < ${entries}.length; ${name}_index += 1) {\n    const [${name}_key, ${name}_value] = ${entries}[${name}_index];\n    const ${name} = ${name}_value;\n    const ${name}_size = ${entries}.length;\n    const ${name}_first = ${name}_index === 0;\n    const ${name}_last = ${name}_index + 1 === ${entries}.length;\n${emitNodes(node.body, target, n + 1)}\n}${node.empty ? `\nif (${entries}.length === 0) {\n${emitNodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `out += ${functionName(node.target)}(assign, definitions, { ${node.inputs.map(item => `${fieldName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')} });`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const tsRecords = Object.entries(records).map(([name, members]) => `export interface ${name} {\n${Object.entries(members).map(([key, type]) => `  ${tsField(key, type)}`).join('\n')}\n}`).join('\n');
  const inputTypes = templateBodies.map(template => `export interface ${template.input} { ${[...template.inputs].map(([name, type]) => tsField(name, type.source)).join(' ')} }`).join('\n');
  const definitionsType = `export type DefinitionData<T> = Partial<T>;\nexport interface Definition<T> { html?: string; data?: DefinitionData<T>; }\nexport interface Definitions { ${[...program.definitions].map(([name, definition]) => `${fieldName(name)}?: Definition<${definition.template ? inputName(definition.template) : 'Record<never, never>'}>;`).join(' ')} }`;
  return `// Generated.\nimport { RuntimeEnvironment, bind, type PreparedRender, type Program, type RenderOptions, type Template } from '@polyspec/template';\n${tsRecords}\nexport interface Assign {\n${Object.entries(fields).map(([name, type]) => `  ${tsField(name, type)}`).join('\n')}\n}\n${inputTypes}\n${definitionsType}\nexport interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }`;
}

export function emitRuntime(context) {
  const schema = bindingSchema(context);
  return `type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };\nconst generatedRecords = ${JSON.stringify(schema.records)} as const;\nconst generatedAssign = ${JSON.stringify(schema.assign)} as const;\nconst generatedDefinitionSpecs = ${JSON.stringify(schema.definitions)} as const;\nfunction generatedObject(value: unknown, path: string): Map<string, unknown> { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }\nfunction generatedBindType(value: unknown, type: GeneratedType, path: string): unknown { if (value === null || value === undefined) { if (type.optional || type.kind === 'null' || type.kind === 'any') return undefined; throw new Error(path + ' is required'); } if (type.kind === 'any') return value; if (type.kind === 'null') { if (value !== null) throw new Error(path + ' is not null'); return null; } if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') { if (typeof value !== type.kind) throw new Error(path + ' is not a ' + type.kind); return value; } if (type.kind === 'list') { if (!Array.isArray(value)) throw new Error(path + ' is not a list'); return value.map((item, index) => generatedBindType(item, type.item as GeneratedType, path + '[' + index + ']')); } if (type.kind === 'map') { const object = generatedObject(value, path); return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key as GeneratedType, path + '.key'), generatedBindType(item, type.value as GeneratedType, path + '.' + key)])); } if (type.kind === 'record') return generatedBindRecord(value, generatedRecords[type.name as keyof typeof generatedRecords] as Record<string, GeneratedType>, path); throw new Error(path + ' has an unknown generated type'); }\nfunction generatedBindRecord(value: unknown, fields: Record<string, GeneratedType>, path: string, partial = false): Record<string, unknown> { const object = generatedObject(value, path); const result: Record<string, unknown> = {}; for (const [name, type] of Object.entries(fields)) { if (!object.has(name)) { if (!partial && !type.optional) throw new Error(path + '.' + name + ' is required'); continue; } result[name] = generatedBindType(object.get(name), type, path + '.' + name); } return result; }\nfunction generatedBindAssign(value: unknown): Assign { const bound = bind(value); return generatedBindRecord(bound, generatedAssign as Record<string, GeneratedType>, 'assign') as unknown as Assign; }\ntype GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, { target: string | null; html?: string }> };\nfunction generatedBindDefinitions(input: RenderOptions['define']): GeneratedBoundDefinitions { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions: Record<string, unknown> = {}; const targets = new Map<string, { target: string | null; html?: string }>(); for (const [id, raw] of object) { const spec = (generatedDefinitionSpecs as Record<string, { field: string; target: string | null; html: boolean; input: Record<string, GeneratedType> }>)[id]; if (spec === undefined) throw new Error('define.' + id + ' is not declared'); if (typeof raw === 'string') { if (spec.target === null || raw !== spec.target) throw new Error('define.' + id + ' has an invalid template'); definitions[spec.field] = {}; targets.set(id, { target: spec.target }); continue; } const entry = generatedObject(raw, 'define.' + id); const template = entry.get('template'); const html = entry.get('html'); const data = entry.get('data'); if (typeof html === 'string') { if (!spec.html || template !== undefined || data !== undefined) throw new Error('define.' + id + ' has an invalid html entry'); definitions[spec.field] = { html }; targets.set(id, { target: null, html }); continue; } if (typeof template !== 'string' || spec.target === null || template !== spec.target) throw new Error('define.' + id + ' has an invalid template'); const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true); definitions[spec.field] = { data: boundData }; targets.set(id, { target: spec.target }); } return { definitions: definitions as Definitions, targets }; }\nfunction stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }\nfunction escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }\nfunction generatedTruthy(value: unknown): boolean { if (value === null || value === undefined || value === false || value === '' || value === 0) return false; if (Array.isArray(value)) return value.length !== 0; if (value instanceof Map) return value.size !== 0; return true; }\nfunction generatedDefault<T>(value: T, fallback: T): T { return generatedTruthy(value) ? value : fallback; }\nfunction generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }`;
}

export function emitTemplates(context) {
  const { templateBodies } = context;
  const functions = templateBodies.map(template => `function ${template.function}(assign: Assign, definitions: Definitions, input: ${template.input}): string { let out = '';\n${[...template.inputs].map(([name]) => `  const ${fieldName(name)} = input.${fieldName(name)};`).join('\n')}\n${template.body}\n  return out; }`).join('\n');
  return functions;
}

export function emitEntry(context) {
  const { program, templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `    case ${quote(template.name)}: return ${template.function}(assign, definitions, {});`).join('\n');
  return `export function renderTemplate(target: string, assign: Assign, definitions: Definitions): string {\n  switch (target) {\n${dispatch}\n    default: throw new Error('generated template is missing or requires inputs: ' + target);\n  }\n}\nexport function render(assign: Assign, definitions: Definitions): string { return renderTemplate(${quote(program.entry)}, assign, definitions); }\nclass GeneratedPreparedRender implements PreparedRender { private readonly execute: () => string; constructor(execute: () => string) { this.execute = execute; } render(): string { return this.execute(); } }\nexport class GeneratedProgram implements Program {\n  readonly runtime: RuntimeEnvironment;\n  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }\n  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); const typedAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined) return new GeneratedPreparedRender(() => registered.html as string); const targetName = registered?.target ?? target; return new GeneratedPreparedRender(() => renderTemplate(targetName, typedAssign, bound.definitions)); }\n  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }\n}`;
}
