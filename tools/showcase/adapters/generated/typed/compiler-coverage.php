<?php

declare(strict_types=1);

use Polyspec\Template\PreparedExecution;
use Polyspec\Template\PreparedRender;
use Polyspec\Template\Program;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\MapValue;
final class Page { public function __construct(public readonly string $title) {} }
final class Row { public function __construct(public readonly string $name) {} }
final class Slot { public function __construct(public readonly ?string $template = null, public readonly ?string $html = null) {} }
final class Assign { public function __construct(
public readonly bool $flag,
public readonly string $dangerous,
public readonly array $empty_list,
public readonly array $empty_map,
public readonly Page $page,
public readonly array $numbers,
public readonly array $lookup,
public readonly array $rows
) {} }
final class Input_card_tpl { public function __construct(public string $label) {} }
final class Input_layout_tpl { public function __construct() {} }
final class Input_partial_tpl { public function __construct(public array $values) {} }
final class DefinitionData_card_tpl { public function __construct(public bool $has_label = false, public ?string $label = null) {} }
final class DefinitionData_layout_tpl { public function __construct() {} }
final class DefinitionData_partial_tpl { public function __construct(public bool $has_values = false, public ?array $values = null) {} }
final class Definition { public function __construct(public readonly ?string $html = null, public readonly mixed $data = null) {} }
final class Definitions { public function __construct(public readonly ?Definition $content = null, public readonly ?Definition $layout = null) {} }
final class ArtifactManifest { public function __construct(public readonly int $schema, public readonly string $mode, public readonly string $target, public readonly string $entry, public readonly string $sourceDigest, public readonly string $typeDigest, public readonly string $contractDigest, public readonly array $files) {} }
const GENERATED_RECORDS_SCHEMA = 'eyJQYWdlIjp7InRpdGxlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fSwiUm93Ijp7Im5hbWUiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX19LCJTbG90Ijp7InRlbXBsYXRlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6dHJ1ZX0sImh0bWwiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjp0cnVlfX19';
const GENERATED_ASSIGN_SCHEMA = 'eyJmbGFnIjp7ImtpbmQiOiJib29sZWFuIiwib3B0aW9uYWwiOmZhbHNlfSwiZGFuZ2Vyb3VzIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9LCJlbXB0eV9saXN0Ijp7ImtpbmQiOiJsaXN0IiwiaXRlbSI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfSwib3B0aW9uYWwiOmZhbHNlfSwiZW1wdHlfbWFwIjp7ImtpbmQiOiJtYXAiLCJrZXkiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX0sInZhbHVlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9LCJvcHRpb25hbCI6ZmFsc2V9LCJwYWdlIjp7ImtpbmQiOiJyZWNvcmQiLCJuYW1lIjoiUGFnZSIsIm9wdGlvbmFsIjpmYWxzZX0sIm51bWJlcnMiOnsia2luZCI6Imxpc3QiLCJpdGVtIjp7ImtpbmQiOiJudW1iZXIiLCJvcHRpb25hbCI6ZmFsc2V9LCJvcHRpb25hbCI6ZmFsc2V9LCJsb29rdXAiOnsia2luZCI6Im1hcCIsImtleSI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfSwidmFsdWUiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX0sIm9wdGlvbmFsIjpmYWxzZX0sInJvd3MiOnsia2luZCI6Imxpc3QiLCJpdGVtIjp7ImtpbmQiOiJyZWNvcmQiLCJuYW1lIjoiUm93Iiwib3B0aW9uYWwiOmZhbHNlfSwib3B0aW9uYWwiOmZhbHNlfX0=';
const GENERATED_DEFINITION_SCHEMA = 'eyJjb250ZW50Ijp7ImZpZWxkIjoiY29udGVudCIsInRhcmdldCI6ImNhcmQudHBsIiwiaHRtbCI6dHJ1ZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YV9jYXJkX3RwbCIsImlucHV0Ijp7ImxhYmVsIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fX0sImxheW91dCI6eyJmaWVsZCI6ImxheW91dCIsInRhcmdldCI6ImxheW91dC50cGwiLCJodG1sIjpmYWxzZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YV9sYXlvdXRfdHBsIiwiaW5wdXQiOnt9fX0=';
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
function render_card_tpl(Assign $assign, Definitions $definitions, Input_card_tpl $input): string { $out = '';
$label = $input->label;
    $out .= "<p class=\"card\">";
    $out .= generated_escape($label);
    $out .= "</p>\n";
 return $out; }
function render_layout_tpl(Assign $assign, Definitions $definitions, Input_layout_tpl $input): string { $out = '';

    $values = generated_list([['spread' => false, 'value' => 0], ['spread' => true, 'value' => $assign->numbers]]);
    $merged = generated_map([['spread' => true, 'value' => $assign->lookup], ['spread' => false, 'key' => "z", 'value' => "Z"]]);
    $out .= "<section>\n<h1>";
    $out .= generated_escape($assign->page?->title);
    $out .= "</h1>\n<p class=\"escaped\">";
    $out .= generated_escape($assign->dangerous);
    $out .= "</p>\n<p class=\"logical\">";
    $out .= generated_escape((generated_truthy($assign->flag) && generated_truthy("x")));
    $out .= "|";
    $out .= generated_escape((generated_truthy(false) || generated_truthy(2)));
    $out .= "</p>\n<p class=\"empty-truthiness\">";
    $out .= generated_escape((generated_truthy($assign->empty_list) && generated_truthy($assign->flag)));
    $out .= "|";
    $out .= generated_escape((generated_truthy($assign->empty_map) && generated_truthy($assign->flag)));
    $out .= "</p>\n<p>";
    $out .= generated_escape(generated_index($values, 1));
    $out .= "|";
    $out .= generated_escape(generated_index($merged, "z"));
    $out .= "</p>\n";
    if (generated_truthy((generated_truthy($assign->flag) && generated_truthy(($assign->page?->title == "Guide"))))) {
        $out .= "<strong>matched</strong>";    } else {
        $out .= "<strong>missed</strong>";
    }
    $out .= "\n<p>";
    $out .= generated_escape((generated_truthy($assign->flag) ? "yes" : "no"));
    $out .= "|";
    $out .= generated_escape(((-1) + 3));
    $out .= "|";
    $out .= generated_escape(generated_default("", "fallback"));
    $out .= "</p>\n<ul>\n";
    $row_entries = generated_entries($assign->rows);
    foreach ($row_entries as $row_index => [$row_key, $row_value]) {
        $row = $row_value;
        $row_size = count($row_entries);
        $row_first = $row_index === 0;
        $row_last = $row_index + 1 === count($row_entries);
            $out .= "<li>";
            $out .= generated_escape($row_index);
            $out .= "/";
            $out .= generated_escape($row_size);
            $out .= ":";
            $out .= generated_escape($row?->name);
            $out .= ":";
            $out .= generated_escape($row_first);
            $out .= ":";
            $out .= generated_escape($row_last);
            $out .= "</li>\n";
    }
    if (count($row_entries) === 0) {
            $out .= "<li>empty</li>\n";
    }
    $out .= "</ul>\n";
    $out .= render_partial_tpl($assign, $definitions, new Input_partial_tpl(values: $values));
    if ($definitions->content !== null) {
            $out .= "<p>defined</p>";
    } else {
            $out .= "<p>missing</p>";
    }
    $out .= "\n";
    $definition = $definitions->content;
    if ($definition === null) throw new RuntimeException("generated definition content is missing");
    if ($definition?->html !== null) {
        $out .= $definition->html;
    } else {
        if ($definition?->data !== null && !($definition->data instanceof DefinitionData_card_tpl)) throw new RuntimeException("generated definition content data has an invalid type");
        $input = new Input_card_tpl(label: ($definition?->data !== null && $definition->data->has_label ? $definition->data->label : throw new RuntimeException("generated input card.tpl.label is missing")));
        if ($definition?->data !== null) {
            if ($definition->data->has_label) $input->label = $definition->data->label;
        }
        $input->label = $assign->page?->title;
        $out .= render_card_tpl($assign, $definitions, $input);
    }
    $out .= "</section>\n";
 return $out; }
function render_partial_tpl(Assign $assign, Definitions $definitions, Input_partial_tpl $input): string { $out = '';
$values = $input->values;
    $out .= "<p class=\"included\">";
    $out .= generated_escape(generated_index($values, 2));
    $out .= "</p>\n";
 return $out; }
function render_template(string $target, Assign $assign, Definitions $definitions): string { return match ($target) {
        "layout.tpl" => render_layout_tpl($assign, $definitions, new Input_layout_tpl()),
        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),
}; }
function render(Assign $assign, Definitions $definitions): string { return render_template("layout.tpl", $assign, $definitions); }
final class GeneratedExecution implements PreparedExecution { public function __construct(private readonly string $target, private readonly Assign $assign, private readonly Definitions $definitions, private readonly ?string $html) {} public function render(): string { return $this->html ?? render_template($this->target, $this->assign, $this->definitions); } }
final class GeneratedProgram implements Program { public readonly RuntimeEnvironment $runtime; public function __construct(?RuntimeEnvironment $runtime = null) { $this->runtime = $runtime ?? new RuntimeEnvironment(); } public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender { if (!is_string($target)) throw new InvalidArgumentException('generated target must be a template name'); $typedAssign = generated_bind_assign($assign); [$definitions, $targets] = generated_bind_definitions($options['define'] ?? []); $resolved = $targets[$target] ?? null; $targetName = $resolved['target'] ?? $target; $html = $resolved['html'] ?? null; return new PreparedRender(new GeneratedExecution($targetName, $typedAssign, $definitions, $html)); } public function render(string|array $target, mixed $assign = [], array $options = []): string { return $this->prepare($target, $assign, $options)->render(); } }
