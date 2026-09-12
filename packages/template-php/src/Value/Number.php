<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * Number conversion and formatting (VAL-9, VAL-10, FUN-20 to FUN-25).
 */
final class Number
{
    public const MAX_SAFE = 9007199254740991;

    /**
     * VAL-9: ECMAScript Number::toString.
     */
    public static function toText(float $value): string
    {
        if ($value == 0.0) {
            return '0';
        }
        [$negative, $digits, $exponent] = self::shortestDigits($value);
        $k = strlen($digits);
        $n = $exponent;
        if ($k <= $n && $n <= 21) {
            $text = $digits . str_repeat('0', $n - $k);
        } elseif (0 < $n && $n <= 21) {
            $text = substr($digits, 0, $n) . '.' . substr($digits, $n);
        } elseif (-6 < $n && $n <= 0) {
            $text = '0.' . str_repeat('0', -$n) . $digits;
        } else {
            $e = $n - 1;
            $sign = $e < 0 ? '-' : '+';
            $mantissa = $k === 1 ? $digits : $digits[0] . '.' . substr($digits, 1);
            $text = $mantissa . 'e' . $sign . abs($e);
        }

        return $negative ? '-' . $text : $text;
    }

    /**
     * Shortest round-trip digits and the exponent n such that value = 0.digits × 10^n.
     *
     * @return array{0: bool, 1: string, 2: int}
     */
    public static function shortestDigits(float $value): array
    {
        $negative = $value < 0;
        $abs = abs($value);
        // serialize_precision -1 gives the shortest round-trip representation.
        $text = (string) json_encode($abs, JSON_PRESERVE_ZERO_FRACTION);
        if (!preg_match('/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/', $text, $m)) {
            throw new \RuntimeException("cannot decompose {$text}");
        }
        $integer = $m[1];
        $fraction = $m[2] ?? '';
        $exp = isset($m[3]) ? (int) $m[3] : 0;
        $digits = ltrim($integer . $fraction, '0');
        $leadingZeros = strlen($integer . $fraction) - strlen($digits);
        $digits = rtrim($digits, '0');
        if ($digits === '') {
            $digits = '0';
        }
        $exponent = strlen($integer) + $exp - $leadingZeros;

        return [$negative, $digits, $exponent];
    }

    /**
     * Positional decimal expansion without exponent.
     *
     * @return array{0: bool, 1: string, 2: string} negative, integer digits, fraction digits
     */
    public static function positional(float $value): array
    {
        if ($value == 0.0) {
            return [false, '0', ''];
        }
        [$negative, $digits, $exponent] = self::shortestDigits($value);
        $length = strlen($digits);
        if ($exponent <= 0) {
            $integer = '0';
            $fraction = str_repeat('0', -$exponent) . $digits;
        } elseif ($exponent >= $length) {
            $integer = $digits . str_repeat('0', $exponent - $length);
            $fraction = '';
        } else {
            $integer = substr($digits, 0, $exponent);
            $fraction = substr($digits, $exponent);
        }

        return [$negative, $integer, $fraction];
    }

    /**
     * FUN-22: rounds the positional digits half away from zero.
     *
     * @return array{0: bool, 1: string, 2: string}
     */
    public static function roundDecimal(float $value, int $decimals): array
    {
        [$negative, $integer, $fraction] = self::positional($value);
        if (strlen($fraction) <= $decimals) {
            return [$negative, $integer, $fraction . str_repeat('0', $decimals - strlen($fraction))];
        }
        $roundUp = ord($fraction[$decimals]) >= 0x35;
        $kept = $integer . substr($fraction, 0, $decimals);
        if ($roundUp) {
            $kept = self::increment($kept);
        }
        $splitAt = strlen($kept) - $decimals;
        $integerPart = substr($kept, 0, $splitAt);

        return [$negative, $integerPart === '' ? '0' : $integerPart, substr($kept, $splitAt)];
    }

    private static function increment(string $digits): string
    {
        $index = strlen($digits) - 1;
        while ($index >= 0) {
            if ($digits[$index] === '9') {
                $digits[$index] = '0';
                $index--;
            } else {
                $digits[$index] = chr(ord($digits[$index]) + 1);

                return $digits;
            }
        }

        return '1' . $digits;
    }

    /**
     * FUN-20 to FUN-24.
     */
    public static function format(float $value, int $decimals, string $dec, string $thousands): string
    {
        [$negative, $integer, $fraction] = self::roundDecimal($value, $decimals);
        $groups = [];
        while (strlen($integer) > 3) {
            array_unshift($groups, substr($integer, -3));
            $integer = substr($integer, 0, -3);
        }
        array_unshift($groups, $integer);
        $text = implode($thousands, $groups);
        if ($decimals > 0) {
            $text .= $dec . $fraction;
        }
        $allZero = preg_match('/^0*$/', implode('', $groups) . $fraction) === 1;

        return $negative && !$allZero ? '-' . $text : $text;
    }

    /**
     * FUN-25: the rounded value as a number.
     */
    public static function round(float $value, int $decimals): float
    {
        [$negative, $integer, $fraction] = self::roundDecimal($value, $decimals);
        $result = (float) ($integer . ($fraction !== '' ? '.' . $fraction : ''));

        return $negative && $result != 0.0 ? -$result : $result;
    }

    public static function isInteger(float $value): bool
    {
        return is_finite($value) && floor($value) == $value;
    }
}
