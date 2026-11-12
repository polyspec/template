<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

/**
 * The order class of the shared fixture; `describe` receives every argument in the form of VAL-21.
 */
final class HostValueOrder
{
    public function describe(mixed ...$args): string
    {
        return self::describeArguments($args, $this);
    }

    /**
     * @param list<mixed> $args
     */
    public static function describeArguments(array $args, object $order): string
    {
        return implode(',', array_map(static fn (mixed $item): string => self::describeValue($item, $order), $args));
    }

    private static function describeValue(mixed $value, object $order): string
    {
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return 'bool(' . ($value ? 'true' : 'false') . ')';
        }
        if (is_float($value)) {
            return 'number(' . $value . ')';
        }
        if (is_string($value)) {
            return "string({$value})";
        }
        if (is_array($value) && array_is_list($value)) {
            return 'list(' . self::describeArguments($value, $order) . ')';
        }
        if (is_array($value)) {
            $parts = [];
            foreach ($value as $key => $item) {
                $parts[] = $key . '=' . self::describeValue($item, $order);
            }

            return 'map(' . implode(',', $parts) . ')';
        }
        if ($value === $order) {
            return 'object(order)';
        }

        return 'unexpected(' . get_debug_type($value) . ')';
    }
}
