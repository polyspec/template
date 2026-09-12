import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'php';

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
  const records = Object.fromEntries(Object.entries({ ...(context.manifest.records ?? {}), ...(context.manifest.recordsExtra ?? {}) })
    .map(([name, fields]) => [name, Object.fromEntries(Object.entries(fields).map(([field, type]) => [field, descriptor(type)]))]));
  const assign = Object.fromEntries(Object.entries(context.manifest.fields ?? {}).map(([field, type]) => [field, descriptor(type)]));
  const definitions = Object.fromEntries([...context.program.definitions].map(([id, definition]) => [id, {
    field: fieldName(id),
    target: definition.template,
    html: definition.html,
    class: definition.template === null ? null : definitionDataName(definition.template),
    input: definition.template === null ? {} : Object.fromEntries([...context.program.templates.get(definition.template).inputs].map(([field, type]) => [field, descriptor(type.source)])),
  }]));
  return { records, assign, definitions };
}

export function createTarget() {
  const target = baseTarget(language);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `$definition = $definitions->${fieldName(node.id)};\nif ($definition?->html === null) throw new RuntimeException(${quote(`generated definition ${node.id} requires html`)});\n$out .= $definition->html;`);
    const fallbackValue = item => {
      if (item.root) return emitExpression(item.root, target);
      if (item.valueType.optional) return 'null';
      if (node.id !== null) return `($definition?->data !== null && $definition->data->has_${fieldName(item.name)} ? $definition->data->${fieldName(item.name)} : throw new RuntimeException(${quote(`generated input ${node.target}.${item.name} is missing`)}))`;
      return `throw new RuntimeException(${quote(`generated input ${node.target}.${item.name} is missing`)})`;
    };
    const fallback = node.inputs.map(item => `${fieldName(item.name)}: ${fallbackValue(item)}`).join(', ');
    const defined = node.inputs.map(item => `if ($definition->data->has_${fieldName(item.name)}) $input->${fieldName(item.name)} = $definition->data->${fieldName(item.name)};`).join('\n');
    const scoped = node.inputs.filter(item => item.scope).map(item => `$input->${fieldName(item.name)} = ${emitExpression(item.scope, target)};`).join('\n');
    if (node.id === null) return indent(n, `$input = new ${inputName(node.target)}(${fallback});\n${scoped}\n$out .= ${functionName(node.target)}($assign, $definitions, $input);`);
    const field = fieldName(node.id);
    const missing = node.path === null ? `if ($definition === null) throw new RuntimeException(${quote(`generated definition ${node.id} is missing`)});` : '';
    return indent(n, `$definition = $definitions->${field};\n${missing}\nif ($definition?->html !== null) {\n    $out .= $definition->html;\n} else {\n    if ($definition?->data !== null && !($definition->data instanceof ${definitionDataName(node.target)})) throw new RuntimeException(${quote(`generated definition ${node.id} data has an invalid type`)});\n    $input = new ${inputName(node.target)}(${fallback});\n    if ($definition?->data !== null) {\n${indent(2, defined)}\n    }\n${indent(1, scoped)}\n    $out .= ${functionName(node.target)}($assign, $definitions, $input);\n}`);
  };
  target.ifBlock = (node, n) => indent(n, `if ($definitions->${fieldName(node.id)} !== null) {\n${emitNodes(node.body, target, n + 1)}\n}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1)}\n}` : ''}`);
  target.loopMeta = (loop, field) => `$${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index) => `generated_index(${object}, ${index})`;
  target.call = (name, args) => {
    if (name !== 'default') throw new Error(`compiler: function ${name} reached the PHP backend without support`);
    return `generated_default(${args.join(', ')})`;
  };
  target.unary = (op, operand) => `(${op}${operand})`;
  target.binary = (op, left, right) => op === 'in' ? `generated_in(${left}, ${right})` : op === '&&' || op === '||' ? `(generated_truthy(${left}) ${op} generated_truthy(${right}))` : `(${left} ${op} ${right})`;
  target.ternary = (test, thenValue, elseValue) => `(generated_truthy(${test}) ? ${thenValue} : ${elseValue})`;
  target.list = items => `generated_list([${items.map(item => `['spread' => ${item.spread}, 'value' => ${item.value}]`).join(', ')}])`;
  target.map = entries => `generated_map([${entries.map(item => item.spread ? `['spread' => true, 'value' => ${item.value}]` : `['spread' => false, 'key' => ${item.value[0]}, 'value' => ${item.value[1]}]`).join(', ')}])`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'    '.repeat(n)}${i ? '} elseif' : 'if'} (generated_truthy(${emitExpression(b.test, target)})) {\n${emitNodes(b.body, target, n + 1, scope)}`).join('\n') + `${'    '.repeat(n)}}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1, scope)}\n${'    '.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    return indent(n, `$${name}_entries = generated_entries(${emitExpression(node.iter, target)});\nforeach ($${name}_entries as $${name}_index => [$${name}_key, $${name}_value]) {\n    $${name} = $${name}_value;\n    $${name}_size = count($${name}_entries);\n    $${name}_first = $${name}_index === 0;\n    $${name}_last = $${name}_index + 1 === count($${name}_entries);\n${emitNodes(node.body, target, n + 1)}\n}${node.empty ? `\nif (count($${name}_entries) === 0) {\n${emitNodes(node.empty, target, n + 1)}\n}` : ''}`);
  };
  target.include = (node, n) => indent(n, `$out .= ${functionName(node.target)}($assign, $definitions, new ${inputName(node.target)}(${node.inputs.map(item => `${fieldName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')}));`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const phpRecords = Object.entries(records).map(([name, members]) => `final class ${name} { public function __construct(${Object.entries(members).map(([key, type]) => phpField(key, type)).join(', ')}) {} }`).join('\n');
  const inputTypes = templateBodies.map(template => `final class ${template.input} { public function __construct(${[...template.inputs].map(([name, type]) => phpInputField(name, type.source)).join(', ')}) {} }`).join('\n');
  const definitionDataTypes = templateBodies.map(template => `final class ${definitionDataName(template.name)} { public function __construct(${[...template.inputs].map(([name, type]) => phpDefinitionDataField(fieldName(name), type.source)).join(', ')}) {} }`).join('\n');
  const definitionsType = `final class Definition { public function __construct(public readonly ?string $html = null, public readonly mixed $data = null) {} }\nfinal class Definitions { public function __construct(${[...program.definitions].map(([name]) => `public readonly ?Definition $${fieldName(name)} = null`).join(', ')}) {} }`;
  return `<?php\n\ndeclare(strict_types=1);\n\nuse Polyspec\\Template\\PreparedExecution;\nuse Polyspec\\Template\\PreparedRender;\nuse Polyspec\\Template\\Program;\nuse Polyspec\\Template\\Render\\RuntimeEnvironment;\nuse Polyspec\\Template\\Value\\Bind;\nuse Polyspec\\Template\\Value\\MapValue;\n${phpRecords}\nfinal class Assign { public function __construct(\n${Object.entries(fields).map(([name, type]) => phpField(name, type)).join(',\n')}\n) {} }\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}\nfinal class ArtifactManifest { public function __construct(public readonly int $schema, public readonly string $mode, public readonly string $target, public readonly string $entry, public readonly string $sourceDigest, public readonly string $typeDigest, public readonly string $contractDigest, public readonly array $files) {} }`;
}

export function emitRuntime(context) {
  const schema = bindingSchema(context);
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64');
  return `const GENERATED_RECORDS_SCHEMA = '${encoded(schema.records)}';\nconst GENERATED_ASSIGN_SCHEMA = '${encoded(schema.assign)}';\nconst GENERATED_DEFINITION_SCHEMA = '${encoded(schema.definitions)}';\nfunction generated_schema(string $encoded): array { static $schemas = []; return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR); }\nfunction generated_bind_type(mixed $value, array $type, string $path): mixed { if ($value === null) { if (($type['optional'] ?? false) || $type['kind'] === 'null' || $type['kind'] === 'any') return null; throw new InvalidArgumentException($path . ' is required'); } if ($type['kind'] === 'any') return $value; if (in_array($type['kind'], ['string', 'number', 'boolean'], true)) { $valid = $type['kind'] === 'string' ? is_string($value) : ($type['kind'] === 'number' ? (is_float($value) || is_int($value)) : is_bool($value)); if (!$valid) throw new InvalidArgumentException($path . ' has an invalid type'); return $type['kind'] === 'number' ? (float) $value : $value; } if ($type['kind'] === 'list') { if (!is_array($value)) throw new InvalidArgumentException($path . ' is not a list'); return array_map(fn ($item, $index) => generated_bind_type($item, $type['item'], $path . '[' . $index . ']'), $value, array_keys($value)); } if ($type['kind'] === 'map') { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not a map'); $result = []; foreach ($value->entries() as $key => $item) $result[generated_bind_type($key, $type['key'], $path . '.key')] = generated_bind_type($item, $type['value'], $path . '.' . $key); return $result; } if ($type['kind'] === 'record') { $records = generated_schema(GENERATED_RECORDS_SCHEMA); return generated_bind_record($value, $records[$type['name']], $type['name'], $path); } throw new InvalidArgumentException($path . ' has an unknown generated type'); }\nfunction generated_bind_record(mixed $value, array $fields, string $class, string $path): object { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not an object'); $arguments = []; foreach ($fields as $name => $type) { if (!$value->has($name)) { if (!($type['optional'] ?? false)) throw new InvalidArgumentException($path . '.' . $name . ' is required'); continue; } $arguments[$name] = generated_bind_type($value->get($name), $type, $path . '.' . $name); } return new $class(...$arguments); }\nfunction generated_bind_assign(mixed $value): Assign { return generated_bind_record(Bind::map($value), generated_schema(GENERATED_ASSIGN_SCHEMA), Assign::class, 'assign'); }\nfunction generated_bind_definitions(array $input): array { $value = Bind::map($input); $arguments = []; $targets = []; $specs = generated_schema(GENERATED_DEFINITION_SCHEMA); foreach ($value->entries() as $id => $raw) { $spec = $specs[$id] ?? null; if ($spec === null) throw new InvalidArgumentException('define.' . $id . ' is not declared'); if (is_string($raw)) { if ($spec['target'] === null || $raw !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $arguments[$spec['field']] = new Definition(); $targets[$id] = ['target' => $spec['target']]; continue; } if (!$raw instanceof MapValue) throw new InvalidArgumentException('define.' . $id . ' is not an object'); $template = $raw->get('template'); $html = $raw->get('html'); $data = $raw->get('data'); if (is_string($html)) { if (!$spec['html'] || $raw->has('template') || $raw->has('data')) throw new InvalidArgumentException('define.' . $id . ' has an invalid html entry'); $arguments[$spec['field']] = new Definition(html: $html); $targets[$id] = ['target' => null, 'html' => $html]; continue; } if (!is_string($template) || $spec['target'] === null || $template !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $boundData = null; if ($raw->has('data')) { if ($data === []) $data = new MapValue(); if (!$data instanceof MapValue) throw new InvalidArgumentException('define.' . $id . '.data is not an object'); $values = []; foreach ($spec['input'] as $name => $type) { if ($data->has($name)) { $values['has_' . $name] = true; $values[$name] = generated_bind_type($data->get($name), $type, 'define.' . $id . '.data.' . $name); } } $class = $spec['class']; $boundData = new $class(...$values); } $arguments[$spec['field']] = new Definition(data: $boundData); $targets[$id] = ['target' => $spec['target']]; } return [new Definitions(...$arguments), $targets]; }\nfunction generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== []; }\nfunction generated_escape(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; if (is_array($value) || is_object($value)) throw new RuntimeException('a collection cannot be converted to text'); return str_replace('&#039;', '&#39;', htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')); }\nfunction generated_index(array $value, string|int|float $key): mixed { return $value[is_float($key) ? (int) $key : $key] ?? null; }\nfunction generated_entries(?array $value): array { $result = []; foreach ($value ?? [] as $key => $item) $result[] = [$key, $item]; return $result; }\nfunction generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }\nfunction generated_map(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { foreach ($item['value'] as $key => $value) $result[$key] = $value; } else $result[$item['key']] = $item['value']; } return $result; }\nfunction generated_in(mixed $value, mixed $collection): bool { return is_array($collection) ? (array_is_list($collection) ? in_array($value, $collection, true) : array_key_exists((string) $value, $collection)) : (is_string($collection) && str_contains($collection, (string) $value)); }\nfunction generated_default(mixed $value, mixed $fallback): mixed { return generated_truthy($value) ? $value : $fallback; }`;
}

export function emitTemplates(context) {
  const { templateBodies } = context;
  const functions = templateBodies.map(template => `function ${template.function}(Assign $assign, Definitions $definitions, ${template.input} $input): string { $out = '';\n${[...template.inputs].map(([name]) => `$${fieldName(name)} = $input->${fieldName(name)};`).join('\n')}\n${template.body}\n return $out; }`).join('\n');
  return functions;
}

export function emitEntry(context) {
  const { program, templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${quote(template.name)} => ${template.function}($assign, $definitions, new ${template.input}()),`).join('\n');
  return `function render_template(string $target, Assign $assign, Definitions $definitions): string { return match ($target) {\n${dispatch}\n        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),\n}; }\nfunction render(Assign $assign, Definitions $definitions): string { return render_template(${quote(program.entry)}, $assign, $definitions); }\nfinal class GeneratedExecution implements PreparedExecution { public function __construct(private readonly string $target, private readonly Assign $assign, private readonly Definitions $definitions, private readonly ?string $html) {} public function render(): string { return $this->html ?? render_template($this->target, $this->assign, $this->definitions); } }\nfinal class GeneratedProgram implements Program { public readonly RuntimeEnvironment $runtime; public function __construct(?RuntimeEnvironment $runtime = null) { $this->runtime = $runtime ?? new RuntimeEnvironment(); } public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender { if (!is_string($target)) throw new InvalidArgumentException('generated target must be a template name'); $typedAssign = generated_bind_assign($assign); [$definitions, $targets] = generated_bind_definitions($options['define'] ?? []); $resolved = $targets[$target] ?? null; $targetName = $resolved['target'] ?? $target; $html = $resolved['html'] ?? null; return new PreparedRender(new GeneratedExecution($targetName, $typedAssign, $definitions, $html)); } public function render(string|array $target, mixed $assign = [], array $options = []): string { return $this->prepare($target, $assign, $options)->render(); } }`;
}
