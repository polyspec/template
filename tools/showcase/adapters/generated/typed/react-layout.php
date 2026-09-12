<?php
final class Page { public function __construct(public readonly string $title = '') {} }
final class Slot { public function __construct(public readonly string $template = '', public readonly string $html = '') {} }
final class Assign { public function __construct(
public readonly ?string $title = null,
public readonly ?string $heading = null,
public readonly ?string $island_label = null,
public readonly ?string $root_label = null,
public readonly ?string $defined_label = null,
public readonly ?Page $page = null
) {} }
function render(Assign $assign, array $slots): string { $out = '';
    $out .= "<main>\n<h1>";
    $out .= htmlspecialchars((string) ($assign->title ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $out .= "</h1>\n";
    $out .= $slots["content"] ?? '';
    $out .= "</main>\n";
 return $out; }
