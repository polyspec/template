<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * AST node builders (docs/spec/ast.md). Nodes are nested arrays; spans are byte offsets.
 */
final class Ast
{
    public const LOOP_META_FIELDS = ['index_', 'key_', 'value_', 'last_', 'first_', 'size_'];

    public static function isLoopMetaField(string $name): bool
    {
        return in_array($name, self::LOOP_META_FIELDS, true);
    }

    /** @return array<string, mixed> */
    public static function text(string $value, int $start, int $end): array
    {
        return ['type' => 'Text', 'value' => $value, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $expr
     * @return array<string, mixed>
     */
    public static function echo(array $expr, int $start, int $end): array
    {
        return ['type' => 'Echo', 'expr' => $expr, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $expr
     * @return array<string, mixed>
     */
    public static function set(string $name, array $expr, int $start, int $end): array
    {
        return ['type' => 'Set', 'name' => $name, 'expr' => $expr, 'span' => [$start, $end]];
    }

    /** @return array<string, mixed> */
    public static function include(string $path, int $start, int $end): array
    {
        return ['type' => 'Include', 'path' => $path, 'span' => [$start, $end]];
    }

    /**
     * @param list<array{name: string, expr: array<string, mixed>}> $scope
     * @return array<string, mixed>
     */
    public static function block(?string $id, ?string $path, array $scope, int $start, int $end): array
    {
        return ['type' => 'Block', 'id' => $id, 'path' => $path, 'scope' => $scope, 'span' => [$start, $end]];
    }

    /** @return array<string, mixed> */
    public static function literal(string $kind, mixed $value, int $start, int $end): array
    {
        return ['type' => 'Literal', 'kind' => $kind, 'value' => $value, 'span' => [$start, $end]];
    }

    /** @return array<string, mixed> */
    public static function variable(string $name, int $start, int $end): array
    {
        return ['type' => 'Var', 'name' => $name, 'span' => [$start, $end]];
    }

    /** @return array<string, mixed> */
    public static function loopMeta(string $loop, string $field, int $start, int $end): array
    {
        return ['type' => 'LoopMeta', 'loop' => $loop, 'field' => $field, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $object
     * @return array<string, mixed>
     */
    public static function member(array $object, string $key, int $start, int $end): array
    {
        return ['type' => 'Member', 'object' => $object, 'key' => $key, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $object
     * @param array<string, mixed> $index
     * @return array<string, mixed>
     */
    public static function index(array $object, array $index, int $start, int $end): array
    {
        return ['type' => 'Index', 'object' => $object, 'index' => $index, 'span' => [$start, $end]];
    }

    /**
     * @param list<array<string, mixed>> $args
     * @return array<string, mixed>
     */
    public static function call(string $name, array $args, int $start, int $end): array
    {
        return ['type' => 'Call', 'name' => $name, 'args' => $args, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $operand
     * @return array<string, mixed>
     */
    public static function unary(string $op, array $operand, int $start, int $end): array
    {
        return ['type' => 'Unary', 'op' => $op, 'operand' => $operand, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $left
     * @param array<string, mixed> $right
     * @return array<string, mixed>
     */
    public static function binary(string $op, array $left, array $right, int $start, int $end): array
    {
        return ['type' => 'Binary', 'op' => $op, 'left' => $left, 'right' => $right, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $test
     * @param array<string, mixed>|null $then
     * @param array<string, mixed> $else
     * @return array<string, mixed>
     */
    public static function ternary(array $test, ?array $then, array $else, int $start, int $end): array
    {
        return ['type' => 'Ternary', 'test' => $test, 'then' => $then, 'else' => $else, 'span' => [$start, $end]];
    }

    /**
     * @param array<string, mixed> $expr
     * @return array<string, mixed>
     */
    public static function spread(array $expr, int $start, int $end): array
    {
        return ['type' => 'Spread', 'expr' => $expr, 'span' => [$start, $end]];
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return array<string, mixed>
     */
    public static function listLiteral(array $items, int $start, int $end): array
    {
        return ['type' => 'List', 'items' => $items, 'span' => [$start, $end]];
    }

    /**
     * @param list<array<string, mixed>> $entries
     * @return array<string, mixed>
     */
    public static function mapLiteral(array $entries, int $start, int $end): array
    {
        return ['type' => 'Map', 'entries' => $entries, 'span' => [$start, $end]];
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
