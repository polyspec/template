<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * AST nodes (docs/spec/ast.md). Nodes are nested arrays; spans are byte offsets.
 */
final class Ast
{
    /** @internal */
    public const LOOP_META_FIELDS = ['index_', 'key_', 'value_', 'last_', 'first_', 'size_'];

    /** @internal */
    public static function isLoopMetaField(string $name): bool
    {
        return in_array($name, self::LOOP_META_FIELDS, true);
    }

    /**
     * A node: its type, its own fields in the order of the specification (docs/spec/ast.md) and its span.
     *
     * @param array<string, mixed> $fields
     * @return array<string, mixed>
     * @internal
     */
    public static function node(string $type, array $fields, int $start, int $end): array
    {
        return ['type' => $type, ...$fields, 'span' => [$start, $end]];
    }

    /**
     * Serializes an AST to JSON: number literals as JSON numbers, null fields present, lists as arrays.
     *
     * @param array<string, mixed>|list<mixed> $node
     */
    public static function toJson(mixed $node): string
    {
        if ($node === null) {
            return 'null';
        }
        if (is_bool($node)) {
            return $node ? 'true' : 'false';
        }
        if (is_int($node)) {
            return (string) $node;
        }
        if (is_float($node)) {
            if (Value\Number::isInteger($node) && abs($node) <= Value\Number::MAX_SAFE) {
                return (string) (int) $node;
            }

            return (string) json_encode($node);
        }
        if (is_string($node)) {
            return (string) json_encode($node, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        if (array_is_list($node)) {
            return '[' . implode(',', array_map([self::class, 'toJson'], $node)) . ']';
        }
        $parts = [];
        foreach ($node as $key => $value) {
            $parts[] = json_encode((string) $key) . ':' . self::toJson($value);
        }

        return '{' . implode(',', $parts) . '}';
    }
}
