<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

use Polyspec\Template\Value\Value;

/**
 * date and now (FUN-37 to FUN-42).
 */
final class Dates
{
    private const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    private const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    private const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    private const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    private const DATE_TEXT = '/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/';

    /**
     * Offset in seconds of `Z` or `±HH:MM`, or null.
     */
    public static function parseOffset(string $text): ?int
    {
        if ($text === 'Z') {
            return 0;
        }
        if (preg_match('/^([+-])(\d{2}):(\d{2})$/', $text, $m) !== 1) {
            return null;
        }
        $hours = (int) $m[2];
        $minutes = (int) $m[3];
        if ($hours > 23 || $minutes > 59) {
            return null;
        }

        return ($m[1] === '-' ? -1 : 1) * ($hours * 3600 + $minutes * 60);
    }

    private static function floorDiv(int $a, int $b): int
    {
        return (int) floor($a / $b);
    }

    /**
     * Days since 1970-01-01 of a proleptic Gregorian date.
     */
    public static function daysFromCivil(int $year, int $month, int $day): int
    {
        $y = $month <= 2 ? $year - 1 : $year;
        $era = self::floorDiv($y, 400);
        $yoe = $y - $era * 400;
        $mp = ($month + 9) % 12;
        $doy = intdiv(153 * $mp + 2, 5) + $day - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;

        return $era * 146097 + $doe - 719468;
    }

    /**
     * @return array{0: int, 1: int, 2: int} year, month, day
     */
    public static function civilFromDays(int $days): array
    {
        $z = $days + 719468;
        $era = self::floorDiv($z, 146097);
        $doe = $z - $era * 146097;
        $yoe = intdiv($doe - intdiv($doe, 1460) + intdiv($doe, 36524) - intdiv($doe, 146096), 365);
        $y = $yoe + $era * 400;
        $doy = $doe - (365 * $yoe + intdiv($yoe, 4) - intdiv($yoe, 100));
        $mp = intdiv(5 * $doy + 2, 153);
        $day = $doy - intdiv(153 * $mp + 2, 5) + 1;
        $month = $mp < 10 ? $mp + 3 : $mp - 9;

        return [$month <= 2 ? $y + 1 : $y, $month, $day];
    }

    /**
     * Unix seconds of a date value (FUN-37).
     */
    public static function toUnixSeconds(mixed $value, int $envOffset): int
    {
        if (Value::isNumber($value)) {
            $number = (float) $value;

            return (int) ($number < 0 ? ceil($number) : floor($number));
        }
        if (Value::isString($value)) {
            $text = Value::textOf($value);
            if (preg_match(self::DATE_TEXT, $text, $m) !== 1) {
                throw Helpers::typeError(json_encode($text) . ' is not a date');
            }
            $year = (int) $m[1];
            $month = (int) $m[2];
            $day = (int) $m[3];
            $hour = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 0;
            $minute = isset($m[5]) && $m[5] !== '' ? (int) $m[5] : 0;
            $second = isset($m[6]) && $m[6] !== '' ? (int) $m[6] : 0;
            if ($month < 1 || $month > 12 || $day < 1 || $day > 31 || $hour > 23 || $minute > 59 || $second > 59) {
                throw Helpers::typeError(json_encode($text) . ' is not a date');
            }
            $offset = isset($m[7]) && $m[7] !== '' ? (int) self::parseOffset($m[7]) : $envOffset;

            return self::daysFromCivil($year, $month, $day) * 86400 + $hour * 3600 + $minute * 60 + $second - $offset;
        }

        throw Helpers::typeError('date requires a number or a string');
    }

    public static function format(int $seconds, string $format, int $offset): string
    {
        $local = $seconds + $offset;
        $days = self::floorDiv($local, 86400);
        $secondOfDay = $local - $days * 86400;
        [$year, $month, $day] = self::civilFromDays($days);
        $hour = intdiv($secondOfDay, 3600);
        $minute = intdiv($secondOfDay % 3600, 60);
        $second = $secondOfDay % 60;
        $weekday = (($days % 7) + 11) % 7;
        $sign = $offset < 0 ? '-' : '+';
        $absOffset = abs($offset);
        $result = '';
        $length = strlen($format);
        for ($i = 0; $i < $length; $i++) {
            $char = $format[$i];
            switch ($char) {
                case '\\':
                    $result .= $format[$i + 1] ?? '';
                    $i++;
                    break;
                case 'Y':
                    $result .= sprintf('%04d', $year);
                    break;
                case 'y':
                    $result .= sprintf('%02d', $year % 100);
                    break;
                case 'm':
                    $result .= sprintf('%02d', $month);
                    break;
                case 'n':
                    $result .= (string) $month;
                    break;
                case 'd':
                    $result .= sprintf('%02d', $day);
                    break;
                case 'j':
                    $result .= (string) $day;
                    break;
                case 'H':
                    $result .= sprintf('%02d', $hour);
                    break;
                case 'G':
                    $result .= (string) $hour;
                    break;
                case 'i':
                    $result .= sprintf('%02d', $minute);
                    break;
                case 's':
                    $result .= sprintf('%02d', $second);
                    break;
                case 'D':
                    $result .= self::DAY_SHORT[$weekday];
                    break;
                case 'l':
                    $result .= self::DAY_LONG[$weekday];
                    break;
                case 'N':
                    $result .= (string) ($weekday === 0 ? 7 : $weekday);
                    break;
                case 'w':
                    $result .= (string) $weekday;
                    break;
                case 'M':
                    $result .= self::MONTH_SHORT[$month - 1];
                    break;
                case 'F':
                    $result .= self::MONTH_LONG[$month - 1];
                    break;
                case 'U':
                    $result .= (string) $seconds;
                    break;
                case 'P':
                    $result .= sprintf('%s%02d:%02d', $sign, intdiv($absOffset, 3600), intdiv($absOffset % 3600, 60));
                    break;
                default:
                    $result .= $char;
            }
        }

        return $result;
    }

    /**
     * @param array{timezone: string, now: float} $env
     */
    private static function envOffset(array $env): int
    {
        $offset = self::parseOffset($env['timezone']);
        if ($offset === null) {
            throw Helpers::typeError(json_encode($env['timezone']) . ' is not a time zone offset');
        }

        return $offset;
    }

    /**
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array
    {
        return [
            'date' => ['min' => 2, 'max' => 2, 'call' => static function (array $a, array $env): string {
                if ($a[0] === null) {
                    return '';
                }
                $offset = self::envOffset($env);

                return self::format(self::toUnixSeconds($a[0], $offset), Helpers::string($a[1], 'date'), $offset);
            }],
            'now' => ['min' => 0, 'max' => 0, 'call' => static fn (array $a, array $env): float => (float) $env['now']],
        ];
    }
}
