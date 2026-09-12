<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * Shared test helpers: repository paths and value conversion.
 */
final class Support
{
    public static function repoRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    public static function casesDir(): string
    {
        return self::repoRoot() . '/tests/cases';
    }

    public static function exprFixture(): string
    {
        return self::repoRoot() . '/tests/fixtures/expr/cases.json';
    }

    /**
     * Converts a template value into plain PHP data for comparison with JSON fixtures.
     */
    public static function plain(mixed $value): mixed
    {
        if ($value instanceof SafeString) {
            return $value->text;
        }
        if ($value instanceof MapValue) {
            $result = [];
            foreach ($value->entries() as $key => $item) {
                $result[$key] = self::plain($item);
            }

            return $result === [] ? new \stdClass() : $result;
        }
        if (is_array($value)) {
            return array_map([self::class, 'plain'], $value);
        }
        if (is_float($value)) {
            return $value == 0.0 ? 0.0 : $value;
        }

        return $value;
    }

    /**
     * Normalizes decoded JSON for comparison: objects become associative arrays, numbers become floats.
     */
    public static function normalize(mixed $value): mixed
    {
        if ($value instanceof \stdClass) {
            $value = (array) $value;
        }
        if (is_array($value)) {
            $result = [];
            foreach ($value as $key => $item) {
                $result[$key] = self::normalize($item);
            }

            return $result;
        }
        if (is_int($value)) {
            return (float) $value;
        }

        return $value;
    }
}
