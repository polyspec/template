<?php
final class Page { public function __construct(public readonly string $title) {} }
final class Assign { public function __construct(
public readonly Page $page,
public readonly string $root_label,
public readonly string $defined_label
) {} }
final class Input_content_tpl { public function __construct(public string $title, public string $root_label, public string $defined_label, public ?string $layout_local = null) {} }
final class Input_layout_tpl { public function __construct() {} }
final class DefinitionData_content_tpl { public function __construct(public bool $has_title = false, public ?string $title = null, public bool $has_root_label = false, public ?string $root_label = null, public bool $has_defined_label = false, public ?string $defined_label = null, public bool $has_layout_local = false, public ?string $layout_local = null) {} }
final class DefinitionData_layout_tpl { public function __construct() {} }
final class Definition { public function __construct(public readonly ?string $html = null, public readonly mixed $data = null) {} }
final class Definitions { public function __construct(public readonly ?Definition $content = null, public readonly ?Definition $layout = null) {} }
function generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== []; }
function generated_escape(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; if (is_array($value) || is_object($value)) throw new RuntimeException('a collection cannot be converted to text'); return str_replace('&#039;', '&#39;', htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')); }
function generated_index(array $value, string|int|float $key): mixed { return $value[is_float($key) ? (int) $key : $key] ?? null; }
function generated_entries(?array $value): array { $result = []; foreach ($value ?? [] as $key => $item) $result[] = [$key, $item]; return $result; }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }
function generated_map(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { foreach ($item['value'] as $key => $value) $result[$key] = $value; } else $result[$item['key']] = $item['value']; } return $result; }
function generated_in(mixed $value, mixed $collection): bool { return is_array($collection) ? (array_is_list($collection) ? in_array($value, $collection, true) : array_key_exists((string) $value, $collection)) : (is_string($collection) && str_contains($collection, (string) $value)); }
function generated_default(mixed $value, mixed $fallback): mixed { return generated_truthy($value) ? $value : $fallback; }
function render_content_tpl(Assign $assign, Definitions $definitions, Input_content_tpl $input): string { $out = '';
$title = $input->title;
$root_label = $input->root_label;
$defined_label = $input->defined_label;
$layout_local = $input->layout_local;
    $out .= "<article>\n<h1>";
    $out .= generated_escape($title);
    $out .= "</h1>\n<p class=\"root\">";
    $out .= generated_escape($root_label);
    $out .= "</p>\n<p class=\"defined\">";
    $out .= generated_escape($defined_label);
    $out .= "</p>\n<p class=\"local\">";
    $out .= generated_escape(generated_default($layout_local, "missing"));
    $out .= "</p>\n</article>\n";
 return $out; }
function render_layout_tpl(Assign $assign, Definitions $definitions, Input_layout_tpl $input): string { $out = '';

    $layout_local = "visible only in layout";
    $out .= "<section class=\"scope\">\n";
    $definition = $definitions->content;
    if ($definition === null) throw new RuntimeException("generated definition content is missing");
    if ($definition?->html !== null) {
        $out .= $definition->html;
    } else {
        if ($definition?->data !== null && !($definition->data instanceof DefinitionData_content_tpl)) throw new RuntimeException("generated definition content data has an invalid type");
        $input = new Input_content_tpl(title: ($definition?->data !== null && $definition->data->has_title ? $definition->data->title : throw new RuntimeException("generated input content.tpl.title is missing")), root_label: $assign->root_label, defined_label: $assign->defined_label, layout_local: null);
        if ($definition?->data !== null) {
            if ($definition->data->has_title) $input->title = $definition->data->title;
            if ($definition->data->has_root_label) $input->root_label = $definition->data->root_label;
            if ($definition->data->has_defined_label) $input->defined_label = $definition->data->defined_label;
            if ($definition->data->has_layout_local) $input->layout_local = $definition->data->layout_local;
        }
        $input->title = $assign->page?->title;
        $out .= render_content_tpl($assign, $definitions, $input);
    }
    $out .= "</section>\n";
 return $out; }
function render_template(string $target, Assign $assign, Definitions $definitions): string { return match ($target) {
        "layout.tpl" => render_layout_tpl($assign, $definitions, new Input_layout_tpl()),
        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),
}; }
function render(Assign $assign, Definitions $definitions): string { return render_template("layout.tpl", $assign, $definitions); }
