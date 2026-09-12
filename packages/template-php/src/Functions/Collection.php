<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

use Polyspec\Template\Utf8;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Value;

/**
 * keys, values, first, last, reverse, slice, sort, join, range, default (FUN-14, FUN-15, FUN-31 to FUN-36).
 */
final class Collection
{
    public const RANGE_LIMIT = 1000000;

    private static function lookupPath(mixed $value, string $path): mixed
    {
        $current = $value;
        foreach (explode('.', $path) as $segment) {
            if ($current instanceof MapValue) {
                $current = $current->get($segment);
            } elseif (is_array($current) && preg_match('/^(0|[1-9][0-9]*)$/', $segment) === 1) {
                $current = $current[(int) $segment] ?? null;
            } else {
                return null;
            }
        }

        return $current;
    }

    /**
     * @param list<mixed> $list
     * @return list<mixed>
     */
    private static function sortList(array $list, ?string $key): array
    {
        $keyed = [];
        foreach ($list as $index => $item) {
            $keyed[] = ['item' => $item, 'key' => $key === null ? $item : self::lookupPath($item, $key), 'index' => $index];
        }
        $allNumbers = true;
        $allStrings = true;
        foreach ($keyed as $entry) {
            if (!Value::isNumber($entry['key'])) {
                $allNumbers = false;
            }
            if (!Value::isString($entry['key'])) {
                $allStrings = false;
            }
        }
        if (!$allNumbers && !$allStrings) {
            throw Helpers::typeError('sort requires all numbers or all strings');
        }
        usort($keyed, static function (array $a, array $b): int {
            $order = Value::compare($a['key'], $b['key']) ?? 0;

            return $order !== 0 ? $order : $a['index'] <=> $b['index'];
        });

        return array_column($keyed, 'item');
    }

    /**
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array
    {
        return [
            'keys' => ['min' => 1, 'max' => 1, 'call' => static function (array $a): array {
                $value = $a[0];
                if ($value instanceof MapValue) {
                    return $value->keys();
                }
                if (is_array($value)) {
                    return array_map(static fn (int $i): float => (float) $i, array_keys($value));
                }

                throw Helpers::typeError('keys requires a map or a list');
            }],
            'values' => ['min' => 1, 'max' => 1, 'call' => static function (array $a): array {
                $value = $a[0];
                if ($value instanceof MapValue) {
                    return $value->values();
                }
                if (is_array($value)) {
                    return $value;
                }

                throw Helpers::typeError('values requires a map or a list');
            }],
            'first' => ['min' => 1, 'max' => 1, 'call' => static function (array $a): mixed {
                $value = $a[0];
                if (is_array($value)) {
                    return $value === [] ? null : $value[0];
                }
                if (Value::isString($value)) {
                    $points = Utf8::codePoints(Value::textOf($value));

                    return $points === [] ? null : $points[0];
                }

                throw Helpers::typeError('first requires a list or a string');
            }],
            'last' => ['min' => 1, 'max' => 1, 'call' => static function (array $a): mixed {
                $value = $a[0];
                if (is_array($value)) {
                    return $value === [] ? null : $value[count($value) - 1];
                }
                if (Value::isString($value)) {
                    $points = Utf8::codePoints(Value::textOf($value));

                    return $points === [] ? null : $points[count($points) - 1];
                }

                throw Helpers::typeError('last requires a list or a string');
            }],
            'reverse' => ['min' => 1, 'max' => 1, 'call' => static function (array $a): mixed {
                $value = $a[0];
                if (is_array($value)) {
                    return array_reverse($value);
                }
                if (Value::isString($value)) {
                    return implode('', array_reverse(Utf8::codePoints(Value::textOf($value))));
                }

                throw Helpers::typeError('reverse requires a list or a string');
            }],
            'slice' => ['min' => 2, 'max' => 3, 'call' => static function (array $a): mixed {
                $value = $a[0];
                $isList = is_array($value);
                if ($isList) {
                    $items = $value;
                } elseif (Value::isString($value)) {
                    $items = Utf8::codePoints(Value::textOf($value));
                } else {
                    throw Helpers::typeError('slice requires a list or a string');
                }
                $from = Helpers::integer($a[1]);
                if ($from < 0) {
                    $from = max(0, $from + count($items));
                }
                if ($from >= count($items)) {
                    return $isList ? [] : '';
                }
                $count = array_key_exists(2, $a) ? Helpers::integer($a[2]) : count($items) - $from;
                if ($count < 0) {
                    $count = 0;
                }
                $part = array_slice($items, $from, $count);

                return $isList ? $part : implode('', $part);
            }],
            'sort' => ['min' => 1, 'max' => 2, 'call' => static fn (array $a) => self::sortList(
                Helpers::list($a[0], 'sort'),
                array_key_exists(1, $a) ? Helpers::string($a[1], 'sort') : null,
            )],
            'join' => ['min' => 1, 'max' => 2, 'call' => static fn (array $a) => implode(
                array_key_exists(1, $a) ? Helpers::string($a[1], 'join') : ',',
                array_map([Helpers::class, 'stringify'], Helpers::list($a[0], 'join')),
            )],
            'range' => ['min' => 2, 'max' => 3, 'call' => static function (array $a): array {
                $start = Helpers::number($a[0]);
                $end = Helpers::number($a[1]);
                $increment = array_key_exists(2, $a) ? Helpers::number($a[2]) : 1.0;
                if ($increment == 0.0) {
                    throw Helpers::typeError('range requires a non-zero step');
                }
                $count = (int) floor(($end - $start) / $increment) + 1;
                if ($count > self::RANGE_LIMIT) {
                    throw new FunctionError('E_RUNTIME_LIMIT', 'range would produce more than ' . self::RANGE_LIMIT . ' elements');
                }
                $result = [];
                for ($i = 0; $i < $count; $i++) {
                    $result[] = $start + $i * $increment;
                }

                return $result;
            }],
            'default' => ['min' => 2, 'max' => 2, 'call' => static fn (array $a) => Value::isTruthy($a[0]) ? $a[0] : $a[1]],
        ];
    }
}
