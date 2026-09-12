<?php

declare(strict_types=1);

use Polyspec\Template\PreparedExecution;
use Polyspec\Template\PreparedRender;
use Polyspec\Template\Program;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\MapValue;

final class Assign { public function __construct(
public readonly string $heading
) {} }
final class Input_layout_tpl { public function __construct() {} }
final class DefinitionData_layout_tpl { public function __construct() {} }
final class Definition { public function __construct(public readonly ?string $html = null, public readonly mixed $data = null) {} }
final class Definitions { public function __construct(public readonly ?Definition $content = null, public readonly ?Definition $layout = null) {} }
final class ArtifactManifest { public function __construct(public readonly int $schema, public readonly string $mode, public readonly string $target, public readonly string $entry, public readonly string $sourceDigest, public readonly string $typeDigest, public readonly string $contractDigest, public readonly array $files) {} }
const GENERATED_RECORDS_SCHEMA = 'e30=';
const GENERATED_ASSIGN_SCHEMA = 'eyJoZWFkaW5nIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fQ==';
const GENERATED_DEFINITION_SCHEMA = 'eyJjb250ZW50Ijp7ImZpZWxkIjoiY29udGVudCIsInRhcmdldCI6bnVsbCwiaHRtbCI6dHJ1ZSwiY2xhc3MiOm51bGwsImlucHV0Ijp7fX0sImxheW91dCI6eyJmaWVsZCI6ImxheW91dCIsInRhcmdldCI6ImxheW91dC50cGwiLCJodG1sIjpmYWxzZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YV9sYXlvdXRfdHBsIiwiaW5wdXQiOnt9fX0=';
function generated_schema(string $encoded): array { static $schemas = []; return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR); }
function generated_bind_type(mixed $value, array $type, string $path): mixed { if ($value === null) { if (($type['optional'] ?? false) || $type['kind'] === 'null' || $type['kind'] === 'any') return null; throw new InvalidArgumentException($path . ' is required'); } if ($type['kind'] === 'any') return $value; if (in_array($type['kind'], ['string', 'number', 'boolean'], true)) { $valid = $type['kind'] === 'string' ? is_string($value) : ($type['kind'] === 'number' ? (is_float($value) || is_int($value)) : is_bool($value)); if (!$valid) throw new InvalidArgumentException($path . ' has an invalid type'); return $type['kind'] === 'number' ? (float) $value : $value; } if ($type['kind'] === 'list') { if (!is_array($value)) throw new InvalidArgumentException($path . ' is not a list'); return array_map(fn ($item, $index) => generated_bind_type($item, $type['item'], $path . '[' . $index . ']'), $value, array_keys($value)); } if ($type['kind'] === 'map') { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not a map'); $result = []; foreach ($value->entries() as $key => $item) $result[generated_bind_type($key, $type['key'], $path . '.key')] = generated_bind_type($item, $type['value'], $path . '.' . $key); return $result; } if ($type['kind'] === 'record') { $records = generated_schema(GENERATED_RECORDS_SCHEMA); return generated_bind_record($value, $records[$type['name']], $type['name'], $path); } throw new InvalidArgumentException($path . ' has an unknown generated type'); }
function generated_bind_record(mixed $value, array $fields, string $class, string $path): object { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not an object'); $arguments = []; foreach ($fields as $name => $type) { if (!$value->has($name)) { if (!($type['optional'] ?? false)) throw new InvalidArgumentException($path . '.' . $name . ' is required'); continue; } $arguments[$name] = generated_bind_type($value->get($name), $type, $path . '.' . $name); } return new $class(...$arguments); }
function generated_bind_assign(mixed $value): Assign { return generated_bind_record(Bind::map($value), generated_schema(GENERATED_ASSIGN_SCHEMA), Assign::class, 'assign'); }
function generated_bind_definitions(array $input): array { $value = Bind::map($input); $arguments = []; $targets = []; $specs = generated_schema(GENERATED_DEFINITION_SCHEMA); foreach ($value->entries() as $id => $raw) { $spec = $specs[$id] ?? null; if ($spec === null) throw new InvalidArgumentException('define.' . $id . ' is not declared'); if (is_string($raw)) { if ($spec['target'] === null || $raw !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $arguments[$spec['field']] = new Definition(); $targets[$id] = ['target' => $spec['target']]; continue; } if (!$raw instanceof MapValue) throw new InvalidArgumentException('define.' . $id . ' is not an object'); $template = $raw->get('template'); $html = $raw->get('html'); $data = $raw->get('data'); if (is_string($html)) { if (!$spec['html'] || $raw->has('template') || $raw->has('data')) throw new InvalidArgumentException('define.' . $id . ' has an invalid html entry'); $arguments[$spec['field']] = new Definition(html: $html); $targets[$id] = ['target' => null, 'html' => $html]; continue; } if (!is_string($template) || $spec['target'] === null || $template !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $boundData = null; if ($raw->has('data')) { if ($data === []) $data = new MapValue(); if (!$data instanceof MapValue) throw new InvalidArgumentException('define.' . $id . '.data is not an object'); $values = []; foreach ($spec['input'] as $name => $type) { if ($data->has($name)) { $values['has_' . $name] = true; $values[$name] = generated_bind_type($data->get($name), $type, 'define.' . $id . '.data.' . $name); } } $class = $spec['class']; $boundData = new $class(...$values); } $arguments[$spec['field']] = new Definition(data: $boundData); $targets[$id] = ['target' => $spec['target']]; } return [new Definitions(...$arguments), $targets]; }
function generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== []; }
function generated_escape(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; if (is_array($value) || is_object($value)) throw new RuntimeException('a collection cannot be converted to text'); return str_replace('&#039;', '&#39;', htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')); }
function generated_index(array $value, string|int|float $key): mixed { return $value[is_float($key) ? (int) $key : $key] ?? null; }
function generated_entries(?array $value): array { $result = []; foreach ($value ?? [] as $key => $item) $result[] = [$key, $item]; return $result; }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }
function generated_map(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { foreach ($item['value'] as $key => $value) $result[$key] = $value; } else $result[$item['key']] = $item['value']; } return $result; }
function generated_in(mixed $value, mixed $collection): bool { return is_array($collection) ? (array_is_list($collection) ? in_array($value, $collection, true) : array_key_exists((string) $value, $collection)) : (is_string($collection) && str_contains($collection, (string) $value)); }
function generated_default(mixed $value, mixed $fallback): mixed { return generated_truthy($value) ? $value : $fallback; }
function render_layout_tpl(Assign $assign, Definitions $definitions, Input_layout_tpl $input): string { $out = '';

    $out .= "<section class=\"notice\">\n<h1>";
    $out .= generated_escape($assign->heading);
    $out .= "</h1>\n";
    $definition = $definitions->content;
    if ($definition?->html === null) throw new RuntimeException("generated definition content requires html");
    $out .= $definition->html;
    $out .= "</section>\n";
 return $out; }
function render_template(string $target, Assign $assign, Definitions $definitions): string { return match ($target) {
        "layout.tpl" => render_layout_tpl($assign, $definitions, new Input_layout_tpl()),
        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),
}; }
function render(Assign $assign, Definitions $definitions): string { return render_template("layout.tpl", $assign, $definitions); }
final class GeneratedExecution implements PreparedExecution { public function __construct(private readonly string $target, private readonly Assign $assign, private readonly Definitions $definitions, private readonly ?string $html) {} public function render(): string { return $this->html ?? render_template($this->target, $this->assign, $this->definitions); } }
final class GeneratedProgram implements Program { public readonly RuntimeEnvironment $runtime; public function __construct(?RuntimeEnvironment $runtime = null) { $this->runtime = $runtime ?? new RuntimeEnvironment(); } public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender { if (!is_string($target)) throw new InvalidArgumentException('generated target must be a template name'); $typedAssign = generated_bind_assign($assign); [$definitions, $targets] = generated_bind_definitions($options['define'] ?? []); $resolved = $targets[$target] ?? null; $targetName = $resolved['target'] ?? $target; $html = $resolved['html'] ?? null; return new PreparedRender(new GeneratedExecution($targetName, $typedAssign, $definitions, $html)); } public function render(string|array $target, mixed $assign = [], array $options = []): string { return $this->prepare($target, $assign, $options)->render(); } }
