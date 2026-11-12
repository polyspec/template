<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2,
 * AST-7), and, for indented lines, after the spaces and tabs at the start of every line of text are removed.
 * @internal
 */
final class Invariant
{
    /**
     * Returns a copy of an AST value without `span` fields.
     */
    public static function withoutSpans(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $result = [];
        foreach ($value as $key => $field) {
            if ($key !== 'span') {
                $result[$key] = self::withoutSpans($field);
            }
        }

        return array_is_list($value) ? array_values($result) : $result;
    }

    /**
     * Returns a copy of an AST value whose `Text` nodes have no spaces or tabs at the start of a line. A `Text` node
     * that becomes empty is removed: indentation after a line that the renderer removes is a `Text` node of its own.
     */
    public static function withoutLineIndentation(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            $items = array_map(self::withoutLineIndentation(...), $value);

            return array_values(array_filter(
                $items,
                static fn (mixed $item): bool => !(
                    is_array($item)
                    && ($item['type'] ?? null) === 'Text'
                    && ($item['value'] ?? null) === ''
                ),
            ));
        }
        $result = [];
        foreach ($value as $key => $field) {
            $result[$key] = ($value['type'] ?? null) === 'Text' && $key === 'value' && is_string($field)
                ? (string) preg_replace('/(^|\n)[ \t]+/', '$1', $field)
                : self::withoutLineIndentation($field);
        }

        return $result;
    }

    /**
     * Compares two AST values structurally, ignoring the key order of maps and every `span` field.
     */
    public static function sameTree(mixed $left, mixed $right): bool
    {
        return self::equal(self::withoutSpans($left), self::withoutSpans($right));
    }

    private static function equal(mixed $left, mixed $right): bool
    {
        if (!is_array($left) || !is_array($right)) {
            return $left === $right;
        }
        if (count($left) !== count($right) || array_is_list($left) !== array_is_list($right)) {
            return false;
        }
        foreach ($left as $key => $item) {
            if (!array_key_exists($key, $right) || !self::equal($item, $right[$key])) {
                return false;
            }
        }

        return true;
    }
}
