// The PHP backend. It writes one PSR-4 file per class under the namespace of the compile options (T25.1): the records,
// Assign, an input and a definition data class per template, Definition, Definitions and ArtifactManifest, the
// templates as static methods of GeneratedTemplates, the helpers that the program uses as static methods of
// GeneratedRuntime, and GeneratedExecution and GeneratedProgram. Every file follows PSR-12: one statement per line,
// braces on every control structure, four spaces of indentation, and PascalCase classes with camelCase methods.
import {
  baseTarget, definition, dependent, emitExpression, emitNodes, fieldName, file, optional, phpLiteral, phpType,
  usedDefinitions,
} from '../backend-support.mjs';

export const language = 'php';

const pascal = name => name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('');
const inputClass = name => `Input${pascal(name)}`;
const dataClass = name => `DefinitionData${pascal(name)}`;
const renderMethod = name => `render${pascal(name)}`;

/** `code` at `level`: every line that is not empty starts with four spaces per level. */
const spaces = (level, code) => code.split('\n').map(line => line === '' ? '' : '    '.repeat(level) + line).join('\n');
/** The lines of a statement list, without the empty parts. */
const lines = (...parts) => parts.flat().filter(part => part !== '').join('\n');
/** A block `{ ... }` after `head`, with its statements one level deeper. */
const braced = (head, ...body) => `${head} {\n${spaces(1, lines(...body))}\n}`;
/** A method or function with its brace on the next line, as PSR-12 places it. */
const method = (head, ...body) => `${head}\n{\n${spaces(1, lines(...body))}\n}`;
const guarded = (call, cleanup) => `${braced('try', call)} ${braced('finally', cleanup)}`;

// The classes that a file may use, by their short names.
const imports = {
  Bind: 'Polyspec\\Template\\Value\\Bind',
  BindError: 'Polyspec\\Template\\Value\\BindError',
  Context: 'Polyspec\\Template\\Render\\Context',
  Frame: 'Polyspec\\Template\\Render\\Frame',
  InternalBoundary: 'Polyspec\\Template\\InternalBoundary',
  InvalidArgumentException: 'InvalidArgumentException',
  MapValue: 'Polyspec\\Template\\Value\\MapValue',
  PreparedExecution: 'Polyspec\\Template\\PreparedExecution',
  PreparedRender: 'Polyspec\\Template\\PreparedRender',
  Program: 'Polyspec\\Template\\Program',
  RuntimeBindings: 'Polyspec\\Template\\Render\\RuntimeBindings',
  RuntimeEnvironment: 'Polyspec\\Template\\Render\\RuntimeEnvironment',
  Scope: 'Polyspec\\Template\\Render\\Scope',
  TemplateError: 'Polyspec\\Template\\TemplateError',
};

/** A PHP file of the namespace with the `use` statements of the classes that its code names. */
function phpFile(namespace, code) {
  const uses = Object.entries(imports)
    .filter(([name]) => new RegExp(`(?<![\\\\$>:\\w])${name}\\b`).test(code))
    .map(([, name]) => `use ${name};`)
    .sort();
  return ['<?php', 'declare(strict_types=1);', `namespace ${namespace};`, ...(uses.length > 0 ? [uses.join('\n')] : []), code].join('\n\n');
}

/** A final class whose constructor promotes `parameters`, one per line. */
function promotedClass(name, parameters) {
  if (parameters.length === 0) return `final class ${name}\n{\n}`;
  return `final class ${name}\n{\n${spaces(1, `public function __construct(\n${spaces(1, parameters.map(parameter => `${parameter},`).join('\n'))}\n) {\n}`)}\n}`;
}

const nullable = type => optional(type) && phpType(type) !== 'mixed' ? '?' : '';
const readonlyField = (name, type) => `public readonly ${nullable(type)}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;
const inputField = (name, type) => `public ${nullable(type)}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;

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
  const records = Object.fromEntries(Object.entries({ ...context.manifest.records, ...context.manifest.recordsExtra })
    .map(([name, fields]) => [name, Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, descriptor(type)]))]));
  const assign = Object.fromEntries(Object.entries(context.manifest.fields ?? {}).map(([field, type]) => [field, descriptor(type)]));
  const definitions = Object.fromEntries([...context.program.definitions].map(([id, definition]) => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    class: definition.template === null ? null : dataClass(definition.template),
    input: definition.template === null ? {} : Object.fromEntries([...context.program.templates.get(definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
  return { records, assign, definitions };
}

const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64');

export function createTarget({ program }) {
  const target = baseTarget(language);
  const span = node => phpLiteral(node.span);
  target.var = (name, _type, node) => program.dynamicRoot ? node.scope ? `$scope->lookup($frame, ${phpLiteral(name)})` : `$runtime->member($rootData, ${phpLiteral(name)}, $frame, ${span(node)})` : `$assign->${name}`;
  target.local = name => `$scope->lookup($frame, ${phpLiteral(name)})`;
  target.set = (name, value, level) => spaces(level, `$scope->locals->set(${phpLiteral(name)}, ${value});`);
  target.member = (object, key, owner, node) => owner.kind === 'any' ? `$runtime->member(${object}, ${phpLiteral(key)}, $frame, ${span(node)})` : `${object}?->${key}`;
  const write = (node, value) => `$context->at($frame, ${span(node)});\n$context->write(${value});`;
  target.text = (value, level, node) => spaces(level, write(node, phpLiteral(value)));
  target.echo = (expression, level, node) => spaces(level, write(node, `$runtime->escape(${expression}, $frame, ${phpLiteral(node.expr.span)})`));
  const error = (node, code, message) => `$runtime->error($frame, ${span(node)}, '${code}', ${phpLiteral(message)})`;
  const enter = (node, call) => [
    '$blockScope = new Scope();',
    `$context->enter(${phpLiteral(node.target)}, $frame, ${span(node)});`,
    guarded(`self::${call};`, '$context->leave();'),
  ];
  target.block = (node, n) => {
    if (node.target === null) {
      return spaces(n, lines(
        `$definition = $definitions->${fieldName(node.id)};`,
        braced('if ($definition?->html === null)', `throw ${error(node, 'E_RUNTIME_BLOCK_UNDEFINED', `define ${node.id} is not registered`)};`),
        write(node, '$definition->html')));
    }
    const missing = item => `throw ${error(node, 'E_RUNTIME_TYPE', `generated input ${node.target}.${item.name} is missing`)}`;
    const fallbackValue = item => {
      if (item.root) return emitExpression(item.root, target);
      if (item.valueType.optional) return 'null';
      if (node.id !== null) return `($definition?->data !== null && $definition->data->has_${fieldName(item.name)} ? $definition->data->${fieldName(item.name)} : ${missing(item)})`;
      return missing(item);
    };
    const construct = `$input = new ${inputClass(node.target)}(${node.inputs.map(item => `${fieldName(item.name)}: ${fallbackValue(item)}`).join(', ')});`;
    const defined = node.inputs.map(item => braced(`if ($definition->data->has_${fieldName(item.name)})`, `$input->${fieldName(item.name)} = $definition->data->${fieldName(item.name)};`));
    const scoped = node.inputs.filter(item => item.scope).map(item => `$input->${fieldName(item.name)} = ${emitExpression(item.scope, target)};`);
    const call = `${renderMethod(node.target)}($assign, $definitions, $input, $context, $runtime, $rootData, $blockScope)`;
    if (node.id === null) return spaces(n, lines(construct, scoped, enter(node, call)));
    const field = fieldName(node.id);
    const registration = node.path === null
      ? braced('if ($definition === null)', `throw ${error(node, 'E_RUNTIME_BLOCK_UNDEFINED', `define ${node.id} is not registered`)};`)
      : `${braced('if ($definition === null)', `$definition = new Definition(template: ${phpLiteral(node.target)});`, `$definitions->${field} = $definition;`)} ${braced(`elseif ($definition->html !== null || $definition->template !== ${phpLiteral(node.target)})`, `throw ${error(node, 'E_RUNTIME_BLOCK_REDEFINED', `define ${node.id} is registered with a different template`)};`)}`;
    return spaces(n, lines(
      `$definition = $definitions->${field};`,
      registration,
      `${braced('if ($definition?->html !== null)', write(node, '$definition->html'))} ${braced('else',
        braced(`if ($definition?->data !== null && !($definition->data instanceof ${dataClass(node.target)}))`, `throw ${error(node, 'E_RUNTIME_TYPE', `generated definition ${node.id} data has an invalid type`)};`),
        construct,
        defined.length > 0 ? braced('if ($definition?->data !== null)', defined) : '',
        scoped,
        enter(node, call))}`));
  };
  target.ifBlock = (node, n) => spaces(n, `${braced(`if ($definitions->${fieldName(node.id)} !== null)`, emitNodes(node.body, target, 0))}${node.otherwise ? ` ${braced('else', emitNodes(node.otherwise, target, 0))}` : ''}`);
  target.loopMeta = (loop, field) => `$scope->loopMeta(${phpLiteral(loop)})[${phpLiteral(field)}]`;
  target.index = (object, index, _owner, node) => `$runtime->index(${object}, ${index}, $frame, ${span(node)})`;
  target.memberCall = (object, method, args, node) => `$runtime->memberCall(${object}, ${phpLiteral(method)}, [${args.join(', ')}], $frame, ${span(node)})`;
  target.classCall = (className, method, args, node) => `$runtime->classCall(${phpLiteral(className)}, ${phpLiteral(method)}, [${args.join(', ')}], $frame, ${span(node)})`;
  target.toValue = (value, type) => `GeneratedRuntime::toValue(${value}, GeneratedRuntime::schema('${encoded(descriptor(type.source))}'))`;
  target.call = (name, args, node) => `$runtime->call(${phpLiteral(name)}, [${args.join(', ')}], $frame, ${span(node)})`;
  target.unary = (operator, operand, node) => `$runtime->unary(${phpLiteral(operator)}, ${operand}, $frame, ${span(node)})`;
  target.binary = (operator, left, right, node) => {
    if (operator === '&&') return `($runtime->truthy(${left}) && $runtime->truthy(${right}))`;
    if (operator === '||') return `($runtime->truthy(${left}) || $runtime->truthy(${right}))`;
    if (operator === '??') return `((${left}) ?? (${right}))`;
    return `$runtime->binary(${phpLiteral(operator)}, ${left}, ${right}, $frame, ${span(node)})`;
  };
  target.ternary = (test, thenValue, elseValue) => `($runtime->truthy(${test}) ? ${thenValue} : ${elseValue})`;
  target.list = (items, _type, node) => `$runtime->depth(GeneratedRuntime::list([${items.map(item => `['spread' => ${item.spread}, 'value' => ${item.spread ? `$runtime->listSpread(${item.value}, $frame, ${phpLiteral(item.span)})` : item.value}]`).join(', ')}]), $frame, ${span(node)})`;
  target.map = (entries, _type, node) => `$runtime->depth(GeneratedRuntime::map([${entries.map(item => item.spread ? `['spread' => true, 'value' => $runtime->mapSpread(${item.value}, $frame, ${phpLiteral(item.span)})]` : `['spread' => false, 'key' => ${item.value[0]}, 'value' => ${item.value[1]}]`).join(', ')}]), $frame, ${span(node)})`;
  target.ifNode = (node, n) => {
    const branches = node.branches.map((branch, index) => braced(`${index ? 'elseif' : 'if'} ($runtime->truthy(${emitExpression(branch.test, target)}))`, emitNodes(branch.body, target, 0)));
    return spaces(n, `${branches.join(' ')}${node.otherwise ? ` ${braced('else', emitNodes(node.otherwise, target, 0))}` : ''}`);
  };
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const loop = phpLiteral(node.name);
    return spaces(n, lines(
      `$${name}_entries = $runtime->entries(${emitExpression(node.iter, target)}, $frame, ${span(node)});`,
      `$${name}_size = count($${name}_entries);`,
      `$${name}_last_index = $${name}_size - 1;`,
      `$${name}_had = $scope->locals->has(${loop});`,
      `$${name}_previous = $scope->locals->get(${loop});`,
      braced(`foreach ($${name}_entries as $${name}_index => [$${name}_key, $${name}_value])`,
        `$scope->locals->set(${loop}, $${name}_value);`,
        `$${name}_stack = $scope->loops[${loop}] ?? [];`,
        `$${name}_stack[] = ['index_' => (float) $${name}_index, 'size_' => (float) $${name}_size, 'first_' => $${name}_index === 0, 'last_' => $${name}_index === $${name}_last_index, 'key_' => $${name}_key, 'value_' => $${name}_value];`,
        `$scope->loops[${loop}] = $${name}_stack;`,
        '$context->iterations++;',
        `$runtime->limit('iteration', $context->iterations, $frame, ${span(node)});`,
        emitNodes(node.body, target, 0),
        `$${name}_stack = $scope->loops[${loop}];`,
        `array_pop($${name}_stack);`,
        `${braced(`if ($${name}_stack === [])`, `unset($scope->loops[${loop}]);`)} ${braced('else', `$scope->loops[${loop}] = $${name}_stack;`)}`),
      `${braced(`if ($${name}_had)`, `$scope->locals->set(${loop}, $${name}_previous);`)} ${braced('else', `$scope->locals->remove(${loop});`)}`,
      node.empty ? braced(`if ($${name}_size === 0)`, emitNodes(node.empty, target, 0)) : ''));
  };
  target.include = (node, n) => spaces(n, lines(
    `$context->enter(${phpLiteral(node.target)}, $frame, ${span(node)});`,
    guarded(`self::${renderMethod(node.target)}($assign, $definitions, new ${inputClass(node.target)}(${node.inputs.map(item => `${fieldName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')}), $context, $runtime, $rootData, $scope);`, '$context->leave();')));
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies, options } = context;
  const namespace = options.phpNamespace;
  const records = { ...manifest.records, ...manifest.recordsExtra };
  const fileOf = (name, code) => [file(`${name}.php`), phpFile(namespace, code)];
  return [
    ...Object.entries(records).flatMap(([name, members]) => fileOf(name, promotedClass(name, Object.entries(members).map(([key, type]) => readonlyField(key, type))))),
    ...fileOf('Assign', promotedClass('Assign', program.dynamicRoot ? [] : Object.entries(manifest.fields ?? {}).map(([name, type]) => readonlyField(name, type)))),
    ...templateBodies.flatMap(template => fileOf(inputClass(template.name), promotedClass(inputClass(template.name), [...template.inputs].map(([name, type]) => inputField(name, type.source))))),
    ...templateBodies.flatMap(template => fileOf(dataClass(template.name), promotedClass(dataClass(template.name), [...template.inputs].flatMap(([name, type]) => [
      `public bool $has_${fieldName(name)} = false`,
      `public ${phpType(type.source) === 'mixed' ? 'mixed' : `?${phpType(type.source)}`} $${fieldName(name)} = null`,
    ])))),
    ...fileOf('Definition', promotedClass('Definition', ['public readonly ?string $template = null', 'public readonly ?string $html = null', 'public readonly mixed $data = null'])),
    ...fileOf('Definitions', promotedClass('Definitions', [...program.definitions].map(([name]) => `public ?Definition $${fieldName(name)} = null`))),
    ...fileOf('ArtifactManifest', promotedClass('ArtifactManifest', ['public readonly int $schema', 'public readonly string $mode', 'public readonly string $target', 'public readonly string $entry', 'public readonly string $sourceDigest', 'public readonly string $typeDigest', 'public readonly string $contractDigest', 'public readonly array $files'])),
  ];
}

// The static methods and constants of GeneratedRuntime, each kept only when the program uses it.
function runtimeMembers(context) {
  const schema = bindingSchema(context);
  const method = (name, code) => definition(name, code, new RegExp(`::${name}\\(`));
  const constant = (name, value) => definition(name, `private const ${name} = '${encoded(value)}';`, new RegExp(`::${name}\\b`));
  return [
    constant('RECORDS_SCHEMA', schema.records),
    constant('ASSIGN_SCHEMA', schema.assign),
    constant('DEFINITION_SCHEMA', schema.definitions),
    method('schema', `public static function schema(string $encoded): array
{
    static $schemas = [];

    return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR);
}`),
    method('bindType', `public static function bindType(mixed $value, array $type, string $path): mixed
{
    if ($value === null) {
        if (($type['optional'] ?? false) || $type['kind'] === 'null' || $type['kind'] === 'any') {
            return null;
        }
        throw new InvalidArgumentException($path . ' is required');
    }
    if ($type['kind'] === 'any') {
        return $value;
    }
    if (in_array($type['kind'], ['string', 'number', 'boolean'], true)) {
        $valid = match ($type['kind']) {
            'string' => is_string($value),
            'number' => is_float($value) || is_int($value),
            default => is_bool($value),
        };
        if (!$valid) {
            throw new InvalidArgumentException($path . ' has an invalid type');
        }

        return $type['kind'] === 'number' ? (float) $value : $value;
    }
    if ($type['kind'] === 'list') {
        if (!is_array($value)) {
            throw new InvalidArgumentException($path . ' is not a list');
        }

        return array_map(
            fn ($item, $index) => self::bindType($item, $type['item'], $path . '[' . $index . ']'),
            $value,
            array_keys($value),
        );
    }
    if ($type['kind'] === 'map') {
        if (!$value instanceof MapValue) {
            throw new InvalidArgumentException($path . ' is not a map');
        }
        $result = new MapValue();
        foreach ($value->entries() as $key => $item) {
            $result->set(
                (string) self::bindType($key, $type['key'], $path . '.key'),
                self::bindType($item, $type['value'], $path . '.' . $key),
            );
        }

        return $result;
    }
    if ($type['kind'] === 'record') {
        $records = self::schema(self::RECORDS_SCHEMA);

        return self::bindRecord($value, $records[$type['name']], __NAMESPACE__ . '\\\\' . $type['name'], $path);
    }
    throw new InvalidArgumentException($path . ' has an unknown generated type');
}`),
    method('toValue', `public static function toValue(mixed $value, array $type): mixed
{
    if ($value === null) {
        return null;
    }
    if ($type['kind'] === 'record') {
        if ($value instanceof MapValue) {
            return $value;
        }
        $map = new MapValue();
        foreach (self::schema(self::RECORDS_SCHEMA)[$type['name']] as $name => $field) {
            $map->set($name, self::toValue($value->{$name}, $field));
        }

        return $map;
    }
    if ($type['kind'] === 'list') {
        return array_map(static fn (mixed $item): mixed => self::toValue($item, $type['item']), $value);
    }
    if ($type['kind'] === 'map') {
        $map = new MapValue();
        foreach ($value->entries() as $key => $item) {
            $map->set($key, self::toValue($item, $type['value']));
        }

        return $map;
    }

    return $value;
}`),
    method('bindRecord', `public static function bindRecord(mixed $value, array $fields, string $class, string $path): object
{
    if (!$value instanceof MapValue) {
        throw new InvalidArgumentException($path . ' is not an object');
    }
    $arguments = [];
    foreach ($fields as $name => $type) {
        if (!$value->has($name)) {
            if (!($type['optional'] ?? false)) {
                throw new InvalidArgumentException($path . '.' . $name . ' is required');
            }
            continue;
        }
        $arguments[$name] = self::bindType($value->get($name), $type, $path . '.' . $name);
    }

    return new $class(...$arguments);
}`),
    method('bindAssign', context.program.dynamicRoot
      ? `public static function bindAssign(mixed $value): array
{
    $root = $value === null ? new MapValue() : Bind::map($value);

    return [new Assign(), $root];
}`
      : `public static function bindAssign(mixed $value): array
{
    $root = $value === null ? new MapValue() : Bind::map($value);

    return [self::bindRecord($root, self::schema(self::ASSIGN_SCHEMA), Assign::class, 'assign'), $root];
}`),
    method('bindDefinitions', `public static function bindDefinitions(array $input): array
{
    $arguments = [];
    $targets = [];
    $specs = self::schema(self::DEFINITION_SCHEMA);
    foreach ($input as $id => $raw) {
        $id = (string) $id;
        if (preg_match('//u', $id) !== 1) {
            throw new BindError('E_DATA_INVALID_UTF8', 'a define id is not valid UTF-8');
        }
        $spec = $specs[$id] ?? null;
        if ($spec === null) {
            throw new InvalidArgumentException('define.' . $id . ' is not declared');
        }
        if (is_string($raw)) {
            if ($spec['target'] === null || $raw !== $spec['target']) {
                throw new InvalidArgumentException('define.' . $id . ' has an invalid template');
            }
            $arguments[$spec['field']] = new Definition(template: $spec['target']);
            $targets[$id] = ['target' => $spec['target']];
            continue;
        }
        if (!is_array($raw)) {
            throw new InvalidArgumentException('define.' . $id . ' is not an object');
        }
        $template = $raw['template'] ?? null;
        $html = $raw['html'] ?? null;
        $data = array_key_exists('data', $raw) ? Bind::data($raw['data']) : null;
        if (is_string($html)) {
            if (!$spec['html'] || array_key_exists('template', $raw) || array_key_exists('data', $raw)) {
                throw new InvalidArgumentException('define.' . $id . ' has an invalid html entry');
            }
            $arguments[$spec['field']] = new Definition(html: $html);
            $targets[$id] = ['target' => null, 'html' => $html];
            continue;
        }
        if (!is_string($template) || $spec['target'] === null || $template !== $spec['target']) {
            throw new InvalidArgumentException('define.' . $id . ' has an invalid template');
        }
        $boundData = null;
        if (array_key_exists('data', $raw)) {
            if ($data === []) {
                $data = new MapValue();
            }
            if (!$data instanceof MapValue) {
                throw new InvalidArgumentException('define.' . $id . '.data is not an object');
            }
            $values = [];
            foreach ($spec['input'] as $name => $type) {
                if ($data->has($name)) {
                    $values['has_' . $name] = true;
                    $values[$name] = self::bindType($data->get($name), $type, 'define.' . $id . '.data.' . $name);
                }
            }
            $class = __NAMESPACE__ . '\\\\' . $spec['class'];
            $boundData = new $class(...$values);
        }
        $arguments[$spec['field']] = new Definition(template: $spec['target'], data: $boundData);
        $targets[$id] = ['target' => $spec['target']];
    }

    return [new Definitions(...$arguments), $targets];
}`),
    method('list', `public static function list(array $items): array
{
    $result = [];
    foreach ($items as $item) {
        if ($item['spread']) {
            array_push($result, ...$item['value']);
        } else {
            $result[] = $item['value'];
        }
    }

    return $result;
}`),
    method('map', `public static function map(array $items): MapValue
{
    $result = new MapValue();
    foreach ($items as $item) {
        if ($item['spread']) {
            foreach ($item['value']->entries() as $key => $value) {
                $result->set($key, $value);
            }
        } else {
            $result->set((string) $item['key'], $item['value']);
        }
    }

    return $result;
}`),
    method('env', `public static function env(mixed $input): array
{
    if ($input === null) {
        $input = [];
    }
    if (!is_array($input)) {
        throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object');
    }
    $timezone = $input['timezone'] ?? 'Z';
    $now = $input['now'] ?? (float) time();
    if (!is_string($timezone)) {
        throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string');
    }
    if (!is_int($now) && !is_float($now)) {
        throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number');
    }

    return ['timezone' => $timezone, 'now' => (float) $now];
}`),
  ];
}

export function emitRuntime(context) {
  const members = runtimeMembers(context);
  // GeneratedRuntime holds the members that the rest of the program uses, with the members that those use.
  return [file('GeneratedRuntime.php'), dependent(text => {
    const used = usedDefinitions(members, text);
    const constants = used.filter(item => item.code.startsWith('private const')).map(item => item.code);
    const methods = used.filter(item => !item.code.startsWith('private const')).map(item => item.code);
    const body = [constants.join('\n'), ...methods].filter(part => part !== '').join('\n\n');
    return phpFile(context.options.phpNamespace, `final class GeneratedRuntime\n{\n${spaces(1, body)}\n}`);
  })];
}

const templateParameters = 'Assign $assign, Definitions $definitions, %INPUT% $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope';

export function emitTemplates(context) {
  const { program, templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `case ${phpLiteral(template.name)}:\n${spaces(1, `self::${renderMethod(template.name)}($assign, $definitions, new ${inputClass(template.name)}(), $context, $runtime, $rootData, $scope);\nreturn;`)}`);
  const render = method(`public static function render(string $target, ${templateParameters.replace('%INPUT% $input, ', '')}): void`,
    braced('switch ($target)', dispatch, 'default:', spaces(1, "throw $context->fail('E_LOAD_NOT_FOUND', null, null, 'template ' . $target . ' does not exist');")));
  const methods = templateBodies.map(template => {
    const typed = program.templates.get(template.name);
    return method(`private static function ${renderMethod(template.name)}(${templateParameters.replace('%INPUT%', inputClass(template.name))}): void`,
      `$frame = new Frame(${phpLiteral(template.name)}, ${phpLiteral(typed.lines)}, $rootData);`,
      [...template.inputs].map(([name]) => `$scope->locals->set(${phpLiteral(name)}, $input->${fieldName(name)});`),
      emitNodes(typed.body, context.target, 0));
  });
  return [file('GeneratedTemplates.php'), phpFile(context.options.phpNamespace, `final class GeneratedTemplates\n{\n${spaces(1, [render, ...methods].join('\n\n'))}\n}`)];
}

export function emitEntry(context) {
  const namespace = context.options.phpNamespace;
  const execution = `final class GeneratedExecution implements PreparedExecution
{
    public function __construct(
        private readonly string $target,
        private readonly Assign $assign,
        private readonly Definitions $definitions,
        private readonly MapValue $rootData,
        private readonly array $env,
        private readonly RuntimeEnvironment $services,
        private readonly ?string $html,
    ) {
    }

    public function render(): string
    {
        $context = new Context($this->services, $this->rootData, $this->env, $this->target);
        $runtime = new RuntimeBindings($context);
        $scope = new Scope();
        $context->enter($this->target, null, null);
        try {
            if ($this->html !== null) {
                $context->write($this->html);
            } else {
                GeneratedTemplates::render(
                    $this->target,
                    $this->assign,
                    $this->definitions,
                    $context,
                    $runtime,
                    $this->rootData,
                    $scope,
                );
            }

            return $context->output();
        } finally {
            $context->leave();
        }
    }
}`;
  const program = `final class GeneratedProgram implements Program
{
    public readonly RuntimeEnvironment $runtime;

    public function __construct(?RuntimeEnvironment $runtime = null)
    {
        $this->runtime = $runtime ?? new RuntimeEnvironment();
    }

    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender
    {
        if (!is_string($target)) {
            throw new InvalidArgumentException('generated target must be a template name');
        }

        return InternalBoundary::run($target, fn (): PreparedRender => $this->prepareBound($target, $assign, $options));
    }

    public function render(string|array $target, mixed $assign = [], array $options = []): string
    {
        return $this->prepare($target, $assign, $options)->render();
    }

    private function prepareBound(string $target, mixed $assign, array $options): PreparedRender
    {
        try {
            [$typedAssign, $rootData] = GeneratedRuntime::bindAssign($assign);
            [$definitions, $targets] = GeneratedRuntime::bindDefinitions($options['define'] ?? []);
            $env = GeneratedRuntime::env($options['env'] ?? []);
        } catch (BindError $error) {
            throw TemplateError::withoutPosition($error->errorCode, $target, $error->getMessage());
        }
        $resolved = $targets[$target] ?? null;
        $targetName = $resolved['target'] ?? $target;
        $html = $resolved['html'] ?? null;
        $execution = new GeneratedExecution($targetName, $typedAssign, $definitions, $rootData, $env, $this->runtime, $html);

        return new PreparedRender($target, $execution);
    }
}`;
  return [file('GeneratedExecution.php'), phpFile(namespace, execution), file('GeneratedProgram.php'), phpFile(namespace, program)];
}
