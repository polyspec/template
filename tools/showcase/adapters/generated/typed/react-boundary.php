<?php
final class Page { public function __construct(public readonly ?string $title = null) {} }
final class Slot { public function __construct(public readonly ?string $template = null, public readonly ?string $html = null) {} }
final class Assign { public function __construct(
public readonly ?string $title = null,
public readonly ?string $heading = null,
public readonly ?string $island_label = null,
public readonly ?string $root_label = null,
public readonly ?string $defined_label = null,
public readonly ?Page $page = null
) {} }
final class Input_content_tpl { public function __construct() {} }
final class Input_layout_tpl { public function __construct() {} }
final class DefinitionData_content_tpl { public function __construct() {} }
final class DefinitionData_layout_tpl { public function __construct() {} }
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
function render_content_tpl(Assign $assign, Definitions $definitions, Input_content_tpl $input): string { $out = '';

    $out .= "<section data-react-island id=\"counter\">\n<p>";
    $out .= generated_escape($assign->island_label);
    $out .= "</p>\n</section>\n";
 return $out; }
function render_layout_tpl(Assign $assign, Definitions $definitions, Input_layout_tpl $input): string { $out = '';

    $out .= "<main>\n<h1>";
    $out .= generated_escape($assign->title);
    $out .= "</h1>\n";
    $definition = $definitions->content;
    if ($definition === null) throw new RuntimeException("generated definition content is missing");
    if ($definition?->html !== null) {
        $out .= $definition->html;
    } else {
        if ($definition?->data !== null && !($definition->data instanceof DefinitionData_content_tpl)) throw new RuntimeException("generated definition content data has an invalid type");
        $input = new Input_content_tpl();
        if ($definition?->data !== null) {

        }

        $out .= render_content_tpl($assign, $definitions, $input);
    }
    $out .= "</main>\n";
 return $out; }
function render_template(string $target, Assign $assign, Definitions $definitions): string { return match ($target) {
        "content.tpl" => render_content_tpl($assign, $definitions, new Input_content_tpl()),
        "layout.tpl" => render_layout_tpl($assign, $definitions, new Input_layout_tpl()),
        default => throw new RuntimeException('generated template is missing or requires inputs: ' . $target),
}; }
function render(Assign $assign, Definitions $definitions): string { return render_template("layout.tpl", $assign, $definitions); }
