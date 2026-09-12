<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

use Polyspec\Template\Value\SafeString;
use Polyspec\Template\Value\Value;

/**
 * Argument helpers shared by the function groups.
 */
final class Helpers
{
    public static function typeError(string $message): FunctionError
    {
        return new FunctionError('E_RUNTIME_TYPE', $message);
    }

    public static function string(mixed $value, string $name): string
    {
        if (!Value::isString($value)) {
            throw self::typeError("{$name} requires a string, got " . Value::typeOf($value));
        }

        return Value::textOf($value);
    }

    /**
     * @return list<mixed>
     */
    public static function list(mixed $value, string $name): array
    {
        if (!is_array($value)) {
            throw self::typeError("{$name} requires a list, got " . Value::typeOf($value));
        }

        return $value;
    }

    /**
     * EXP-23 to_number.
     */
    public static function toNumber(mixed $value): float
    {
        if ($value === null) {
            return 0.0;
        }
        if (is_bool($value)) {
            return $value ? 1.0 : 0.0;
        }
        if (is_float($value) || is_int($value)) {
            return (float) $value;
        }
        if (Value::isString($value)) {
            $parsed = Value::parseNumericString(Value::textOf($value));
            if ($parsed === null) {
                throw self::typeError(json_encode(Value::textOf($value)) . ' is not a number');
            }

            return $parsed;
        }

        throw self::typeError('a ' . Value::typeOf($value) . ' is not a number');
    }

    public static function number(mixed $value): float
    {
        return self::toNumber($value);
    }

    public static function integer(mixed $value): int
    {
        $number = self::toNumber($value);

        return (int) ($number < 0 ? ceil($number) : floor($number));
    }

    public static function stringify(mixed $value): string
    {
        $text = Value::stringify($value);
        if ($text === null) {
            throw new FunctionError('E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
        }

        return $text;
    }

    public static function safe(string $text): SafeString
    {
        return new SafeString($text);
    }
}
