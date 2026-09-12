<?php

declare(strict_types=1);

use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Json;
use Polyspec\Template\TemplateError;

function generated_lookup(MapValue $ctx, MapValue $root, string $name): mixed { return $ctx->has($name) ? $ctx->get($name) : $root->get($name); }
function generated_member(mixed $value, string $key): mixed { return $value instanceof MapValue ? $value->get($key) : null; }
function generated_truthy(mixed $value): bool { return $value !== null && $value !== false && $value !== '' && $value !== 0; }
function generated_escape(mixed $value): string { if ($value instanceof MapValue || is_array($value)) throw new RuntimeException('a collection cannot be converted to text'); return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function generated_call(string $name, array $args): mixed { if ($name === 'default') return generated_truthy($args[0] ?? null) ? ($args[0] ?? null) : ($args[1] ?? null); return null; }
function generated_block(string $id, string $path, string $scenario, MapValue $root, MapValue $define, MapValue $scope): string { $entry = $define->get($id); if (!$entry instanceof DefineEntry) return ''; if ($entry->html !== null) return $entry->html; $context = $root->copy(); if ($entry->data !== null) foreach ($entry->data->entries() as $key => $value) $context->set($key, $value); foreach ($scope->entries() as $key => $value) $context->set($key, $value); return generated_template($entry->template ?? $path, $scenario, $root, $define, $context); }
function generated_template(string $name, string $scenario, MapValue $root, MapValue $define, MapValue $parent): string { return match ($scenario) {
        'empty-state' => match ($name) {
            'layout.tpl' => generated_empty_state__layout_tpl($root, $define, $parent),
            default => throw new RuntimeException('generated template is missing: ' . $name),
        },
        'html-slot' => match ($name) {
            'layout.tpl' => generated_html_slot__layout_tpl($root, $define, $parent),
            default => throw new RuntimeException('generated template is missing: ' . $name),
        },
        'react-boundary' => match ($name) {
            'content.tpl' => generated_react_boundary__content_tpl($root, $define, $parent),
            'layout.tpl' => generated_react_boundary__layout_tpl($root, $define, $parent),
            default => throw new RuntimeException('generated template is missing: ' . $name),
        },
        'scope-precedence' => match ($name) {
            'content.tpl' => generated_scope_precedence__content_tpl($root, $define, $parent),
            'layout.tpl' => generated_scope_precedence__layout_tpl($root, $define, $parent),
            default => throw new RuntimeException('generated template is missing: ' . $name),
        },
        default => throw new RuntimeException('generated scenario is missing: ' . $scenario),
    }; }
function generatedDirectRender(string $rootPath, RenderRequest $request): string { $entry = $request->define->get($request->target); $name = $request->target; if ($entry instanceof DefineEntry && $entry->template !== null) $name = $entry->template; return generated_template($name, basename($rootPath), $request->assign, $request->define, new MapValue()); }

function generated_empty_state__layout_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<main class=\"empty-page\">\n";
    if ($define->has('content')) {
        $blockScope = new MapValue();
        $out .= generated_block('content', '', 'empty-state', $root, $define, $blockScope);
    } else {
        $out .= "<p class=\"empty\">No content definition.</p>\n";
    }
    $out .= "</main>\n";
    return $out;
}

function generated_html_slot__layout_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<section class=\"notice\">\n<h1>";
    $out .= generated_escape(generated_lookup($ctx, $root, 'heading'));
    $out .= "</h1>\n";
    $blockScope = new MapValue();
    $out .= generated_block('content', '', 'html-slot', $root, $define, $blockScope);
    $out .= "</section>\n";
    return $out;
}

function generated_react_boundary__content_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<section data-react-island id=\"counter\">\n<p>";
    $out .= generated_escape(generated_lookup($ctx, $root, 'island_label'));
    $out .= "</p>\n</section>\n";
    return $out;
}

function generated_react_boundary__layout_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<main>\n<h1>";
    $out .= generated_escape(generated_lookup($ctx, $root, 'title'));
    $out .= "</h1>\n";
    $blockScope = new MapValue();
    $out .= generated_block('content', '', 'react-boundary', $root, $define, $blockScope);
    $out .= "</main>\n";
    return $out;
}

function generated_scope_precedence__content_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<article>\n<h1>";
    $out .= generated_escape(generated_lookup($ctx, $root, 'title'));
    $out .= "</h1>\n<p class=\"root\">";
    $out .= generated_escape(generated_lookup($ctx, $root, 'root_label'));
    $out .= "</p>\n<p class=\"defined\">";
    $out .= generated_escape(generated_lookup($ctx, $root, 'defined_label'));
    $out .= "</p>\n<p class=\"local\">";
    $out .= generated_escape(generated_call('default', [generated_lookup($ctx, $root, 'layout_local'), 'missing']));
    $out .= "</p>\n</article>\n";
    return $out;
}

function generated_scope_precedence__layout_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $ctx->set('layout_local', 'visible only in layout');
    $out .= "<section class=\"scope\">\n";
    $blockScope = new MapValue();
    $blockScope->set('title', generated_member(generated_lookup($ctx, $root, 'page'), 'title'));
    $out .= generated_block('content', '', 'scope-precedence', $root, $define, $blockScope);
    $out .= "</section>\n";
    return $out;
}
