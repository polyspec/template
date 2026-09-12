import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'ts';

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
  return `// Generated.\n${tsRecords}\nexport interface Assign {\n${Object.entries(fields).map(([name, type]) => `  ${tsField(name, type)}`).join('\n')}\n}\n${inputTypes}\n${definitionsType}`;
}

export function emitRuntime() {
  return `function stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }\nfunction escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }\nfunction generatedTruthy(value: unknown): boolean { if (value === null || value === undefined || value === false || value === '' || value === 0) return false; if (Array.isArray(value)) return value.length !== 0; if (value instanceof Map) return value.size !== 0; return true; }\nfunction generatedDefault<T>(value: T, fallback: T): T { return generatedTruthy(value) ? value : fallback; }\nfunction generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }`;
}

export function emitTemplates(context) {
  const { templateBodies } = context;
  const functions = templateBodies.map(template => `function ${template.function}(assign: Assign, definitions: Definitions, input: ${template.input}): string { let out = '';\n${[...template.inputs].map(([name]) => `  const ${fieldName(name)} = input.${fieldName(name)};`).join('\n')}\n${template.body}\n  return out; }`).join('\n');
  return functions;
}

export function emitEntry(context) {
  const { program, templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `    case ${quote(template.name)}: return ${template.function}(assign, definitions, {});`).join('\n');
  return `export function renderTemplate(target: string, assign: Assign, definitions: Definitions): string {\n  switch (target) {\n${dispatch}\n    default: throw new Error('generated template is missing or requires inputs: ' + target);\n  }\n}\nexport function render(assign: Assign, definitions: Definitions): string { return renderTemplate(${quote(program.entry)}, assign, definitions); }`;
}
