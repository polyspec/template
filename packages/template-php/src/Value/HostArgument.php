<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * The host form of a template value that a template passes to host code (VAL-18, VAL-21).
 */
final class HostArgument
{
    /**
     * A number becomes a float, a safe string its text, a list a list array and a map an array with
     * its entries in entry order, at every depth; a native object stays the original object. A
     * generated program writes an integral number literal as a PHP integer, so the conversion also
     * applies to integers. PHP arrays are values, so a change that host code makes to an argument
     * changes no template value.
     */
    public static function of(mixed $value): mixed
    {
        if (is_int($value)) {
            return (float) $value;
        }
        if ($value instanceof SafeString) {
            return $value->text;
        }
        if ($value instanceof MapValue) {
            $entries = [];
            foreach ($value->entries() as $key => $item) {
                $entries[$key] = self::of($item);
            }

            return $entries;
        }
        if (is_array($value)) {
            return array_map(self::of(...), $value);
        }

        return $value;
    }

    /**
     * @param list<mixed> $args
     * @return list<mixed>
     */
    public static function list(array $args): array
    {
        return array_map(self::of(...), $args);
    }
}
