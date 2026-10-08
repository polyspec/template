// Python backend: emits one Python module per source graph. The generated code
// imports the runtime of the polyspec.template package and follows the same
// observable semantics as the AST engine (docs/spec/compiler.md).
import {
  baseTarget, emitExpression, emitNodes, fieldName, functionName, indent, inputName,
} from '../backend-support.mjs';

export const language = 'python';

const py = value => JSON.stringify(value);

// A Python literal of a JSON-shaped value (null -> None, true/false -> True/False).
function pyLiteral(value) {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return py(value);
  if (Array.isArray(value)) return `[${value.map(pyLiteral).join(', ')}]`;
  return `{${Object.entries(value).map(([key, item]) => `${py(key)}: ${pyLiteral(item)}`).join(', ')}}`;
}

function descriptor(source) {
  const optional = source.endsWith('?');
  const value = optional ? source.slice(0, -1) : source;
  const list = /^list<(.+)>$/.exec(value);
  if (list) return { kind: 'list', item: descriptor(list[1]), optional };
  const map = /^map<([^,]+),(.+)>$/.exec(value);
  if (map) return { kind: 'map', key: descriptor(map[1].trim()), value: descriptor(map[2].trim()), optional };
  if (['null', 'boolean', 'number', 'string', 'any'].includes(value)) return { kind: value, optional };
  return { kind: 'record', name: value, optional };
}

const inputClass = name => `_${inputName(name)}`;

function bindingSchema(context) {
  const records = Object.fromEntries(Object.entries({ ...(context.manifest.records ?? {}), ...(context.manifest.recordsExtra ?? {}) })
    .map(([name, fields]) => [name, Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, descriptor(type)]))]));
  const assign = Object.fromEntries(Object.entries(context.manifest.fields ?? {}).map(([field, type]) => [field, descriptor(type)]));
  const definitions = Object.fromEntries([...context.program.definitions].map(([id, definition]) => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    input: definition.template === null ? {} : Object.fromEntries([...context.program.templates.get(definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
  return { records, assign, definitions };
}

function numberLiteral(value) {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

export function createTarget({ program }) {
  const target = baseTarget('python');
  target.literal = value => {
    if (value === null) return 'None';
    if (typeof value === 'string') return py(value);
    if (typeof value === 'number') return numberLiteral(value);
    return value ? 'True' : 'False';
  };
  target.var = (name, _type, node) => program.dynamicRoot
    ? (node.scope ? `_scope.lookup(_frame, ${py(name)})` : `_runtime.member(_root_data, ${py(name)}, _frame, ${py(node.span)})`)
    : `_assign.${fieldName(name)}`;
  target.local = name => `_scope.lookup(_frame, ${py(name)})`;
  target.set = (name, value, level) => indent(level, `_scope.locals[${py(name)}] = ${value}`);
  target.member = (object, key, owner, node) => owner.kind === 'any'
    ? `_runtime.member(${object}, ${py(key)}, _frame, ${py(node.span)})`
    : `_generated_member(${object}, ${py(key)})`;
  target.text = (value, level, node) => indent(level, `_context.at(_frame, ${py(node.span)})\n_context.output.write(${py(value)})`);
  target.echo = (expression, level, node) => indent(level, `_context.at(_frame, ${py(node.span)})\n_context.output.write(_runtime.escape(${expression}, _frame, ${py(node.expr.span)}))`);
  target.block = (node, n) => {
    const undefinedMessage = 'define ' + node.id + ' is not registered';
    if (node.target === null) return indent(n, `_definition = _definitions.get(${py(node.id)})\nif _definition is None or _definition.html is None:\n${indent(1, `raise _runtime.error(_frame, ${py(node.span)}, 'E_RUNTIME_BLOCK_UNDEFINED', ${py(undefinedMessage)})`)}\n_context.at(_frame, ${py(node.span)})\n_context.output.write(_definition.html)`);
    const input = `${inputClass(node.target)}`;
    const call = `${functionName(node.target)}(_assign, _definitions, _input, _context, _runtime, _root_data, _block_scope)`;
    // The input starts from the root fallback, the definition data replaces the
    // fields it carries, and the scope of the call site replaces them again.
    const fallbackValue = item => {
      if (item.root) return emitExpression(item.root, target);
      if (item.valueType.optional) return 'None';
      return `raise _runtime.error(_frame, ${py(node.span)}, 'E_RUNTIME_TYPE', ${py(`generated input ${node.target}.${item.name} is missing`)})`;
    };
    const base = node.inputs.filter(item => item.root);
    const construct = `${input}(${base.map(item => `${fieldName(item.name)}=${fallbackValue(item)}`).join(', ')})`;
    const defined = node.inputs
      .map(item => `_input.${fieldName(item.name)} = (_definition.data.get(${py(item.name)}) if _definition.data is not None and ${py(item.name)} in _definition.data else _input.${fieldName(item.name)})`)
      .join('\n');
    const scoped = node.inputs.filter(item => item.scope)
      .map(item => `_input.${fieldName(item.name)} = ${emitExpression(item.scope, target)}`)
      .join('\n');
    const callBlock = `_block_scope = Scope()\n_context.enter(${py(node.target)}, _frame, ${py(node.span)})\ntry:\n${indent(1, call)}\nfinally:\n    _context.leave()`;
    if (node.id === null) {
      return indent(n, `_input = ${construct}\n${scoped}\n${callBlock}`);
    }
    const undefinedError = `if _definition is None:\n${indent(1, `raise _runtime.error(_frame, ${py(node.span)}, 'E_RUNTIME_BLOCK_UNDEFINED', ${py('define ' + node.id + ' is not registered')})`)}`;
    const register = node.path === null ? undefinedError
      : `if _definition is None:\n${indent(1, `_definition = _Definition(template=${py(node.target)}, data=None)\n_definitions[${py(node.id)}] = _definition`)}\nelif _definition.html is not None or _definition.template != ${py(node.target)}:\n${indent(1, `raise _runtime.error(_frame, ${py(node.span)}, 'E_RUNTIME_BLOCK_REDEFINED', ${py('define ' + node.id + ' is registered with a different template')})`)}`;
    return indent(n, `_definition = _definitions.get(${py(node.id)})\n${register}\nif _definition.html is not None:\n${indent(1, `_context.at(_frame, ${py(node.span)})\n_context.output.write(_definition.html)`)}\nelse:\n${indent(1, `_input = ${construct}`)}\n${defined ? indent(1, defined) + '\n' : ''}${scoped ? indent(1, scoped) + '\n' : ''}${indent(1, callBlock)}`);
  };
  target.ifBlock = (node, n) => indent(n, `if ${py(node.id)} in _definitions:\n${emitNodes(node.body, target, n + 1)}${node.otherwise ? `\nelse:\n${emitNodes(node.otherwise, target, n + 1)}` : ''}`);
  target.loopMeta = (loop, field) => `_scope.loop_meta(${py(loop)}).${field}`;
  target.index = (object, index, _owner, node) => `_runtime.index(${object}, ${index}, _frame, ${py(node.span)})`;
  target.memberCall = (object, method, args, node) => `_runtime.member_call(${object}, ${py(method)}, [${args.join(', ')}], _frame, ${py(node.span)})`;
  target.classCall = (className, method, args, node) => `_runtime.class_call(${py(className)}, ${py(method)}, [${args.join(', ')}], _frame, ${py(node.span)})`;
  target.toValue = value => value;  // A Python record is already the map of its fields.
  target.call = (name, args, node) => `_runtime.call(${py(name)}, [${args.join(', ')}], _frame, ${py(node.span)})`;
  target.unary = (operator, operand, node) => `_runtime.unary(${py(operator)}, ${operand}, _frame, ${py(node.span)})`;
  target.binary = (operator, left, right, node) => {
    if (operator === '&&') return `(_runtime.truthy(${left}) and _runtime.truthy(${right}))`;
    if (operator === '||') return `(_runtime.truthy(${left}) or _runtime.truthy(${right}))`;
    if (operator === '??') return `(${left} if ${left} is not None else ${right})`;
    return `_runtime.binary(${py(operator)}, ${left}, ${right}, _frame, ${py(node.span)})`;
  };
  target.ternary = (test, thenValue, elseValue) => `(${thenValue} if _runtime.truthy(${test}) else ${elseValue})`;
  target.list = (items, _type, node) => `_runtime.depth(_generated_list([${items.map(item => `(${item.spread ? 'True' : 'False'}, ${item.spread ? `_runtime.list_spread(${item.value}, _frame, ${py(item.span)})` : item.value})`).join(', ')}]), _frame, ${py(node.span)})`;
  target.map = (entries, _type, node) => `_runtime.depth(_generated_map([${entries.map(item => item.spread ? `(True, None, _runtime.map_spread(${item.value}, _frame, ${py(item.span)}))` : `(False, _runtime.stringify(${item.value[0]}, _frame, ${py(item.node.key.span)}), ${item.value[1]})`).join(', ')}]), _frame, ${py(node.span)})`;
  target.ifNode = (node, n) => {
    const parts = node.branches.map((branch, index) =>
      `${'    '.repeat(n)}${index ? 'elif' : 'if'} _runtime.truthy(${emitExpression(branch.test, target)}):\n${emitNodes(branch.body, target, n + 1)}`);
    if (node.otherwise) parts.push(`${'    '.repeat(n)}else:\n${emitNodes(node.otherwise, target, n + 1)}`);
    return parts.join('\n');
  };
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const pad = '    '.repeat(n + 1);
    const body = emitNodes(node.body, target, n + 3);
    const empty = node.empty ? emitNodes(node.empty, target, n + 1) : `${'    '.repeat(n + 1)}pass`;
    return `${'    '.repeat(n)}_${name}_entries = _runtime.entries(${emitExpression(node.iter, target)}, _frame, ${py(node.span)})
${'    '.repeat(n)}_${name}_size = len(_${name}_entries)
${'    '.repeat(n)}_${name}_had = ${py(node.name)} in _scope.locals
${'    '.repeat(n)}_${name}_previous = _scope.locals.get(${py(node.name)})
${'    '.repeat(n)}if _${name}_size == 0:
${empty}
${'    '.repeat(n)}else:
${pad}_${name}_stack = _scope.loops.setdefault(${py(node.name)}, [])
${pad}_${name}_stack.append(LoopMeta(_${name}_size))
${pad}try:
${pad}    for _${name}_index, (_${name}_key, _${name}_value) in enumerate(_${name}_entries):
${pad}        _context.iterations += 1
${pad}        _runtime.limit('iteration', _context.iterations, _frame, ${py(node.span)})
${pad}        _${name}_stack[-1].index_ = float(_${name}_index)
${pad}        _${name}_stack[-1].key_ = _${name}_key
${pad}        _${name}_stack[-1].value_ = _${name}_value
${pad}        _${name}_stack[-1].first_ = _${name}_index == 0
${pad}        _${name}_stack[-1].last_ = _${name}_index == _${name}_size - 1
${pad}        _scope.locals[${py(node.name)}] = _${name}_value
${body}
${pad}finally:
${pad}    _${name}_stack.pop()
${pad}    if _${name}_had:
${pad}        _scope.locals[${py(node.name)}] = _${name}_previous
${pad}    else:
${pad}        _scope.locals.pop(${py(node.name)}, None)`;
  };
  target.include = (node, n) => indent(n, `_context.enter(${py(node.target)}, _frame, ${py(node.span)})\ntry:\n${indent(1, `${functionName(node.target)}(_assign, _definitions, ${inputClass(node.target)}(${node.inputs.map(item => `${fieldName(item.name)}=${emitExpression(item.value, target)}`).join(', ')}), _context, _runtime, _root_data, _scope)`)}\nfinally:\n    _context.leave()`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest } = context;
  const fields = manifest.fields ?? {};
  const schema = bindingSchema(context);
  const inputClasses = context.templateBodies.map(template => {
    const typed = program.templates.get(template.name);
    const members = [...typed.inputs].map(([name]) => `    ${fieldName(name)} = None`).join('\n');
    return `class ${inputClass(template.name)}:\n    def __init__(self, ${[...typed.inputs].map(([name]) => `${fieldName(name)}=None`).join(', ')}):\n${[...typed.inputs].map(([name]) => `        self.${fieldName(name)} = ${fieldName(name)}`).join('\n') || '        pass'}`;
  }).join('\n\n');
  const assignClass = `class Assign:\n    def __init__(self, ${Object.keys(fields).map(name => `${fieldName(name)}=None`).join(', ')}):\n${Object.keys(fields).map(name => `        self.${fieldName(name)} = ${fieldName(name)}`).join('\n') || '        pass'}`;
  return `# Generated by the polyspec template compiler. Do not edit.\nimport math\nimport time\n\nfrom polyspec.template.bind import BindError, bind_data, bind_map, check_number\nfrom polyspec.template.context import Frame, LoopMeta, RenderContext, Scope\nfrom polyspec.template.engine import PreparedRender, Program, RenderOptions\nfrom polyspec.template.errors import TemplateError, internal_boundary\nfrom polyspec.template.functions import Env\nfrom polyspec.template.runtime_environment import RuntimeEnvironment\nfrom polyspec.template.runtime_bindings import RuntimeBindings\n\n_GENERATED_RECORDS_SCHEMA = ${pyLiteral(schema.records)}\n_GENERATED_ASSIGN_SCHEMA = ${pyLiteral(schema.assign)}\n_GENERATED_DEFINITION_SCHEMA = ${pyLiteral(schema.definitions)}\n\n\nclass _Definition:\n    def __init__(self, template=None, html=None, data=None):\n        self.template = template\n        self.html = html\n        self.data = data\n\n\n${inputClasses}\n\n\n${assignClass}`;
}

export function emitRuntime(context) {
  const dynamic = context.program.dynamicRoot;
  const text = "def _generated_bind_type(value, type_, path):\n    if value is None:\n        if type_.get('optional') or type_['kind'] in ('null', 'any'):\n            return None\n        raise ValueError(f'{path} is required')\n    kind = type_['kind']\n    if kind == 'any':\n        return value\n    if kind in ('string', 'number', 'boolean'):\n        valid = (isinstance(value, str) if kind == 'string'\n                 else (isinstance(value, (int, float)) and not isinstance(value, bool)) if kind == 'number'\n                 else isinstance(value, bool))\n        if not valid:\n            raise ValueError(f'{path} has an invalid type')\n        return check_number(value) if kind == 'number' else value\n    if kind == 'list':\n        if not isinstance(value, list):\n            raise ValueError(f'{path} is not a list')\n        return [_generated_bind_type(item, type_['item'], f'{path}[{index}]') for index, item in enumerate(value)]\n    if kind == 'map':\n        if not isinstance(value, dict):\n            raise ValueError(f'{path} is not a map')\n        return {key: _generated_bind_type(item, type_['value'], f'{path}.{key}') for key, item in value.items()}\n    if kind == 'record':\n        return _generated_bind_record(value, _GENERATED_RECORDS_SCHEMA[type_['name']], path)\n    raise ValueError(f'{path} has an unknown generated type')\n\n\ndef _generated_bind_record(value, fields, path):\n    if not isinstance(value, dict):\n        raise ValueError(f'{path} is not an object')\n    result = {}\n    for name, type_ in fields.items():\n        if name not in value:\n            if not type_.get('optional'):\n                raise ValueError(f'{path}.{name} is required')\n            continue\n        result[name] = _generated_bind_type(value[name], type_, f'{path}.{name}')\n    return result\n\n\ndef _generated_member(value, key):\n    # A typed record is a map of its present fields; an absent optional field and a null record read as null.\n    return None if value is None else value.get(key)\n\n\ndef _generated_bind_assign(value):\n    root = bind_map(value)\n    if DYNAMIC_ROOT_PLACEHOLDER:\n        return Assign(), root\n    values = {}\n    for name, type_ in _GENERATED_ASSIGN_SCHEMA.items():\n        if name in root:\n            values[name] = _generated_bind_type(root[name], type_, 'assign.' + name)\n    return Assign(**values), root\n\n\ndef _generated_bind_definitions(raw):\n    definitions = {}\n    targets = {}\n    for id_, entry in (raw or {}).items():\n        spec = _GENERATED_DEFINITION_SCHEMA.get(id_)\n        if spec is None:\n            raise ValueError(f'define.{id_} is not declared')\n        if isinstance(entry, str):\n            if spec['target'] is None or entry != spec['target']:\n                raise ValueError(f'define.{id_} has an invalid template')\n            definitions[id_] = _Definition(template=spec['target'])\n            targets[id_] = {'target': spec['target']}\n            continue\n        if not isinstance(entry, dict):\n            raise ValueError(f'define.{id_} is not an object')\n        template = entry.get('template')\n        html = entry.get('html')\n        data = bind_data(entry['data']) if 'data' in entry else None\n        if isinstance(html, str):\n            if not spec['html'] or 'template' in entry or 'data' in entry:\n                raise ValueError(f'define.{id_} has an invalid html entry')\n            definitions[id_] = _Definition(html=html)\n            targets[id_] = {'target': None, 'html': html}\n            continue\n        if not isinstance(template, str) or spec['target'] is None or template != spec['target']:\n            raise ValueError(f'define.{id_} has an invalid template')\n        bound = None\n        if 'data' in entry:\n            if not isinstance(data, dict):\n                raise ValueError(f'define.{id_}.data is not an object')\n            bound = {}\n            for name, type_ in spec['input'].items():\n                if name in data:\n                    bound[name] = _generated_bind_type(data[name], type_, f'define.{id_}.data.{name}')\n        definitions[id_] = _Definition(template=spec['target'], data=bound)\n        targets[id_] = {'target': spec['target']}\n    return definitions, targets\n\n\ndef _generated_list(items):\n    result = []\n    for spread, value in items:\n        if spread:\n            result.extend(value)\n        else:\n            result.append(value)\n    return result\n\n\ndef _generated_map(items):\n    result = {}\n    for spread, key, value in items:\n        if spread:\n            result.update(value)\n        else:\n            result[key] = value\n    return result\n\n\ndef _generated_env(raw):\n    entry = raw if raw is not None else {}\n    if not isinstance(entry, dict):\n        raise BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object')\n    timezone = entry.get('timezone', 'Z')\n    now = entry.get('now', math.floor(time.time()))\n    if not isinstance(timezone, str):\n        raise BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string')\n    if not isinstance(now, (int, float)) or isinstance(now, bool):\n        raise BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number')\n    return Env(timezone, float(now))\n";
  return text.replace('DYNAMIC_ROOT_PLACEHOLDER', dynamic ? 'True' : 'False');
}

export function emitTemplates(context) {
  const { program } = context;
  return context.templateBodies.map(template => {
    const typed = program.templates.get(template.name);
    const locals = [...typed.inputs].map(([name]) => `    _scope.locals[${py(name)}] = _input.${fieldName(name)}`).join('\n');
    return `def ${template.function}(_assign, _definitions, _input, _context, _runtime, _root_data, _scope):\n    _frame = Frame(${py(template.name)}, ${JSON.stringify(typed.lines)}, _root_data)\n${locals}\n${template.body}`;
  }).join('\n\n');
}

export function emitEntry(context) {
  const entries = context.templateBodies.filter(template => template.inputs.size === 0);
  const dispatch = entries.map((template, index) =>
    `    ${index ? 'elif' : 'if'} target == ${py(template.name)}:\n        ${functionName(template.name)}(_assign, _definitions, ${inputClass(template.name)}(), _context, _runtime, _root_data, _scope)\n        return`).join('\n');
  return `def _render_template(target, _assign, _definitions, _context, _runtime, _root_data, _scope):
${dispatch}
    else:
        raise _context.fail('E_LOAD_NOT_FOUND', None, None, 'template ' + target + ' does not exist')


class _GeneratedExecution:
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
                _render_template(self.target, self.assign, self.definitions, context, runtime, self.root_data, scope)
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
            raise ValueError('generated target must be a template name')
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
        target_name = resolved['target'] if resolved else target
        html = resolved.get('html') if resolved else None
        return _PreparedRender(target, _GeneratedExecution(target_name, typed_assign, definitions, root_data, env, self.runtime, html))

    def render(self, target, assign=None, options=None):
        return self.prepare(target, assign, options).render()
`;
}
