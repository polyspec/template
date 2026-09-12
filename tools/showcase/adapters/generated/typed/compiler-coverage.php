<?php
final class Page { public function __construct(public readonly string $title) {} }
final class Row { public function __construct(public readonly string $name) {} }
final class Slot { public function __construct(public readonly ?string $template = null, public readonly ?string $html = null) {} }
final class Assign { public function __construct(
public readonly bool $flag,
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
function generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== []; }
function generated_escape(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; if (is_array($value) || is_object($value)) throw new RuntimeException('a collection cannot be converted to text'); return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function generated_index(array $value, string|int|float $key): mixed { return $value[is_float($key) ? (int) $key : $key] ?? null; }
function generated_entries(?array $value): array { $result = []; foreach ($value ?? [] as $key => $item) $result[] = [$key, $item]; return $result; }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }
function generated_map(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { foreach ($item['value'] as $key => $value) $result[$key] = $value; } else $result[$item['key']] = $item['value']; } return $result; }
function generated_in(mixed $value, mixed $collection): bool { return is_array($collection) ? (array_is_list($collection) ? in_array($value, $collection, true) : array_key_exists((string) $value, $collection)) : (is_string($collection) && str_contains($collection, (string) $value)); }
function generated_call(string $name, array $args): mixed { if ($name === 'default' && count($args) === 2) return generated_truthy($args[0]) ? $args[0] : $args[1]; throw new RuntimeException('generated function is not linked: ' . $name); }
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
    $out .= "</h1>\n<p>";
    $out .= generated_escape(generated_index($values, 1));
    $out .= "|";
    $out .= generated_escape(generated_index($merged, "z"));
    $out .= "</p>\n";
    if (generated_truthy(($assign->flag && ($assign->page?->title == "Guide")))) {
        $out .= "<strong>matched</strong>";    } else {
        $out .= "<strong>missed</strong>";
    }
    $out .= "\n<p>";
    $out .= generated_escape(($assign->flag ? "yes" : "no"));
    $out .= "|";
    $out .= generated_escape(((-1) + 3));
    $out .= "|";
    $out .= generated_escape(generated_call("default", ["", "fallback"]));
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
