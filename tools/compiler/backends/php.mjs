import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'php';

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
  return `<?php\n${phpRecords}\nfinal class Assign { public function __construct(\n${Object.entries(fields).map(([name, type]) => phpField(name, type)).join(',\n')}\n) {} }\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}`;
}

export function emitRuntime() {
  return `function generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== []; }\nfunction generated_escape(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; if (is_array($value) || is_object($value)) throw new RuntimeException('a collection cannot be converted to text'); return str_replace('&#039;', '&#39;', htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')); }\nfunction generated_index(array $value, string|int|float $key): mixed { return $value[is_float($key) ? (int) $key : $key] ?? null; }\nfunction generated_entries(?array $value): array { $result = []; foreach ($value ?? [] as $key => $item) $result[] = [$key, $item]; return $result; }\nfunction generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }\nfunction generated_map(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { foreach ($item['value'] as $key => $value) $result[$key] = $value; } else $result[$item['key']] = $item['value']; } return $result; }\nfunction generated_in(mixed $value, mixed $collection): bool { return is_array($collection) ? (array_is_list($collection) ? in_array($value, $collection, true) : array_key_exists((string) $value, $collection)) : (is_string($collection) && str_contains($collection, (string) $value)); }\nfunction generated_default(mixed $value, mixed $fallback): mixed { return generated_truthy($value) ? $value : $fallback; }`;
}

export function emitTemplates(context) {
  const { templateBodies } = context;
  const functions = templateBodies.map(template => `function ${template.function}(Assign $assign, Definitions $definitions, ${template.input} $input): string { $out = '';\n${[...template.inputs].map(([name]) => `$${fieldName(name)} = $input->${fieldName(name)};`).join('\n')}\n${template.body}\n return $out; }`).join('\n');
  return functions;
}

export function emitEntry(context) {
  const { program, templateBodies } = context;
  const dispatch = templateBodies.filter(template => template.inputs.size === 0).map(template => `        ${quote(template.name)} => ${template.function}($assign, $definitions, new ${template.input}()),`).join('\n');
  return `function render_template(string $target, Assign $assign, Definitions $definitions): string { return match ($target) {\n${dispatch}\n        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),\n}; }\nfunction render(Assign $assign, Definitions $definitions): string { return render_template(${quote(program.entry)}, $assign, $definitions); }`;
}
