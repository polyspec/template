const scalarTypes = {
  ts: { string: 'string', number: 'number', boolean: 'boolean', any: 'unknown', null: 'null', Template: 'string' },
  go: { string: 'string', number: 'float64', boolean: 'bool', any: 'any', null: 'any', Template: 'string' },
  rust: { string: 'String', number: 'f64', boolean: 'bool', any: 'GeneratedValue', null: 'GeneratedValue', Template: 'String' },
  php: { string: 'string', number: 'float', boolean: 'bool', any: 'mixed', null: 'mixed', Template: 'string' },
};

export const quote = value => JSON.stringify(value);

// Exact string literals of each target language (docs/spec/compiler.md). Template text is valid
// Unicode text, so every character is a scalar value; only the characters that a literal
// interprets are escaped.
const escapeControls = (value, escape) => [...value].map(char => {
  const code = char.codePointAt(0);
  if (char === '\\') return '\\\\';
  if (char === '"') return '\\"';
  return code < 0x20 || code === 0x7f ? escape(code) : char;
}).join('');
export const goString = value => `"${escapeControls(value, code => `\\u${code.toString(16).padStart(4, '0')}`)}"`;
export const rustString = value => `"${escapeControls(value, code => `\\u{${code.toString(16)}}`)}"`;
const phpQuoted = value => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
// A PHP string is single-quoted text with only \ and ' escaped. A control character is written as a
// double-quoted escape ("\n", "\r" or "\xHH") joined with `.`, so no literal spans two source lines,
// indentation of the generated source cannot change the text, and the source holds no control
// character, which the PHP backend uses to mark its argument lists (T25.2).
/**
 * @param {string} value
 * @returns {string}
 */
export const phpString = value => {
  const control = part => part === '\n' ? '"\\n"' : part === '\r' ? '"\\r"' : `"\\x${part.charCodeAt(0).toString(16).padStart(2, '0')}"`;
  // A control character (U+0000 to U+001F and U+007F) is written by its escape, every other run of text quoted.
  const isControl = character => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f;
  const parts = [];
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
  if (parts.length === 0) return "''";
  return parts.length === 1 ? parts[0] : `(${parts.join(' . ')})`;
};
export const phpLiteral = value => {
  if (typeof value === 'string') return phpString(value);
  if (Array.isArray(value)) return `[${value.map(phpLiteral).join(', ')}]`;
  if (value === null) return 'null';
  return String(value);
};
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
// PHP rejects a nullable mark on mixed, which already includes null.
const phpNullable = type => optional(type) && phpType(type) !== 'mixed' ? '?' : '';
export const phpField = (name, type) => `public readonly ${phpNullable(type)}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;
export const phpInputField = (name, type) => `public ${phpNullable(type)}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;
export const phpDefinitionDataField = (name, type) => `public bool $has_${name} = false, public ${phpType(type) === 'mixed' ? 'mixed' : `?${phpType(type)}`} $${name} = null`;
/**
 * A definition of generated code that the program keeps only when the code it keeps uses it (T25.1): `name` is the
 * identifier that the definition declares, and `pattern` a use of it, the whole word `name` by default.
 */
export const definition = (name, code, pattern = new RegExp(`\\b${name}\\b`)) => ({ name, code, pattern });

/**
 * Code that is written from the rest of the program, such as an import list that names what the program uses: `render`
 * receives the code of every other kept part and returns this part.
 */
export const dependent = render => ({ render });

/** The start of a file of a target that writes one file per declaration, at `path` under the output directory. */
export const file = path => ({ file: path });

/** The definitions that `text` uses, with the definitions that those use, in their order. */
export function usedDefinitions(definitions, text) {
  const kept = new Set();
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

/**
 * The parts of a program in order, each a string or a file start: every string, every definition that a kept part
 * uses, until no further definition is used, and every dependent part, so the program carries no helper, type, method
 * or import that it does not use.
 */
export function usedParts(parts) {
  const strings = parts.filter(part => typeof part === 'string').join('\n');
  const definitions = new Set(usedDefinitions(parts.filter(part => part.pattern), strings));
  const text = [strings, ...[...definitions].map(item => item.code)].join('\n');
  return parts.flatMap(part => {
    if (typeof part === 'string' || part.file) return [part];
    if (part.render) return [part.render(text)];
    return definitions.has(part) ? [part.code] : [];
  });
}

/** The code of a program that is one file: its used parts, one per line. */
export function usedCode(parts) {
  const used = usedParts(parts);
  if (used.some(part => part.file)) throw new Error('compiler backend: a program of one file has no file start');
  return used.join('\n');
}

/** The files of a program that is one file per declaration: the used parts after each file start, by path. */
export function usedFiles(parts) {
  const files = {};
  let current = null;
  for (const part of usedParts(parts)) {
    if (part.file) {
      current = part.file;
      files[current] = [];
    } else if (current === null) {
      throw new Error('compiler backend: code before the first file start');
    } else {
      files[current].push(part);
    }
  }
  return Object.fromEntries(Object.entries(files).map(([path, code]) => [path, `${code.join('\n')}\n`]));
}

export const indent = (level, source) => source.split('\n').map(line => line.length === 0 ? '' : '    '.repeat(level) + line).join('\n');

export function emitExpression(node, target) {
  if (node.op === 'literal') return target.literal(node.value, node.valueType);
  if (node.op === 'to-value') return target.toValue(emitExpression(node.value, target), node.value.valueType, node);
  if (node.op === 'root') return target.var(fieldName(node.name), node.valueType.source, node);
  if (node.op === 'local') return target.local(fieldName(node.name), node.valueType.source);
  if (node.op === 'loop-meta') return target.loopMeta(node.loop, node.field, node);
  if (node.op === 'member') return target.member(emitExpression(node.object, target), fieldName(node.key), node.object.valueType, node);
  if (node.op === 'member-call') return target.memberCall(emitExpression(node.object, target), node.method, node.args.map(item => emitExpression(item, target)), node);
  if (node.op === 'class-call') return target.classCall(node.className, node.method, node.args.map(item => emitExpression(item, target)), node);
  if (node.op === 'index') return target.index(emitExpression(node.object, target), emitExpression(node.index, target), node.object.valueType, node);
  if (node.op === 'call') return target.call(node.name, node.args.map(item => emitExpression(item, target)), node);
  if (node.op === 'unary') return target.unary(node.operator, emitExpression(node.operand, target), node);
  if (node.op === 'binary') return target.binary(node.operator, emitExpression(node.left, target), emitExpression(node.right, target), node);
  if (node.op === 'ternary') return target.ternary(emitExpression(node.test, target), emitExpression(node.consequent, target), emitExpression(node.otherwise, target), node);
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
