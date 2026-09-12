<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

use Polyspec\Template\Value\Number;
use Polyspec\Template\Value\Value;

/**
 * number, round, floor, ceil, abs, min, max, num (FUN-16, FUN-17, FUN-20 to FUN-25).
 */
final class Numbers
{
    private static function finite(float $value): float
    {
        if (!is_finite($value)) {
            throw Helpers::typeError('arithmetic result is not finite');
        }

        return $value;
    }

    private static function requireNumber(mixed $value, string $name): float
    {
        if (!Value::isNumber($value)) {
            throw Helpers::typeError("{$name} accepts only numbers");
        }

        return (float) $value;
    }

    /**
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array
    {
        return [
            'number' => ['min' => 1, 'max' => 4, 'call' => static function (array $a): string {
                $places = array_key_exists(1, $a) ? Helpers::integer($a[1]) : 0;
                if ($places < 0) {
                    throw Helpers::typeError('number requires a non-negative decimal count');
                }

                return Number::format(
                    Helpers::number($a[0]),
                    $places,
                    array_key_exists(2, $a) ? Helpers::string($a[2], 'number') : '.',
                    array_key_exists(3, $a) ? Helpers::string($a[3], 'number') : ',',
                );
            }],
            'round' => ['min' => 1, 'max' => 2, 'call' => static function (array $a): float {
                $places = array_key_exists(1, $a) ? Helpers::integer($a[1]) : 0;
                if ($places < 0) {
                    throw Helpers::typeError('round requires a non-negative decimal count');
                }

                return Number::round(Helpers::number($a[0]), $places);
            }],
            'floor' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => self::finite(floor(Helpers::number($a[0])))],
            'ceil' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => self::finite(ceil(Helpers::number($a[0])))],
            'abs' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => abs(Helpers::number($a[0]))],
            'min' => ['min' => 1, 'max' => PHP_INT_MAX, 'call' => static fn (array $a) => min(array_map(static fn ($v) => self::requireNumber($v, 'min'), $a))],
            'max' => ['min' => 1, 'max' => PHP_INT_MAX, 'call' => static fn (array $a) => max(array_map(static fn ($v) => self::requireNumber($v, 'max'), $a))],
            'num' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => Helpers::number($a[0])],
        ];
    }
}
