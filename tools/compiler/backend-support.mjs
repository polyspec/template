const scalarTypes = {
  ts: { string: 'string', number: 'number', boolean: 'boolean', any: 'unknown', null: 'null', Template: 'string' },
  go: { string: 'string', number: 'float64', boolean: 'bool', any: 'any', null: 'any', Template: 'string' },
  rust: { string: 'String', number: 'f64', boolean: 'bool', any: 'GeneratedValue', null: 'GeneratedValue', Template: 'String' },
  php: { string: 'string', number: 'float', boolean: 'bool', any: 'mixed', null: 'mixed', Template: 'string' },
};

export const quote = value => JSON.stringify(value);
export const fieldName = name => name.replace(/[^A-Za-z0-9_]/g, '_');
export const exportedName = name => fieldName(name)[0].toUpperCase() + fieldName(name).slice(1);
export const functionName = name => `render_${fieldName(name)}`;
export const inputName = name => `Input_${fieldName(name)}`;
export const definitionDataName = name => `DefinitionData_${fieldName(name)}`;
export const optional = type => type.endsWith('?');
const typeName = type => type.replace(/\?$/, '');

function genericType(type, scalar, list, map) {
  const source = typeName(type);
  const listMatch = /^list<(.+)>$/.exec(source);
  if (listMatch) return list(genericType(listMatch[1], scalar, list, map));
  const mapMatch = /^map<([^,]+),(.+)>$/.exec(source);
  if (mapMatch) return map(genericType(mapMatch[1].trim(), scalar, list, map), genericType(mapMatch[2].trim(), scalar, list, map));
  return scalar[source] ?? source;
}

export const tsType = type => genericType(type, scalarTypes.ts, item => `Array<${item}>`, (key, value) => `Map<${key}, ${value}>`);
export const goType = type => (optional(type) && typeName(type) !== 'any' ? '*' : '') + genericType(type, scalarTypes.go, item => `[]${item}`, (key, value) => `OrderedMap[${key}, ${value}]`);
export const rustType = type => `${optional(type) ? 'Option<' : ''}${genericType(type, scalarTypes.rust, item => `Vec<${item}>`, (key, value) => `OrderedMap<${key}, ${value}>`)}${optional(type) ? '>' : ''}`;
export const phpType = type => genericType(type, scalarTypes.php, () => 'array', () => 'MapValue');
export const tsField = (name, type) => `${name}${optional(type) ? '?' : ''}: ${tsType(type)};`;
export const phpField = (name, type) => `public readonly ${optional(type) ? '?' : ''}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;
export const phpInputField = (name, type) => `public ${optional(type) ? '?' : ''}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;
export const phpDefinitionDataField = (name, type) => `public bool $has_${name} = false, public ${phpType(type) === 'mixed' ? 'mixed' : `?${phpType(type)}`} $${name} = null`;
export const indent = (level, source) => source.split('\n').map(line => line.length === 0 ? '' : '    '.repeat(level) + line).join('\n');

export function emitExpression(node, target) {
  if (node.op === 'literal') return target.literal(node.value, node.valueType);
  if (node.op === 'root') return target.var(fieldName(node.name), node.valueType.source, node);
  if (node.op === 'local') return target.local(fieldName(node.name), node.valueType.source);
  if (node.op === 'loop-meta') return target.loopMeta(node.loop, node.field, node);
  if (node.op === 'member') return target.member(emitExpression(node.object, target), fieldName(node.key), node.object.valueType, node);
  if (node.op === 'index') return target.index(emitExpression(node.object, target), emitExpression(node.index, target), node.object.valueType, node);
  if (node.op === 'call') return target.call(node.name, node.args.map(item => emitExpression(item, target)), node);
  if (node.op === 'unary') return target.unary(node.operator, emitExpression(node.operand, target), node);
  if (node.op === 'binary') return target.binary(node.operator, emitExpression(node.left, target), emitExpression(node.right, target), node);
  if (node.op === 'ternary') return target.ternary(emitExpression(node.test, target), emitExpression(node.then, target), emitExpression(node.otherwise, target), node);
  if (node.op === 'list') return target.list(node.items.map(item => ({ spread: item.spread, value: emitExpression(item.value, target), node: item.value, span: item.span })), node.valueType, node);
  if (node.op === 'map') return target.map(node.entries.map(item => item.spread ? { spread: true, value: emitExpression(item.value, target), node: item.value, span: item.span } : { spread: false, value: [emitExpression(item.key, target), emitExpression(item.value, target)], node: item, span: item.span }), node.valueType, node);
  throw new Error(`compiler backend: unsupported IR expression ${node.op}`);
}

export function emitNodes(body, target, level = 1) {
  const output = [];
  for (const node of body) {
    if (node.op === 'text') output.push(target.text(node.value, level, node));
    else if (node.op === 'echo') output.push(target.echo(emitExpression(node.expr, target), level, node));
    else if (node.op === 'block') output.push(target.block(node, level));
    else if (node.op === 'if-block') output.push(target.ifBlock(node, level));
    else if (node.op === 'set') output.push(target.set(node.name, emitExpression(node.expr, target), level, node));
    else if (node.op === 'if') output.push(target.ifNode(node, level));
    else if (node.op === 'for') output.push(target.forNode(node, level));
    else if (node.op === 'include') output.push(target.include(node, level));
    else throw new Error(`compiler backend: unsupported IR node ${node.op}`);
  }
  return output.join('\n');
}

export function baseTarget(language) {
  const targets = {
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
      literal: (value, type) => value === null ? 'nil' : typeof value === 'string' ? quote(value) : type.kind === 'number' ? `float64(${value})` : String(value),
      var: (name, type) => `${optional(type) ? 'valueOrZero(' : ''}assign.${exportedName(name)}${optional(type) ? ')' : ''}`,
      local: (name, type) => `${optional(type) ? 'valueOrZero(' : ''}${name}${optional(type) ? ')' : ''}`,
      member: (object, key) => `${object}.${exportedName(key)}`,
      text: (value, level) => indent(level, `out.WriteString(${quote(value)})`),
      echo: (expression, level) => indent(level, `out.WriteString(generatedEscape(${expression}))`),
      set: (name, value, level) => indent(level, `${fieldName(name)} := ${value}\n_ = ${fieldName(name)}`),
    },
    rust: {
      literal: (value, type) => value === null ? 'GeneratedValue::Null' : typeof value === 'string' ? quote(value) + '.to_string()' : type.kind === 'number' ? `${value}f64` : String(value),
      var: (name, type) => `assign.${name}${optional(type) ? '.clone().unwrap_or_default()' : '.clone()'}`,
      local: (name, type) => optional(type) ? `${name}.clone().unwrap_or_default()` : name,
      member: (object, key) => `${object}.${key}`,
      text: (value, level) => indent(level, `out.push_str(${quote(value)});`),
      echo: (expression, level) => indent(level, `out.push_str(&escape(&${expression}.to_string()));`),
      set: (name, value, level) => indent(level, `let ${fieldName(name)} = ${value};`),
    },
    php: {
      literal: value => value === null ? 'null' : typeof value === 'string' ? quote(value) : String(value),
      var: name => `$assign->${name}`,
      local: name => `$${name}`,
      member: (object, key) => `${object}?->${key}`,
      text: (value, level) => indent(level, `$out .= ${quote(value)};`),
      echo: (expression, level) => indent(level, `$out .= generated_escape(${expression});`),
      set: (name, value, level) => indent(level, `$${fieldName(name)} = ${value};`),
    },
  };
  return { convert: value => value, ...targets[language] };
}

export function templateBodies(program, target) {
  return [...program.templates.values()].map(template => ({
    name: template.name,
    function: functionName(template.name),
    input: inputName(template.name),
    inputs: template.inputs,
    body: emitNodes(template.body, target, 1),
  }));
}
