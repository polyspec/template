<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

use Polyspec\Template\Utf8;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Value;

/**
 * upper, lower, trim, replace, split, truncate, contains, starts_with, ends_with, length (FUN-12, FUN-13).
 */
final class Strings
{
    private static function trimChars(string $text, string $chars): string
    {
        $set = array_flip(Utf8::codePoints($chars));
        $points = Utf8::codePoints($text);
        $start = 0;
        $end = count($points);
        while ($start < $end && isset($set[$points[$start]])) {
            $start++;
        }
        while ($end > $start && isset($set[$points[$end - 1]])) {
            $end--;
        }

        return implode('', array_slice($points, $start, $end - $start));
    }

    /**
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array
    {
        return [
            'upper' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => strtoupper(Helpers::string($a[0], 'upper'))],
            'lower' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => strtolower(Helpers::string($a[0], 'lower'))],
            'trim' => ['min' => 1, 'max' => 2, 'call' => static fn (array $a) => self::trimChars(
                Helpers::string($a[0], 'trim'),
                array_key_exists(1, $a) ? Helpers::string($a[1], 'trim') : " \t\r\n",
            )],
            'replace' => ['min' => 3, 'max' => 3, 'call' => static function (array $a): string {
                $text = Helpers::string($a[0], 'replace');
                $search = Helpers::string($a[1], 'replace');
                $replacement = Helpers::string($a[2], 'replace');

                return $search === '' ? $text : str_replace($search, $replacement, $text);
            }],
            'split' => ['min' => 2, 'max' => 2, 'call' => static function (array $a): array {
                $text = Helpers::string($a[0], 'split');
                $separator = Helpers::string($a[1], 'split');
                if ($separator === '') {
                    throw Helpers::typeError('split requires a non-empty separator');
                }

                return explode($separator, $text);
            }],
            'truncate' => ['min' => 2, 'max' => 3, 'call' => static function (array $a): string {
                $text = Helpers::string($a[0], 'truncate');
                $limit = Helpers::integer($a[1]);
                $suffix = array_key_exists(2, $a) ? Helpers::string($a[2], 'truncate') : '...';
                $points = Utf8::codePoints($text);

                return count($points) > $limit ? implode('', array_slice($points, 0, max(0, $limit))) . $suffix : $text;
            }],
            'contains' => ['min' => 2, 'max' => 2, 'call' => static function (array $a): bool {
                $haystack = $a[0];
                $needle = $a[1];
                if (Value::isString($haystack)) {
                    if (!Value::isString($needle)) {
                        throw Helpers::typeError('contains requires a string needle for a string haystack');
                    }

                    return str_contains(Value::textOf($haystack), Value::textOf($needle));
                }
                if (is_array($haystack)) {
                    foreach ($haystack as $item) {
                        if (Value::looseEquals($item, $needle)) {
                            return true;
                        }
                    }

                    return false;
                }

                throw Helpers::typeError('contains requires a string or a list');
            }],
            'starts_with' => ['min' => 2, 'max' => 2, 'call' => static fn (array $a) => str_starts_with(Helpers::string($a[0], 'starts_with'), Helpers::string($a[1], 'starts_with'))],
            'ends_with' => ['min' => 2, 'max' => 2, 'call' => static fn (array $a) => str_ends_with(Helpers::string($a[0], 'ends_with'), Helpers::string($a[1], 'ends_with'))],
            'length' => ['min' => 1, 'max' => 1, 'call' => static function (array $a): float {
                $value = $a[0];
                if ($value === null) {
                    return 0.0;
                }
                if (Value::isString($value)) {
                    return (float) Utf8::length(Value::textOf($value));
                }
                if (is_array($value)) {
                    return (float) count($value);
                }
                if ($value instanceof MapValue) {
                    return (float) $value->count();
                }

                throw Helpers::typeError('length requires a string, list, map or null');
            }],
        ];
    }
}
