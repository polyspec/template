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
function render_content_tpl(Assign $assign, array $slots): string { $out = '';
    $out .= "<section data-react-island id=\"counter\">\n<p>";
    $out .= htmlspecialchars((string) ($assign->island_label ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $out .= "</p>\n</section>\n";
 return $out; }
function render_layout_tpl(Assign $assign, array $slots): string { $out = '';
    $out .= "<main>\n<h1>";
    $out .= htmlspecialchars((string) ($assign->title ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $out .= "</h1>\n";
    $out .= $slots["content"] ?? '';
    $out .= "</main>\n";
 return $out; }
function render_template(string $target, Assign $assign, array $slots): string { return match ($target) {
        "content.tpl" => render_content_tpl($assign, $slots),
        "layout.tpl" => render_layout_tpl($assign, $slots),
        default => throw new RuntimeException('generated template is missing: ' . $target),
}; }
function render(Assign $assign, array $slots): string { return render_template("layout.tpl", $assign, $slots); }
