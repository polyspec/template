// The PHP backend. It writes one PSR-4 file per class under the namespace of the compile options (T25.1): the records,
// Assign, an input and a definition data class per template, Definition, Definitions and ArtifactManifest, the
// templates as static methods of GeneratedTemplates, the helpers that the program uses as static methods of
// GeneratedRuntime, and GeneratedExecution and GeneratedProgram. Every file follows PSR-12: one statement per line,
// braces on every control structure, four spaces of indentation, and PascalCase classes with camelCase methods.
import type { Span } from '@polyspec/template';
import {
  baseTarget, definition, dependent, emitExpression, emitNodes, fieldName, file, optional, phpLiteral, phpType,
  usedDefinitions, type BackendContext, type CodeDefinition, type Part, type Target,
  descriptor, descriptors, type Descriptor,
} from '../backend-support.mts';
import type { TypeManifest } from '../documents.mts';
import { loweredTemplate, type BlockInput, type NodeOf, type Program } from '../ir.mts';

export const language = 'php';

const pascal = (name: string): string => name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join('');
const inputClass = (name: string): string => `Input${pascal(name)}`;
const dataClass = (name: string): string => `DefinitionData${pascal(name)}`;
const renderMethod = (name: string): string => `render${pascal(name)}`;

/** `code` at `level`: every line that is not empty starts with four spaces per level. */
const spaces = (level: number, code: string): string => code.split('\n').map(line => line === '' ? '' : '    '.repeat(level) + line).join('\n');
/** A statement or a list of statements. */
type Statements = string | string[];
/** The lines of a statement list, without the empty parts. */
const lines = (...parts: Statements[]): string => parts.flat().filter(part => part !== '').join('\n');
/** A block `{ ... }` after `head`, with its statements one level deeper. */
const braced = (head: string, ...body: Statements[]): string => `${head} {\n${spaces(1, lines(...body))}\n}`;
/** A method or function with its brace on the next line, as PSR-12 places it. */
const method = (head: string, ...body: Statements[]): string => `${head}\n{\n${spaces(1, lines(...body))}\n}`;
// A group stays on one line, or, when its line passes 120 columns, splits as PSR-12 splits it: an argument list or the
// elements of an array hold one item per line, indented once, with a trailing comma (sections 4.7 and 4.5); the
// condition of a control structure goes on its own line between its parentheses (section 5); an operator chain keeps
// its first operand on the line and starts each further operand, with its operator, on a line indented once
// (section 6). The markers are control characters, which no PHP literal of the program holds (phpString escapes them).
interface GroupKind { open: string; separator: string; close: string }
const kinds = {
  list: { open: '\u0001', separator: '\u0002', close: '\u0003' },
  condition: { open: '\u0004', separator: '\u0005', close: '\u0006' },
  operator: { open: '\u000e', separator: '\u000f', close: '\u0010' },
} satisfies Record<string, GroupKind>;
const allKinds: GroupKind[] = Object.values(kinds);
const markers = allKinds.flatMap(kind => [kind.open, kind.separator, kind.close]);
const group = (kind: keyof typeof kinds, items: string[], joiner: string): string => items.length === 0 ? '' : `${kinds[kind].open}${items.join(`${joiner}${kinds[kind].separator}`)}${kinds[kind].close}`;
const call = (callee: string, items: string[]): string => `${callee}(${group('list', items, ',')})`;
const array = (items: string[]): string => `[${group('list', items, ',')}]`;
const condition = (test: string): string => group('condition', [test], '');
const chain = (first: string, ...rest: string[]): string => group('operator', [first, ...rest], '');
const flat = (line: string): string => Array.from(line, character => allKinds.some(kind => kind.separator === character) ? ' ' : markers.includes(character) ? '' : character).join('');
const WIDTH = 120;

/** The first group of `line`: the index of its opening marker and its kind, or null when the line has no group. */
function firstGroup(line: string): { start: number; kind: GroupKind } | null {
  for (let index = 0; index < line.length; index += 1) {
    const kind = allKinds.find(item => item.open === line[index]);
    if (kind !== undefined) return { start: index, kind };
  }
  return null;
}

/** The lines of `line`: the line itself when it fits, or its first group split, and every resulting line in turn. */
function layout(line: string): string[] {
  const found = firstGroup(line);
  if (flat(line).length <= WIDTH || found === null) return [flat(line)];
  const { start, kind } = found;
  const indentation = ' '.repeat(line.search(/[^ ]|$/));
  const items: string[] = [];
  let depth = 0;
  let item = start + 1;
  let end = -1;
  for (let index = start + 1; index < line.length && end < 0; index += 1) {
    const character = line[index];
    if (allKinds.some(other => other.open === character)) depth += 1;
    else if (allKinds.some(other => other.close === character) && depth > 0) depth -= 1;
    else if (character === kind.close) end = index;
    else if (character === kind.separator && depth === 0) {
      items.push(line.slice(item, index));
      item = index + 1;
    }
  }
  items.push(line.slice(item, end));
  const head = line.slice(0, start);
  const tail = line.slice(end + 1);
  const inner = (text: string): string => `${indentation}    ${text}`;
  if (kind === kinds.operator) {
    // The first operand stays on the line of the head; the last carries the tail.
    return items.flatMap((text, index) => index === 0 ? layout(`${head}${text}`) : layout(inner(index === items.length - 1 ? `${text}${tail}` : text)));
  }
  const trailing = kind === kinds.list ? ',' : '';
  return [
    ...layout(head),
    ...items.flatMap((text, index) => layout(inner(`${text}${index === items.length - 1 ? trailing : ''}`))),
    ...layout(`${indentation}${tail}`),
  ];
}

const guarded = (body: string, cleanup: string): string => `${braced('try', body)} ${braced('finally', cleanup)}`;

// The classes that a file may use, by their short names.
const imports: Record<string, string> = {
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
function phpFile(namespace: string, code: string): string {
  const uses = Object.entries(imports)
    .filter(([name]) => new RegExp(`(?<![\\\\$>:\\w])${name}\\b`).test(code))
    .map(([, name]) => `use ${name};`)
    .sort();
  const laid = code.split('\n').flatMap(layout).join('\n');
  return ['<?php', 'declare(strict_types=1);', `namespace ${namespace};`, ...(uses.length > 0 ? [uses.join('\n')] : []), laid].join('\n\n');
}

/** The namespace of the PHP files; compiler.mts rejects a PHP compilation without one. */
function phpNamespace(context: BackendContext): string {
  const namespace = context.options.phpNamespace;
  if (namespace === undefined) throw new Error('compiler: the PHP target requires a namespace');
  return namespace;
}

/** A final class whose constructor promotes `parameters`, one per line. */
function promotedClass(name: string, parameters: string[]): string {
  if (parameters.length === 0) return `final class ${name}\n{\n}`;
  return `final class ${name}\n{\n${spaces(1, `public function __construct(\n${spaces(1, parameters.map(parameter => `${parameter},`).join('\n'))}\n) {\n}`)}\n}`;
}

const nullable = (type: string): string => optional(type) && phpType(type) !== 'mixed' ? '?' : '';
const readonlyField = (name: string, type: string): string => `public readonly ${nullable(type)}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;
const inputField = (name: string, type: string): string => `public ${nullable(type)}${phpType(type)} $${name}${optional(type) ? ' = null' : ''}`;




function bindingSchema(context: BackendContext): { records: Record<string, Record<string, Descriptor>>; assign: Record<string, Descriptor>; definitions: Record<string, unknown> } {
  const records = Object.fromEntries(Object.entries(context.manifest.records).map(([name, fields]) => [name, descriptors(fields)]));
  const assign = descriptors(context.manifest.fields);
  const definitions = Object.fromEntries([...context.program.definitions].map(([id, definition]) => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    class: definition.template === null ? null : dataClass(definition.template),
    input: definition.template === null ? {} : Object.fromEntries([...loweredTemplate(context.program, definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
  return { records, assign, definitions };
}

const encoded = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64');

export function createTarget({ program }: { program: Program; manifest: TypeManifest }): Target {
  const span = (node: { span: Span }): string => phpLiteral(node.span);
  const write = (node: { span: Span }, value: string): string => `${call('$context->at', ['$frame', span(node)])};\n${call('$context->write', [value])};`;
  const error = (node: { span: Span }, code: string, message: string): string => call('$runtime->error', ['$frame', span(node), `'${code}'`, phpLiteral(message)]);
  const enter = (node: { target: string; span: Span }, render: string): string[] => [
    '$blockScope = new Scope();',
    `${call('$context->enter', [phpLiteral(node.target), '$frame', span(node)])};`,
    guarded(`self::${render};`, '$context->leave();'),
  ];
  const block = (node: NodeOf<'block'>, n: number): string => {
    const blockTarget = node.target;
    if (blockTarget === null) {
      // Lowering gives a block without a target only an HTML definition, which a block names by its id.
      const id = node.id;
      return spaces(n, lines(
        `$definition = $definitions->${fieldName(id)};`,
        braced('if ($definition?->html === null)', `throw ${error(node, 'E_RUNTIME_BLOCK_UNDEFINED', `define ${id} is not registered`)};`),
        write(node, '$definition->html')));
    }
    const missing = (item: BlockInput): string => `throw ${error(node, 'E_RUNTIME_TYPE', `generated input ${blockTarget}.${item.name} is missing`)}`;
    const fallbackValue = (item: BlockInput): string => {
      if (item.root) return emitExpression(item.root, target);
      if (item.valueType.optional) return 'null';
      if (node.id !== null) return `(${chain(`$definition?->data !== null && $definition->data->has_${fieldName(item.name)}`, `? $definition->data->${fieldName(item.name)}`, `: ${missing(item)}`)})`;
      return missing(item);
    };
    const construct = `$input = ${call(`new ${inputClass(blockTarget)}`, node.inputs.map(item => `${fieldName(item.name)}: ${fallbackValue(item)}`))};`;
    const defined = node.inputs.map(item => braced(`if ($definition->data->has_${fieldName(item.name)})`, `$input->${fieldName(item.name)} = $definition->data->${fieldName(item.name)};`));
    const scoped = node.inputs.flatMap(item => item.scope === null ? [] : [`$input->${fieldName(item.name)} = ${emitExpression(item.scope, target)};`]);
    const render = call(renderMethod(blockTarget), ['$assign', '$definitions', '$input', '$context', '$runtime', '$rootData', '$blockScope']);
    const entered = { target: blockTarget, span: node.span };
    if (node.id === null) return spaces(n, lines(construct, scoped, enter(entered, render)));
    const field = fieldName(node.id);
    const registration = node.path === null
      ? braced('if ($definition === null)', `throw ${error(node, 'E_RUNTIME_BLOCK_UNDEFINED', `define ${node.id} is not registered`)};`)
      : `${braced('if ($definition === null)', `$definition = ${call('new Definition', [`template: ${phpLiteral(blockTarget)}`])};`, `$definitions->${field} = $definition;`)} ${braced(`elseif ($definition->html !== null || $definition->template !== ${phpLiteral(blockTarget)})`, `throw ${error(node, 'E_RUNTIME_BLOCK_REDEFINED', `define ${node.id} is registered with a different template`)};`)}`;
    return spaces(n, lines(
      `$definition = $definitions->${field};`,
      registration,
      `${braced('if ($definition?->html !== null)', write(node, '$definition->html'))} ${braced('else',
        braced(`if ($definition?->data !== null && !($definition->data instanceof ${dataClass(blockTarget)}))`, `throw ${error(node, 'E_RUNTIME_TYPE', `generated definition ${node.id} data has an invalid type`)};`),
        construct,
        defined.length > 0 ? braced('if ($definition?->data !== null)', defined) : '',
        scoped,
        enter(entered, render))}`));
  };
  const target: Target = {
    ...baseTarget(language),
    var: (name, _type, node) => program.dynamicRoot ? node.scope ? call('$scope->lookup', ['$frame', phpLiteral(name)]) : call('$runtime->member', ['$rootData', phpLiteral(name), '$frame', span(node)]) : `$assign->${name}`,
    local: name => call('$scope->lookup', ['$frame', phpLiteral(name)]),
    set: (name, value, level) => spaces(level, `${call('$scope->locals->set', [phpLiteral(name), value])};`),
    member: (object, key, owner, node) => owner.kind === 'any' ? call('$runtime->member', [object, phpLiteral(key), '$frame', span(node)]) : `${object}?->${key}`,
    text: (value, level, node) => spaces(level, write(node, phpLiteral(value))),
    echo: (expression, level, node) => spaces(level, write(node, call('$runtime->escape', [expression, '$frame', phpLiteral(node.expr.span)]))),
    block,
    ifBlock: (node, n) => spaces(n, `${braced(`if ($definitions->${fieldName(node.id)} !== null)`, emitNodes(node.body, target, 0))}${node.otherwise ? ` ${braced('else', emitNodes(node.otherwise, target, 0))}` : ''}`),
    loopMeta: (loop, field) => `${call('$scope->loopMeta', [phpLiteral(loop)])}[${phpLiteral(field)}]`,
    index: (object, index, _owner, node) => call('$runtime->index', [object, index, '$frame', span(node)]),
    memberCall: (object, methodName, args, node) => call('$runtime->memberCall', [object, phpLiteral(methodName), array(args), '$frame', span(node)]),
    classCall: (className, methodName, args, node) => call('$runtime->classCall', [phpLiteral(className), phpLiteral(methodName), array(args), '$frame', span(node)]),
    toValue: (value, type) => call('GeneratedRuntime::toValue', [value, call('GeneratedRuntime::schema', [`'${encoded(descriptor(type.source))}'`])]),
    call: (name, args, node) => call('$runtime->call', [phpLiteral(name), array(args), '$frame', span(node)]),
    unary: (operator, operand, node) => call('$runtime->unary', [phpLiteral(operator), operand, '$frame', span(node)]),
    binary: (operator, left, right, node) => {
      if (operator === '&&') return `(${chain(call('$runtime->truthy', [left]), `&& ${call('$runtime->truthy', [right])}`)})`;
      if (operator === '||') return `(${chain(call('$runtime->truthy', [left]), `|| ${call('$runtime->truthy', [right])}`)})`;
      if (operator === '??') return `(${chain(`(${left})`, `?? (${right})`)})`;
      return call('$runtime->binary', [phpLiteral(operator), left, right, '$frame', span(node)]);
    },
    ternary: (test, thenValue, elseValue) => `(${chain(call('$runtime->truthy', [test]), `? ${thenValue}`, `: ${elseValue}`)})`,
    list: (items, _type, node) => call('$runtime->depth', [call('GeneratedRuntime::list', [array(items.map(item => array([`'spread' => ${String(item.spread)}`, `'value' => ${item.spread ? call('$runtime->listSpread', [item.value, '$frame', phpLiteral(item.span)]) : item.value}`])))]), '$frame', span(node)]),
    map: (entries, _type, node) => call('$runtime->depth', [call('GeneratedRuntime::map', [array(entries.map(item => item.spread ? array(["'spread' => true", `'value' => ${call('$runtime->mapSpread', [item.value, '$frame', phpLiteral(item.span)])}`]) : array(["'spread' => false", `'key' => ${item.value[0]}`, `'value' => ${item.value[1]}`])))]), '$frame', span(node)]),
    ifNode: (node, n) => {
      const branches = node.branches.map((branch, index) => braced(`${index > 0 ? 'elseif' : 'if'} (${condition(call('$runtime->truthy', [emitExpression(branch.test, target)]))})`, emitNodes(branch.body, target, 0)));
      return spaces(n, `${branches.join(' ')}${node.otherwise ? ` ${braced('else', emitNodes(node.otherwise, target, 0))}` : ''}`);
    },
    forNode: (node, n) => {
      const name = fieldName(node.name);
      const loop = phpLiteral(node.name);
      return spaces(n, lines(
        `$${name}_entries = ${call('$runtime->entries', [emitExpression(node.iter, target), '$frame', span(node)])};`,
        `$${name}_size = count($${name}_entries);`,
        `$${name}_last_index = $${name}_size - 1;`,
        `$${name}_had = $scope->locals->has(${loop});`,
        `$${name}_previous = $scope->locals->get(${loop});`,
        braced(`foreach ($${name}_entries as $${name}_index => [$${name}_key, $${name}_value])`,
          `$scope->locals->set(${loop}, $${name}_value);`,
          `$${name}_stack = $scope->loops[${loop}] ?? [];`,
          `$${name}_stack[] = ${array([`'index_' => (float) $${name}_index`, `'size_' => (float) $${name}_size`, `'first_' => $${name}_index === 0`, `'last_' => $${name}_index === $${name}_last_index`, `'key_' => $${name}_key`, `'value_' => $${name}_value`])};`,
          `$scope->loops[${loop}] = $${name}_stack;`,
          '$context->iterations++;',
          `${call('$runtime->limit', ["'iteration'", '$context->iterations', '$frame', span(node)])};`,
          emitNodes(node.body, target, 0),
          `$${name}_stack = $scope->loops[${loop}];`,
          `array_pop($${name}_stack);`,
          `${braced(`if ($${name}_stack === [])`, `unset($scope->loops[${loop}]);`)} ${braced('else', `$scope->loops[${loop}] = $${name}_stack;`)}`),
        `${braced(`if ($${name}_had)`, `$scope->locals->set(${loop}, $${name}_previous);`)} ${braced('else', `$scope->locals->remove(${loop});`)}`,
        node.empty ? braced(`if ($${name}_size === 0)`, emitNodes(node.empty, target, 0)) : ''));
    },
    include: (node, n) => spaces(n, lines(
      `${call('$context->enter', [phpLiteral(node.target), '$frame', span(node)])};`,
      guarded(`${call(`self::${renderMethod(node.target)}`, ['$assign', '$definitions', call(`new ${inputClass(node.target)}`, node.inputs.map(item => `${fieldName(item.name)}: ${emitExpression(item.value, target)}`)), '$context', '$runtime', '$rootData', '$scope'])};`, '$context->leave();'))),
  };
  return target;
}

export function emitDeclarations(context: BackendContext): Part[] {
  const { program, manifest, templateBodies } = context;
  const namespace = phpNamespace(context);
  const fileOf = (name: string, code: string): Part[] => [file(`${name}.php`), phpFile(namespace, code)];
  return [
    ...Object.entries(manifest.records).flatMap(([name, members]) => fileOf(name, promotedClass(name, Object.entries(members).map(([key, type]) => readonlyField(key, type))))),
    ...fileOf('Assign', promotedClass('Assign', program.dynamicRoot ? [] : Object.entries(manifest.fields).map(([name, type]) => readonlyField(name, type)))),
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
function runtimeMembers(context: BackendContext): CodeDefinition[] {
  const schema = bindingSchema(context);
  const member = (name: string, code: string): CodeDefinition => definition(name, code, new RegExp(`::${name}\\(`));
  // A schema longer than a line is a constant expression of literals joined with `.`, which stays a constant: the
  // first literal fills the line of the declaration, a member of the class, and each further one a line of its own.
  const constant = (name: string, value: unknown): CodeDefinition => {
    const text = encoded(value);
    const first = WIDTH - `    private const ${name} = '';`.length;
    const chunks = [text.slice(0, first), ...(text.slice(first).match(/.{1,100}/g) ?? [])];
    return definition(name, `private const ${name} = ${chunks.map(chunk => `'${chunk}'`).join('\n    . ')};`, new RegExp(`::${name}\\b`));
  };
  return [
    constant('RECORDS_SCHEMA', schema.records),
    constant('ASSIGN_SCHEMA', schema.assign),
    constant('DEFINITION_SCHEMA', schema.definitions),
    member('schema', `public static function schema(string $encoded): array
{
    static $schemas = [];

    return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR);
}`),
    member('bindType', `public static function bindType(mixed $value, array $type, string $path): mixed
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
            throw new InvalidArgumentException($path . ' is not ' . match ($type['kind']) {
                'string' => 'a string',
                'number' => 'a number',
                default => 'a boolean',
            });
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
            throw new InvalidArgumentException($path . ' is not an object');
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
    member('toValue', `public static function toValue(mixed $value, array $type): mixed
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
    member('bindRecord', `public static function bindRecord(mixed $value, array $fields, string $class, string $path): object
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
    member('bindAssign', context.program.dynamicRoot
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
    member('bindDefinitions', `public static function bindDefinitions(array $input): array
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
    member('list', `public static function list(array $items): array
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
    member('map', `public static function map(array $items): MapValue
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
    member('env', `public static function env(mixed $input): array
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

export function emitRuntime(context: BackendContext): Part[] {
  const members = runtimeMembers(context);
  // GeneratedRuntime holds the members that the rest of the program uses, with the members that those use.
  return [file('GeneratedRuntime.php'), dependent(text => {
    const used = usedDefinitions(members, text);
    const constants = used.filter(item => item.code.startsWith('private const')).map(item => item.code);
    const methods = used.filter(item => !item.code.startsWith('private const')).map(item => item.code);
    const body = [constants.join('\n'), ...methods].filter(part => part !== '').join('\n\n');
    return phpFile(phpNamespace(context), `final class GeneratedRuntime\n{\n${spaces(1, body)}\n}`);
  })];
}

const templateParameters = (input: string | null): string[] => ['Assign $assign', 'Definitions $definitions', ...(input === null ? [] : [`${input} $input`]), 'Context $context', 'RuntimeBindings $runtime', 'MapValue $rootData', 'Scope $scope'];

/**
 * A method of a class: its parameters on its line and its brace on the next line, or, when that line passes 120 columns
 * at the level of a class member, one parameter per line with the closing parenthesis, the return type and the brace
 * on their own line, as PSR-12 places a split argument list (section 4.4).
 */
function classMethod(head: string, parameters: string[], returns: string, ...body: Statements[]): string {
  const single = `${head}(${parameters.join(', ')}): ${returns}`;
  if (4 + single.length <= WIDTH) return method(single, ...body);
  return `${head}(\n${spaces(1, parameters.map(parameter => `${parameter},`).join('\n'))}\n): ${returns} {\n${spaces(1, lines(...body))}\n}`;
}

export function emitTemplates(context: BackendContext): Part[] {
  const { program, templateBodies } = context;
  const arguments_ = (input: string): string[] => ['$assign', '$definitions', input, '$context', '$runtime', '$rootData', '$scope'];
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `case ${phpLiteral(template.name)}:\n${spaces(1, `${call(`self::${renderMethod(template.name)}`, arguments_(`new ${inputClass(template.name)}()`))};\nreturn;`)}`);
  const render = classMethod('public static function render', ['string $target', ...templateParameters(null)], 'void',
    braced('switch ($target)', dispatch, 'default:', spaces(1, "throw $context->fail('E_LOAD_NOT_FOUND', null, null, 'template ' . $target . ' does not exist');")));
  const methods = templateBodies.map(template => {
    const typed = loweredTemplate(program, template.name);
    return classMethod(`private static function ${renderMethod(template.name)}`, templateParameters(inputClass(template.name)), 'void',
      `$frame = ${call('new Frame', [phpLiteral(template.name), array(typed.lines.map(String)), '$rootData'])};`,
      [...template.inputs].map(([name]) => `${call('$scope->locals->set', [phpLiteral(name), `$input->${fieldName(name)}`])};`),
      emitNodes(typed.body, context.target, 0));
  });
  return [file('GeneratedTemplates.php'), phpFile(phpNamespace(context), `final class GeneratedTemplates\n{\n${spaces(1, [render, ...methods].join('\n\n'))}\n}`)];
}

export function emitEntry(context: BackendContext): Part[] {
  const namespace = phpNamespace(context);
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
        $execution = new GeneratedExecution(
            $targetName,
            $typedAssign,
            $definitions,
            $rootData,
            $env,
            $this->runtime,
            $html,
        );

        return new PreparedRender($target, $execution);
    }
}`;
  return [file('GeneratedExecution.php'), phpFile(namespace, execution), file('GeneratedProgram.php'), phpFile(namespace, program)];
}
