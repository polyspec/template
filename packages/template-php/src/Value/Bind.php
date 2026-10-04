<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

use Polyspec\Template\BoundMap;
use Polyspec\Template\Utf8;

/**
 * Host binding of PHP values (VAL-2, VAL-14, VAL-17, VAL-20).
 */
final class Bind
{
    /** The nesting depth limit of lists and maps (VAL-20). */
    public const MAX_DEPTH = 64;

    public static function value(mixed $input): mixed
    {
        return self::at($input, 0);
    }

    /**
     * VAL-2, VAL-3: a float is accepted when it is finite and its magnitude is at most 2^53 - 1.
     */
    public static function checkFloat(float $value): float
    {
        if (!is_finite($value)) {
            throw new BindError('E_DATA_NUMBER_NOT_FINITE', 'number is not finite');
        }
        if (abs($value) > Number::MAX_SAFE) {
            throw new BindError('E_DATA_NUMBER_RANGE', "number {$value} is outside the safe range");
        }

        return $value;
    }

    /**
     * VAL-20: fails when a list or map would be entered at a level greater than the limit; the level
     * counts the enclosing lists and maps, including the one being entered.
     */
    public static function checkLevel(int $level): void
    {
        if ($level > self::MAX_DEPTH) {
            throw new BindError('E_DATA_DEPTH', 'lists and maps nest deeper than ' . self::MAX_DEPTH . ' levels');
        }
    }

    /**
     * VAL-20: whether the depth of a template value is at most `$limit`; the walk stops below the limit.
     */
    public static function depthWithin(mixed $value, int $limit): bool
    {
        if (is_array($value) || $value instanceof MapValue) {
            if ($limit === 0) {
                return false;
            }
            foreach (is_array($value) ? $value : $value->values() as $item) {
                if (!self::depthWithin($item, $limit - 1)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * The public properties of an object: the entries of get_mangled_object_vars() whose names are
     * not mangled. The function ignores the class scope of the caller (VAL-14, VAL-19).
     *
     * @return array<int|string, mixed>
     */
    public static function publicProperties(object $object): array
    {
        $public = [];
        foreach (get_mangled_object_vars($object) as $name => $value) {
            if (!is_string($name) || !str_starts_with($name, "\0")) {
                $public[$name] = $value;
            }
        }

        return $public;
    }

    private static function at(mixed $input, int $level): mixed
    {
        if ($input === null) {
            return null;
        }
        if (is_bool($input)) {
            return $input;
        }
        if (is_int($input)) {
            if (abs($input) > Number::MAX_SAFE) {
                throw new BindError('E_DATA_NUMBER_RANGE', "integer {$input} is outside the safe range");
            }

            return (float) $input;
        }
        if (is_float($input)) {
            return self::checkFloat($input);
        }
        if (is_string($input)) {
            return self::text($input);
        }
        if ($input instanceof SafeString) {
            return self::text($input->text);
        }
        if ($input instanceof MapValue) {
            self::checkLevel($level + 1);
            $map = new MapValue();
            foreach ($input->entries() as $key => $value) {
                $map->set(self::key($key), self::at($value, $level + 1));
            }

            return $map;
        }
        if (is_array($input)) {
            self::checkLevel($level + 1);
            if (array_is_list($input)) {
                return array_map(static fn ($item) => self::at($item, $level + 1), $input);
            }

            return self::mapOf($input, $level + 1);
        }
        if ($input instanceof \JsonSerializable) {
            self::checkLevel($level + 1);
            try {
                $serialized = $input->jsonSerialize();
            } catch (\Throwable $error) {
                throw new BindError('E_RUNTIME_HOST_FUNCTION', 'jsonSerialize() failed: ' . $error->getMessage());
            }

            return self::at($serialized, $level + 1);
        }
        if ($input instanceof \stdClass) {
            self::checkLevel($level + 1);

            return self::mapOf(self::publicProperties($input), $level + 1);
        }
        if ($input instanceof \Closure) {
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'a closure has no binding');
        }
        // A bound map is accepted only as assign and as definition data, and a bound map of the PHP
        // extension, another implementation, at no position (VAL-22).
        if ($input instanceof BoundMap || $input instanceof \Polyspec\Template\Native\BoundMap) {
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'a bound map is accepted only as assign and as definition data');
        }
        if (is_object($input)) {
            // Preserve objects so public fields and methods remain available to templates.
            return $input;
        }

        throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'a value of type ' . get_debug_type($input) . ' has no binding');
    }

    /**
     * @param array<int|string, mixed> $entries
     */
    private static function mapOf(array $entries, int $level): MapValue
    {
        $map = new MapValue();
        foreach ($entries as $key => $value) {
            $map->set(self::key((string) $key), self::at($value, $level));
        }

        return $map;
    }

    private static function text(string $text): string
    {
        if (!Utf8::isValid($text)) {
            throw new BindError('E_DATA_INVALID_UTF8', 'string is not valid UTF-8');
        }

        return $text;
    }

    private static function key(string $key): string
    {
        if (!Utf8::isValid($key)) {
            throw new BindError('E_DATA_INVALID_UTF8', 'a map key is not valid UTF-8');
        }

        return $key;
    }

    /**
     * Binds assign data (RT-4): null and the empty array are the empty map, a bound map gives its
     * entries without binding them again (VAL-22), and every other value must bind to a map.
     */
    public static function map(mixed $input): MapValue
    {
        if ($input === null) {
            return new MapValue();
        }
        if ($input instanceof BoundMap) {
            return self::boundEntries($input);
        }
        $value = self::value($input);
        if (!$value instanceof MapValue) {
            if ($value === []) {
                return new MapValue();
            }

            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'assign is not a map');
        }

        return $value;
    }

    /**
     * Binds the data of a template definition (RT-24): a bound map gives its entries without binding
     * them again (VAL-22); every other value is bound like any host value, and the empty array is the
     * empty map.
     */
    public static function data(mixed $input): mixed
    {
        if ($input instanceof BoundMap) {
            return self::boundEntries($input);
        }
        $value = self::value($input);

        return $value === [] ? new MapValue() : $value;
    }

    /**
     * The entries of a bound map. They are private to the class, so the binding of the runtime reads
     * them in the scope of the class; host code has no operation that reads them (VAL-22).
     */
    private static function boundEntries(BoundMap $bound): MapValue
    {
        static $read = null;
        $read ??= \Closure::bind(static fn (BoundMap $bound): MapValue => $bound->entries, null, BoundMap::class);

        return $read($bound);
    }
}
