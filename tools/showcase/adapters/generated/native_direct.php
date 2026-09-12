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
        'compiler-coverage' => match ($name) {
            'card.tpl' => generated_compiler_coverage__card_tpl($root, $define, $parent),
            'layout.tpl' => generated_compiler_coverage__layout_tpl($root, $define, $parent),
            'partial.tpl' => generated_compiler_coverage__partial_tpl($root, $define, $parent),
            default => throw new RuntimeException('generated template is missing: ' . $name),
        },
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

function generated_escape_full(mixed $value): string { if (is_bool($value)) $value = $value ? 'true' : 'false'; return generated_escape($value); }
function generated_index(mixed $value, mixed $key): mixed { if ($value instanceof MapValue) return $value->get((string) $key); if (is_array($value)) return $value[(int) $key] ?? null; return null; }
function generated_entries(mixed $value): array { $result = []; if ($value instanceof MapValue) { foreach ($value->entries() as $key => $item) $result[] = [$key, $item]; return $result; } if (is_array($value)) { foreach ($value as $key => $item) $result[] = [$key, $item]; return $result; } if ($value === null) return []; throw new RuntimeException('generated renderer expected an iterable'); }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) { if (!is_array($item['value'])) throw new RuntimeException('generated list spread requires a list'); array_push($result, ...$item['value']); } else $result[] = $item['value']; } return $result; }
function generated_map(array $items): MapValue { $result = new MapValue(); foreach ($items as $item) { if ($item['spread']) { if (!$item['value'] instanceof MapValue) throw new RuntimeException('generated map spread requires a map'); foreach ($item['value']->entries() as $key => $value) $result->set($key, $value); } else $result->set((string) $item['key'], $item['value']); } return $result; }
function generated_ternary(mixed $test, mixed $thenValue, mixed $elseValue): mixed { return generated_truthy($test) ? $thenValue : $elseValue; }
function generated_unary_full(string $op, mixed $value): mixed { if ($op === '!') return !generated_truthy($value); if (is_float($value) || is_int($value)) return -$value; throw new RuntimeException('generated unary operator requires a number'); }
function generated_binary_full(string $op, mixed $left, mixed $right): mixed { return match ($op) { '&&' => generated_truthy($left) && generated_truthy($right), '||' => generated_truthy($left) || generated_truthy($right), '??' => $left ?? $right, '==', '===' => $left === $right, '!=', '!==' => $left !== $right, '+' => is_string($left) || is_string($right) ? (string) $left . (string) $right : $left + $right, '-' => $left - $right, '*' => $left * $right, '/' => $left / $right, '%' => $left % $right, '<' => $left < $right, '>' => $left > $right, '<=' => $left <= $right, '>=' => $left >= $right, 'in' => is_array($right) ? in_array($left, $right, true) : ($right instanceof MapValue ? $right->has((string) $left) : (is_string($right) && str_contains($right, (string) $left))), default => throw new RuntimeException('unknown generated binary operator: ' . $op), }; }

function generated_compiler_coverage__card_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<p class=\"card\">";
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'label'));
    $out .= "</p>\n";
    return $out;
}

function generated_compiler_coverage__layout_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $ctx->set('values', generated_list([['value' => 0, 'spread' => false], ['value' => generated_lookup($ctx, $root, 'numbers'), 'spread' => true]]));
    $ctx->set('merged', generated_map([['value' => generated_lookup($ctx, $root, 'lookup'), 'spread' => true], ['key' => 'z', 'value' => 'Z', 'spread' => false]]));
    $out .= "<section>\n<h1>";
    $out .= generated_escape_full(generated_member(generated_lookup($ctx, $root, 'page'), 'title'));
    $out .= "</h1>\n<p>";
    $out .= generated_escape_full(generated_index(generated_lookup($ctx, $root, 'values'), 1));
    $out .= "|";
    $out .= generated_escape_full(generated_index(generated_lookup($ctx, $root, 'merged'), 'z'));
    $out .= "</p>\n";
    if (generated_truthy(generated_binary_full('&&', generated_lookup($ctx, $root, 'flag'), generated_binary_full('==', generated_member(generated_lookup($ctx, $root, 'page'), 'title'), 'Guide')))) {
        $out .= "<strong>matched</strong>";
    } else {
        $out .= "<strong>missed</strong>";
    }
    $out .= "\n<p>";
    $out .= generated_escape_full(generated_ternary(generated_lookup($ctx, $root, 'flag'), 'yes', 'no'));
    $out .= "|";
    $out .= generated_escape_full(generated_binary_full('+', generated_unary_full('-', 1), 3));
    $out .= "|";
    $out .= generated_escape_full(generated_call('default', ['', 'fallback']));
    $out .= "</p>\n<ul>\n";
    $loopEntries = generated_entries(generated_lookup($ctx, $root, 'rows'));
    foreach ($loopEntries as $loopIndex => [$loopKey, $loopValue]) {
        $previous = $ctx;
        $ctx = $ctx->copy();
        $ctx->set('row', $loopValue);
        $ctx->set('row.key_', $loopKey);
        $ctx->set('row.value_', $loopValue);
        $ctx->set('row.index_', (float) $loopIndex);
        $ctx->set('row.size_', (float) count($loopEntries));
        $ctx->set('row.first_', $loopIndex === 0);
        $ctx->set('row.last_', $loopIndex + 1 === count($loopEntries));
        $out .= "<li>";
        $out .= generated_escape_full(generated_lookup($ctx, $root, 'row.index_'));
        $out .= "/";
        $out .= generated_escape_full(generated_lookup($ctx, $root, 'row.size_'));
        $out .= ":";
        $out .= generated_escape_full(generated_member(generated_lookup($ctx, $root, 'row'), 'name'));
        $out .= ":";
        $out .= generated_escape_full(generated_lookup($ctx, $root, 'row.first_'));
        $out .= ":";
        $out .= generated_escape_full(generated_lookup($ctx, $root, 'row.last_'));
        $out .= "</li>\n";
        $ctx = $previous;
    }
    if (count($loopEntries) === 0) {
        $out .= "<li>empty</li>\n";
    }
    $out .= "</ul>\n";
    $out .= generated_template('partial.tpl', 'compiler-coverage', $root, $define, $ctx);
    if ($define->has('content')) {
        $out .= "<p>defined</p>";
    } else {
        $out .= "<p>missing</p>";
    }
    $out .= "\n";
    $blockScope = new MapValue();
    $blockScope->set('label', generated_member(generated_lookup($ctx, $root, 'page'), 'title'));
    $out .= generated_block('content', '', 'compiler-coverage', $root, $define, $blockScope);
    $out .= "</section>\n";
    return $out;
}

function generated_compiler_coverage__partial_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<p class=\"included\">";
    $out .= generated_escape_full(generated_index(generated_lookup($ctx, $root, 'values'), 2));
    $out .= "</p>\n";
    return $out;
}

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
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'heading'));
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
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'island_label'));
    $out .= "</p>\n</section>\n";
    return $out;
}

function generated_react_boundary__layout_tpl(MapValue $root, MapValue $define, MapValue $parent): string {
    $ctx = $parent->copy();
    $out = '';
    $out .= "<main>\n<h1>";
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'title'));
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
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'title'));
    $out .= "</h1>\n<p class=\"root\">";
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'root_label'));
    $out .= "</p>\n<p class=\"defined\">";
    $out .= generated_escape_full(generated_lookup($ctx, $root, 'defined_label'));
    $out .= "</p>\n<p class=\"local\">";
    $out .= generated_escape_full(generated_call('default', [generated_lookup($ctx, $root, 'layout_local'), 'missing']));
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
