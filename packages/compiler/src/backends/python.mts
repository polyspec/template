// Python backend: emits one Python module per source graph. The generated code imports the runtime of the
// polyspec.template package and follows the same observable semantics as the AST engine (docs/spec/compiler.md). It
// writes the canonical form of ruff format itself (T25.3): double quotes unless a string holds more double than single
// quotes, two blank lines between top-level definitions, and a group (an argument list, a parameter list, a collection
// or a parenthesized operator chain) that does not fit in 88 columns split one item per line, a list with a magic
// trailing comma; and it writes only the helpers, imports and loop metadata that the program uses (T25.1).
import {
  definition, dependent, emitExpression, emitNodes, fieldName, functionName, inputName,
  type BackendContext, type Part, type Target,
  descriptor, descriptors, type Descriptor,
} from '../backend-support.mts';
import { loweredTemplate, type NodeOf, type Program } from '../ir.mts';

export const language = 'python';

/**
 * A Python string literal: double quotes, or single quotes when the text holds more double than single quotes, the
 * quotes that need fewer escapes; JSON escapes the other characters, which Python reads alike.
 */
function py(value: string | null): string {
  if (typeof value !== 'string') return JSON.stringify(value);
  const doubles = value.split('"').length - 1;
  const singles = value.split("'").length - 1;
  const json = JSON.stringify(value);
  if (doubles <= singles) return json;
  return `'${json.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`;
}

// The markers of a group are control characters, which no literal of the program holds: py escapes them.
const kinds = {
  list: { open: '\u0001', separator: '\u0002', close: '\u0003' },
  chain: { open: '\u0004', separator: '\u0005', close: '\u0006' },
};
const markers = Object.values(kinds).flatMap(kind => [kind.open, kind.separator, kind.close]);
const isOpen = (character: string | undefined): boolean => Object.values(kinds).some(kind => kind.open === character);
const isClose = (character: string | undefined): boolean => Object.values(kinds).some(kind => kind.close === character);
const group = (kind: keyof typeof kinds, items: string[], joiner: string): string => items.length === 0 ? '' : `${kinds[kind].open}${items.join(`${joiner}${kinds[kind].separator}`)}${kinds[kind].close}`;
const call = (callee: string, items: string[]): string => `${callee}(${group('list', items, ',')})`;
const list = (items: string[]): string => `[${group('list', items, ',')}]`;
const tuple = (items: string[]): string => `(${group('list', items, ',')})`;
const dict = (entries: string[]): string => `{${group('list', entries, ',')}}`;
const chain = (...items: string[]): string => `(${group('chain', items, '')})`;
// A string iterates by code point, so a character outside the Basic Multilingual Plane stays one character.
const flat = (line: string): string => Array.from(line, character => Object.values(kinds).some(kind => kind.separator === character) ? ' ' : markers.includes(character) ? '' : character).join('');
const WIDTH = 88;

/** The first group that opens in `line`, by the index of its opening marker in the UTF-16 code units of the line. */
function firstGroup(line: string): { start: number; kind: (typeof kinds)[keyof typeof kinds] } | null {
  for (let index = 0; index < line.length; index += 1) {
    const kind = Object.values(kinds).find(item => item.open === line[index]);
    if (kind !== undefined) return { start: index, kind };
  }
  return null;
}

/**
 * The lines of `line`: the line itself when it fits, or its first group split, and every resulting line in turn. A
 * list holds one item per line with a trailing comma, which ruff format keeps split; a chain holds its operands on one
 * line between its parentheses when they fit there, or one operand per line.
 */
function layout(line: string): string[] {
  const found = firstGroup(line);
  if (flat(line).length <= WIDTH || found === null) return [flat(line)];
  const { start, kind } = found;
  const indentation = /^ */.exec(line)?.[0] ?? '';
  const items: string[] = [];
  let depth = 0;
  let item = start + 1;
  let end = -1;
  for (let index = start + 1; index < line.length && end < 0; index += 1) {
    const character = line[index];
    if (isOpen(character)) depth += 1;
    else if (isClose(character) && depth > 0) depth -= 1;
    else if (character === kind.close) end = index;
    else if (character === kind.separator && depth === 0) {
      items.push(line.slice(item, index));
      item = index + 1;
    }
  }
  items.push(line.slice(item, end));
  const inner = `${indentation}    `;
  const body = kind === kinds.list
    ? items.map((text, index) => `${inner}${text}${index === items.length - 1 ? ',' : ''}`)
    : flat(`${inner}${items.join(' ')}`).length <= WIDTH ? [`${inner}${items.join(' ')}`] : items.map(text => `${inner}${text}`);
  return [...layout(line.slice(0, start)), ...body.flatMap(layout), ...layout(`${indentation}${line.slice(end + 1)}`)];
}

/** `code` at `level`: every line that is not empty starts with four spaces per level. */
const spaces = (level: number, code: string): string => code.split('\n').map(text => text === '' ? '' : '    '.repeat(level) + text).join('\n');
const lines = (...parts: (string | string[])[]): string => parts.flat().filter(part => part !== '').join('\n');
/** `code` laid out in 88 columns, line by line. */
const laid = (code: string): string => code.split('\n').flatMap(layout).join('\n');
const block = (head: string, ...body: (string | string[])[]): string => `${head}:\n${spaces(1, lines(...body) || 'pass')}`;

/** A JSON-shaped value. */
type PyValue = null | boolean | number | string | PyValue[] | { [key: string]: PyValue };

// A Python literal of a JSON-shaped value (null -> None, true/false -> True/False).
function pyLiteral(value: PyValue): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return py(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return list(value.map(pyLiteral));
  return dict(Object.entries(value).map(([key, item]) => `${py(key)}: ${pyLiteral(item)}`));
}
const span = (value: readonly number[]): string => list(value.map(String));




const inputClass = (name: string): string => `_${inputName(name)}`;


function bindingSchema(context: BackendContext): { records: Record<string, Record<string, Descriptor>>; assign: Record<string, Descriptor>; definitions: Record<string, PyValue> } {
  const records = Object.fromEntries(Object.entries(context.manifest.records).map(([name, fields]) => [name, descriptors(fields)]));
  const assign = descriptors(context.manifest.fields);
  const definitions = Object.fromEntries([...context.program.definitions].map(([id, definition]): [string, PyValue] => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    input: definition.template === null ? {} : Object.fromEntries([...loweredTemplate(context.program, definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
  return { records, assign, definitions };
}

function numberLiteral(value: number): string {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

/** The fields of the loop metadata that a loop records, each with the Python expression of its value. */
const loopFields = ['index_', 'key_', 'value_', 'first_', 'last_'] as const;

export function createTarget({ program }: { program: Program }): Target {
  const write = (node: { span: readonly number[] }, value: string): string => `${call('_context.at', ['_frame', span(node.span)])}\n${call('_context.output.write', [value])}`;
  const error = (node: { span: readonly number[] }, code: string, message: string): string => `raise ${call('_runtime.error', ['_frame', span(node.span), py(code), py(message)])}`;
  const block_ = (node: NodeOf<'block'>, n: number): string => {
    const targetName = node.target;
    if (targetName === null) {
      return spaces(n, lines(
        `_definition = ${call('_definitions.get', [py(node.id)])}`,
        block('if _definition is None or _definition.html is None', error(node, 'E_RUNTIME_BLOCK_UNDEFINED', `define ${node.id} is not registered`)),
        write(node, '_definition.html')));
    }
    const render = call(functionName(targetName), ['_assign', '_definitions', '_input', '_context', '_runtime', '_root_data', '_block_scope']);
    // The input starts from the root fallback, the definition data replaces the fields it carries, and the scope of
    // the call site replaces them again.
    const construct = `_input = ${call(inputClass(targetName), node.inputs.flatMap(item => item.root ? [`${fieldName(item.name)}=${emitExpression(item.root, target)}`] : []))}`;
    const defined = node.inputs.map(item => block(`if _definition.data is not None and ${py(item.name)} in _definition.data`, `_input.${fieldName(item.name)} = _definition.data[${py(item.name)}]`));
    const scoped = node.inputs.flatMap(item => item.scope ? [`_input.${fieldName(item.name)} = ${emitExpression(item.scope, target)}`] : []);
    const callBlock = [
      '_block_scope = Scope()',
      call('_context.enter', [py(targetName), '_frame', span(node.span)]),
      block('try', render),
      block('finally', '_context.leave()'),
    ];
    if (node.id === null) return spaces(n, lines(construct, scoped, callBlock));
    const register = node.path === null
      ? block('if _definition is None', error(node, 'E_RUNTIME_BLOCK_UNDEFINED', `define ${node.id} is not registered`))
      : lines(
        block('if _definition is None', `_definition = ${call('_Definition', [`template=${py(targetName)}`, 'data=None'])}`, `_definitions[${py(node.id)}] = _definition`),
        block(`elif _definition.html is not None or _definition.template != ${py(targetName)}`, error(node, 'E_RUNTIME_BLOCK_REDEFINED', `define ${node.id} is registered with a different template`)));
    return spaces(n, lines(
      `_definition = ${call('_definitions.get', [py(node.id)])}`,
      register,
      block('if _definition.html is not None', write(node, '_definition.html')),
      block('else', construct, defined, scoped, callBlock)));
  };
  const forNode = (node: NodeOf<'for'>, n: number): string => {
    const name = `_${fieldName(node.name)}`;
    const body = emitNodes(node.body, target, 0);
    const values: Record<typeof loopFields[number], string> = { index_: `float(${name}_index)`, key_: `${name}_key`, value_: `${name}_value`, first_: `${name}_index == 0`, last_: `${name}_index == ${name}_size - 1` };
    // The loop records the metadata that its body reads, and no other.
    const recorded = loopFields.flatMap(field => new RegExp(`\\.${field}\\b`).test(body) ? [`${name}_stack[-1].${field} = ${values[field]}`] : []);
    const index = /_index\b/.test(recorded.join('\n')) ? `${name}_index` : '_';
    const key = recorded.some(line => line.includes('.key_ ')) ? `${name}_key` : '_';
    return spaces(n, lines(
      `${name}_entries = ${call('_runtime.entries', [emitExpression(node.iter, target), '_frame', span(node.span)])}`,
      `${name}_size = len(${name}_entries)`,
      `${name}_had = ${py(node.name)} in _scope.locals`,
      `${name}_previous = ${call('_scope.locals.get', [py(node.name)])}`,
      block(`if ${name}_size == 0`, node.empty ? emitNodes(node.empty, target, 0) : 'pass'),
      block('else',
        `${name}_stack = ${call('_scope.loops.setdefault', [py(node.name), '[]'])}`,
        `${name}_stack.append(LoopMeta(${name}_size))`,
        block('try',
          block(`for ${index}, (${key}, ${name}_value) in enumerate(${name}_entries)`,
            '_context.iterations += 1',
            call('_runtime.limit', [py('iteration'), '_context.iterations', '_frame', span(node.span)]),
            recorded,
            `_scope.locals[${py(node.name)}] = ${name}_value`,
            body)),
        block('finally',
          `${name}_stack.pop()`,
          block(`if ${name}_had`, `_scope.locals[${py(node.name)}] = ${name}_previous`),
          block('else', call('_scope.locals.pop', [py(node.name), 'None']))))));
  };
  const target: Target = {
    literal: value => {
      if (value === null) return 'None';
      if (typeof value === 'string') return py(value);
      if (typeof value === 'number') return numberLiteral(value);
      return value ? 'True' : 'False';
    },
    var: (name, _type, node) => program.dynamicRoot
      ? (node.scope ? call('_scope.lookup', ['_frame', py(name)]) : call('_runtime.member', ['_root_data', py(name), '_frame', span(node.span)]))
      : `_assign.${fieldName(name)}`,
    local: name => call('_scope.lookup', ['_frame', py(name)]),
    set: (name, value, level) => spaces(level, `_scope.locals[${py(name)}] = ${value}`),
    member: (object, key, owner, node) => owner.kind === 'any'
      ? call('_runtime.member', [object, py(key), '_frame', span(node.span)])
      : call('_generated_member', [object, py(key)]),
    text: (value, level, node) => spaces(level, write(node, py(value))),
    echo: (expression, level, node) => spaces(level, write(node, call('_runtime.escape', [expression, '_frame', span(node.expr.span)]))),
    block: block_,
    ifBlock: (node, n) => spaces(n, lines(
      block(`if ${py(node.id)} in _definitions`, emitNodes(node.body, target, 0)),
      node.otherwise ? block('else', emitNodes(node.otherwise, target, 0)) : '')),
    loopMeta: (loop, field) => `${call('_scope.loop_meta', [py(loop)])}.${field}`,
    index: (object, index, _owner, node) => call('_runtime.index', [object, index, '_frame', span(node.span)]),
    memberCall: (object, method, args, node) => call('_runtime.member_call', [object, py(method), list(args), '_frame', span(node.span)]),
    classCall: (className, method, args, node) => call('_runtime.class_call', [py(className), py(method), list(args), '_frame', span(node.span)]),
    toValue: value => value, // A Python record is already the map of its fields.
    call: (name, args, node) => call('_runtime.call', [py(name), list(args), '_frame', span(node.span)]),
    unary: (operator, operand, node) => call('_runtime.unary', [py(operator), operand, '_frame', span(node.span)]),
    binary: (operator, left, right, node) => {
      if (operator === '&&') return chain(call('_runtime.truthy', [left]), `and ${call('_runtime.truthy', [right])}`);
      if (operator === '||') return chain(call('_runtime.truthy', [left]), `or ${call('_runtime.truthy', [right])}`);
      if (operator === '??') return chain(left, `if ${left} is not None`, `else ${right}`);
      return call('_runtime.binary', [py(operator), left, right, '_frame', span(node.span)]);
    },
    ternary: (test, thenValue, elseValue) => chain(thenValue, `if ${call('_runtime.truthy', [test])}`, `else ${elseValue}`),
    list: (items, _type, node) => call('_runtime.depth', [call('_generated_list', [list(items.map(item => tuple([item.spread ? 'True' : 'False', item.spread ? call('_runtime.list_spread', [item.value, '_frame', span(item.span)]) : item.value])))]), '_frame', span(node.span)]),
    map: (entries, _type, node) => call('_runtime.depth', [call('_generated_map', [list(entries.map(item => item.spread
      ? tuple(['True', 'None', call('_runtime.map_spread', [item.value, '_frame', span(item.span)])])
      : tuple(['False', call('_runtime.stringify', [item.value[0], '_frame', span(item.node.key.span)]), item.value[1]])))]), '_frame', span(node.span)]),
    ifNode: (node, n) => spaces(n, lines(
      node.branches.map((branch, index) => block(`${index ? 'elif' : 'if'} ${call('_runtime.truthy', [emitExpression(branch.test, target)])}`, emitNodes(branch.body, target, 0))),
      node.otherwise ? block('else', emitNodes(node.otherwise, target, 0)) : '')),
    forNode,
    include: (node, n) => spaces(n, lines(
      call('_context.enter', [py(node.target), '_frame', span(node.span)]),
      block('try', call(functionName(node.target), ['_assign', '_definitions', call(inputClass(node.target), node.inputs.map(item => `${fieldName(item.name)}=${emitExpression(item.value, target)}`)), '_context', '_runtime', '_root_data', '_scope'])),
      block('finally', '_context.leave()'))),
  };
  return target;
}

// The names that the generated module imports, by module; a name is imported when the module uses it, and a module
// with null is imported whole.
const imports: [string, string[] | null][] = [
  ['math', null], ['time', null],
  ['polyspec.template.bind', ['BindError', 'bind_data', 'bind_map', 'check_number']],
  ['polyspec.template.context', ['Frame', 'LoopMeta', 'RenderContext', 'Scope']],
  ['polyspec.template.engine', ['PreparedRender', 'Program', 'RenderOptions']],
  ['polyspec.template.errors', ['TemplateError', 'internal_boundary']],
  ['polyspec.template.functions', ['Env']],
  ['polyspec.template.runtime_environment', ['RuntimeEnvironment']],
  ['polyspec.template.runtime_bindings', ['RuntimeBindings']],
];

/** A class whose `__init__` stores each of `names`, which default to None. */
function recordClass(name: string, names: string[]): string {
  if (names.length === 0) return block(`class ${name}`, 'pass');
  return block(`class ${name}`, block(`def __init__${tuple(['self', ...names.map(field => `${field}=None`)])}`, names.map(field => `self.${field} = ${field}`)));
}

export function emitDeclarations(context: BackendContext): Part[] {
  const { manifest } = context;
  const schema = bindingSchema(context);
  const used = (text: string, name: string): boolean => new RegExp(`\\b${name}\\b`).test(text.replace(/^(import|from) .*$/gm, ''));
  return [
    '# Generated by the polyspec template compiler. Do not edit.',
    dependent(text => imports.flatMap(([module, names]) => {
      if (names === null) return used(text, module) ? [`import ${module}`] : [];
      const kept = names.filter(name => used(text, name));
      return kept.length === 0 ? [] : [`from ${module} import ${kept.join(', ')}`];
    }).map((line, index, all) => index === all.findIndex(other => other.startsWith('from')) ? `\n${line}` : line).join('\n')),
    '',
    // A schema is kept when a helper that the program keeps reads it.
    definition('_GENERATED_RECORDS_SCHEMA', laid(`_GENERATED_RECORDS_SCHEMA = ${pyLiteral(schema.records)}`)),
    definition('_GENERATED_ASSIGN_SCHEMA', laid(`_GENERATED_ASSIGN_SCHEMA = ${pyLiteral(schema.assign)}`)),
    definition('_GENERATED_DEFINITION_SCHEMA', laid(`_GENERATED_DEFINITION_SCHEMA = ${pyLiteral(schema.definitions)}`)),
    laid(`\n\n${block('class _Definition', block(`def __init__${tuple(['self', 'template=None', 'html=None', 'data=None'])}`, 'self.template = template', 'self.html = html', 'self.data = data'))}`),
    ...context.templateBodies.map(template => laid(`\n\n${recordClass(inputClass(template.name), [...template.inputs.keys()].map(fieldName))}`)),
    laid(`\n\n${recordClass('Assign', Object.keys(manifest.fields).map(fieldName))}`),
  ];
}

// The helpers of the program, each kept only when the program uses it.
const helpers = {
  _generated_bind_type: `def _generated_bind_type(value, type_, path):
    if value is None:
        if type_.get("optional") or type_["kind"] in ("null", "any"):
            return None
        raise ValueError(f"{path} is required")
    kind = type_["kind"]
    if kind == "any":
        return value
    if kind in ("string", "number", "boolean"):
        valid = (
            isinstance(value, str)
            if kind == "string"
            else (isinstance(value, (int, float)) and not isinstance(value, bool))
            if kind == "number"
            else isinstance(value, bool)
        )
        if not valid:
            raise ValueError(f"{path} has an invalid type")
        return check_number(value) if kind == "number" else value
    if kind == "list":
        if not isinstance(value, list):
            raise ValueError(f"{path} is not a list")
        return [
            _generated_bind_type(item, type_["item"], f"{path}[{index}]")
            for index, item in enumerate(value)
        ]
    if kind == "map":
        if not isinstance(value, dict):
            raise ValueError(f"{path} is not a map")
        return {
            key: _generated_bind_type(item, type_["value"], f"{path}.{key}")
            for key, item in value.items()
        }
    if kind == "record":
        return _generated_bind_record(
            value, _GENERATED_RECORDS_SCHEMA[type_["name"]], path
        )
    raise ValueError(f"{path} has an unknown generated type")`,
  _generated_bind_record: `def _generated_bind_record(value, fields, path):
    if not isinstance(value, dict):
        raise ValueError(f"{path} is not an object")
    result = {}
    for name, type_ in fields.items():
        if name not in value:
            if not type_.get("optional"):
                raise ValueError(f"{path}.{name} is required")
            continue
        result[name] = _generated_bind_type(value[name], type_, f"{path}.{name}")
    return result`,
  _generated_member: `def _generated_member(value, key):
    # A typed record is a map of its present fields; an absent optional field and a null record read as null.
    return None if value is None else value.get(key)`,
  _generated_bind_assign: `def _generated_bind_assign(value):
    root = bind_map(value)
    values = {}
    for name, type_ in _GENERATED_ASSIGN_SCHEMA.items():
        if name in root:
            values[name] = _generated_bind_type(root[name], type_, "assign." + name)
    return Assign(**values), root`,
  _generated_bind_definitions: `def _generated_bind_definitions(raw):
    definitions = {}
    targets = {}
    for id_, entry in (raw or {}).items():
        spec = _GENERATED_DEFINITION_SCHEMA.get(id_)
        if spec is None:
            raise ValueError(f"define.{id_} is not declared")
        if isinstance(entry, str):
            if spec["target"] is None or entry != spec["target"]:
                raise ValueError(f"define.{id_} has an invalid template")
            definitions[id_] = _Definition(template=spec["target"])
            targets[id_] = {"target": spec["target"]}
            continue
        if not isinstance(entry, dict):
            raise ValueError(f"define.{id_} is not an object")
        template = entry.get("template")
        html = entry.get("html")
        data = bind_data(entry["data"]) if "data" in entry else None
        if isinstance(html, str):
            if not spec["html"] or "template" in entry or "data" in entry:
                raise ValueError(f"define.{id_} has an invalid html entry")
            definitions[id_] = _Definition(html=html)
            targets[id_] = {"target": None, "html": html}
            continue
        if (
            not isinstance(template, str)
            or spec["target"] is None
            or template != spec["target"]
        ):
            raise ValueError(f"define.{id_} has an invalid template")
        bound = None
        if "data" in entry:
            if not isinstance(data, dict):
                raise ValueError(f"define.{id_}.data is not an object")
            bound = {}
            for name, type_ in spec["input"].items():
                if name in data:
                    bound[name] = _generated_bind_type(
                        data[name], type_, f"define.{id_}.data.{name}"
                    )
        definitions[id_] = _Definition(template=spec["target"], data=bound)
        targets[id_] = {"target": spec["target"]}
    return definitions, targets`,
  _generated_list: `def _generated_list(items):
    result = []
    for spread, value in items:
        if spread:
            result.extend(value)
        else:
            result.append(value)
    return result`,
  _generated_map: `def _generated_map(items):
    result = {}
    for spread, key, value in items:
        if spread:
            result.update(value)
        else:
            result[key] = value
    return result`,
  _generated_env: `def _generated_env(raw):
    entry = raw if raw is not None else {}
    if not isinstance(entry, dict):
        raise BindError("E_DATA_UNSUPPORTED_TYPE", "env is not an object")
    timezone = entry.get("timezone", "Z")
    now = entry.get("now", math.floor(time.time()))
    if not isinstance(timezone, str):
        raise BindError("E_DATA_UNSUPPORTED_TYPE", "env.timezone is not a string")
    if not isinstance(now, (int, float)) or isinstance(now, bool):
        raise BindError("E_DATA_UNSUPPORTED_TYPE", "env.now is not a number")
    return Env(timezone, float(now))`,
  _generated_bind_assign_dynamic: `def _generated_bind_assign_dynamic(value):
    root = bind_map(value)
    return Assign(), root`,
};

export function emitRuntime(context: BackendContext): Part[] {
  const { _generated_bind_assign: typed, _generated_bind_assign_dynamic: dynamic, ...others } = helpers;
  const bindAssign = context.program.dynamicRoot ? dynamic.replace('_generated_bind_assign_dynamic', '_generated_bind_assign') : typed;
  return Object.entries({ ...others, _generated_bind_assign: bindAssign }).map(([name, code]) => definition(name, `\n\n${code}`));
}

export function emitTemplates(context: BackendContext): Part[] {
  const { program } = context;
  return context.templateBodies.map(template => {
    const typed = loweredTemplate(program, template.name);
    return laid(`\n\n${block(`def ${template.function}${tuple(['_assign', '_definitions', '_input', '_context', '_runtime', '_root_data', '_scope'])}`,
      `_frame = ${call('Frame', [py(template.name), list(typed.lines.map(String)), '_root_data'])}`,
      [...typed.inputs].map(([name]) => `_scope.locals[${py(name)}] = _input.${fieldName(name)}`),
      emitNodes(typed.body, context.target, 0))}`);
  });
}

export function emitEntry(context: BackendContext): Part[] {
  const entries = context.templateBodies.filter(template => template.inputs.size === 0);
  const fail = `raise ${call('_context.fail', [py('E_LOAD_NOT_FOUND'), 'None', 'None', `${py('template ')} + target + ${py(' does not exist')}`])}`;
  const dispatch = entries.map((template, index) => block(`${index ? 'elif' : 'if'} target == ${py(template.name)}`, call(functionName(template.name), ['_assign', '_definitions', `${inputClass(template.name)}()`, '_context', '_runtime', '_root_data', '_scope']), 'return'));
  return [
    laid(`\n\n${block(`def _render_template${tuple(['target', '_assign', '_definitions', '_context', '_runtime', '_root_data', '_scope'])}`, dispatch, entries.length > 0 ? block('else', fail) : fail)}`),
    `\n\nclass _GeneratedExecution:
    def __init__(self, target, assign, definitions, root_data, env, services, html):
        self.target = target
        self.assign = assign
        self.definitions = definitions
        self.root_data = root_data
        self.env = env
        self.services = services
        self.html = html

    def render(self):
        context = RenderContext(self.services, self.root_data, self.env, self.target)
        runtime = RuntimeBindings(context)
        scope = Scope()
        context.enter(self.target, None, None)
        try:
            if self.html is not None:
                context.output.write(self.html)
            else:
                _render_template(
                    self.target,
                    self.assign,
                    self.definitions,
                    context,
                    runtime,
                    self.root_data,
                    scope,
                )
            return context.output.text()
        finally:
            context.leave()


class _PreparedRender(PreparedRender):
    def __init__(self, name, execution):
        self.name = name
        self.execution = execution

    def render(self):
        return internal_boundary(self.name, self.execution.render)


class GeneratedProgram(Program):
    def __init__(self, runtime=None):
        self.runtime = runtime or RuntimeEnvironment()

    def prepare(self, target, assign=None, options=None):
        options = options or RenderOptions()
        if not isinstance(target, str):
            raise ValueError("generated target must be a template name")
        # A request that does not match the declared types raises a ValueError before rendering starts; it is the
        # argument error of Python and no template error (ERR-13), so it passes the boundary of render only.
        return self._prepare_bound(target, assign, options)

    def _prepare_bound(self, target, assign, options):
        try:
            typed_assign, root_data = _generated_bind_assign(assign)
            definitions, targets = _generated_bind_definitions(options.define)
            env = _generated_env(options.env)
        except BindError as error:
            raise TemplateError(error.code, target, 0, 0, 0, 0, str(error)) from None
        resolved = targets.get(target)
        target_name = resolved["target"] if resolved else target
        html = resolved.get("html") if resolved else None
        return _PreparedRender(
            target,
            _GeneratedExecution(
                target_name,
                typed_assign,
                definitions,
                root_data,
                env,
                self.runtime,
                html,
            ),
        )

    def render(self, target, assign=None, options=None):
        return self.prepare(target, assign, options).render()`,
  ];
}

