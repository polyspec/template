<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * Value types, stringification, truthiness, equality and ordering
 * (docs/spec/data-model.md, docs/spec/expressions.md).
 *
 * A value is null, bool, float, string, SafeString, a PHP list or a MapValue.
 */
final class Value
{
    private const NUMBER_GRAMMAR = '/^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/';

    public static function typeOf(mixed $value): string
    {
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return 'bool';
        }
        if (is_float($value) || is_int($value)) {
            return 'number';
        }
        if (is_string($value) || $value instanceof SafeString) {
            return 'string';
        }
        if (is_array($value)) {
            return 'list';
        }
        if (is_object($value) && !$value instanceof MapValue) {
            return 'object';
        }

        return 'map';
    }

    public static function isString(mixed $value): bool
    {
        return is_string($value) || $value instanceof SafeString;
    }

    public static function textOf(string|SafeString $value): string
    {
        return $value instanceof SafeString ? $value->text : $value;
    }

    public static function isNumber(mixed $value): bool
    {
        return is_float($value) || is_int($value);
    }

    /**
     * EXP-33: falsy values.
     */
    public static function isTruthy(mixed $value): bool
    {
        if ($value === null || $value === false) {
            return false;
        }
        if (is_float($value) || is_int($value)) {
            return $value != 0;
        }
        if (is_string($value)) {
            return $value !== '';
        }
        if ($value instanceof SafeString) {
            return $value->text !== '';
        }
        if (is_array($value)) {
            return $value !== [];
        }
        if ($value instanceof MapValue) {
            return $value->count() > 0;
        }

        return true;
    }

    /**
     * VAL-8: conversion to text. Returns null for a list or map.
     */
    public static function stringify(mixed $value): ?string
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_float($value) || is_int($value)) {
            return Number::toText((float) $value);
        }
        if (is_string($value)) {
            return $value;
        }
        if ($value instanceof SafeString) {
            return $value->text;
        }

        return null;
    }

    /**
     * Returns the numeric value of a string under EXP-23, or null.
     */
    public static function parseNumericString(string $text): ?float
    {
        $trimmed = trim($text, " \t\r\n");
        if (preg_match(self::NUMBER_GRAMMAR, $trimmed) !== 1) {
            return null;
        }
        $parsed = (float) $trimmed;

        return is_finite($parsed) ? $parsed : null;
    }

    /**
     * Compares two strings by code point sequence.
     */
    public static function compareCodePoints(string $a, string $b): int
    {
        return strcmp($a, $b) <=> 0;
    }

    /**
     * EXP-34, EXP-35.
     */
    public static function looseEquals(mixed $a, mixed $b): bool
    {
        $ta = self::typeOf($a);
        $tb = self::typeOf($b);
        if ($ta === $tb) {
            return self::sameTypeEquals($a, $b, $ta);
        }
        if ($ta === 'number' && $tb === 'string') {
            $n = self::parseNumericString(self::textOf($b));

            return $n !== null && $n == $a;
        }
        if ($ta === 'string' && $tb === 'number') {
            $n = self::parseNumericString(self::textOf($a));

            return $n !== null && $n == $b;
        }

        return false;
    }

    /**
     * EXP-37.
     */
    public static function strictEquals(mixed $a, mixed $b): bool
    {
        $ta = self::typeOf($a);

        return $ta === self::typeOf($b) && self::sameTypeEquals($a, $b, $ta);
    }

    private static function sameTypeEquals(mixed $a, mixed $b, string $type): bool
    {
        switch ($type) {
            case 'null':
                return true;
            case 'bool':
                return $a === $b;
            case 'number':
                return (float) $a == (float) $b;
            case 'string':
                return self::textOf($a) === self::textOf($b);
            case 'list':
                if (count($a) !== count($b)) {
                    return false;
                }
                foreach ($a as $index => $item) {
                    if (!self::looseEquals($item, $b[$index])) {
                        return false;
                    }
                }

                return true;
            default:
                /** @var MapValue $a */
                /** @var MapValue $b */
                if ($a->count() !== $b->count()) {
                    return false;
                }
                foreach ($a->entries() as $key => $value) {
                    if (!$b->has($key) || !self::looseEquals($value, $b->get($key))) {
                        return false;
                    }
                }

                return true;
        }
    }

    /**
     * EXP-38: returns -1, 0 or 1, or null when the pair has no order.
     */
    public static function compare(mixed $a, mixed $b): ?int
    {
        if (self::isNumber($a) && self::isNumber($b)) {
            return (float) $a <=> (float) $b;
        }
        if (self::isString($a) && self::isString($b)) {
            return self::compareCodePoints(self::textOf($a), self::textOf($b));
        }

        return null;
    }

    public static function isCollection(mixed $value): bool
    {
        return is_array($value) || $value instanceof MapValue;
    }
}
