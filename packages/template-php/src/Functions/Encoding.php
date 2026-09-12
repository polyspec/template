<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

use Polyspec\Template\Escape;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Number;
use Polyspec\Template\Value\SafeString;
use Polyspec\Template\Value\Value;

/**
 * escape, raw, json, url, nl2br, str, type (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to FUN-30).
 */
final class Encoding
{
    /**
     * FUN-26 to FUN-28.
     */
    public static function toJson(mixed $value): string
    {
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_float($value) || is_int($value)) {
            return Number::toText((float) $value);
        }
        if (is_string($value)) {
            return self::jsonString($value);
        }
        if ($value instanceof SafeString) {
            return self::jsonString($value->text);
        }
        if (is_array($value)) {
            return '[' . implode(',', array_map([self::class, 'toJson'], $value)) . ']';
        }
        /** @var MapValue $value */
        $parts = [];
        foreach ($value->entries() as $key => $entry) {
            $parts[] = self::jsonString($key) . ':' . self::toJson($entry);
        }

        return '{' . implode(',', $parts) . '}';
    }

    private static function jsonString(string $text): string
    {
        $result = '"';
        $length = strlen($text);
        for ($i = 0; $i < $length; $i++) {
            $char = $text[$i];
            $code = ord($char);
            switch ($char) {
                case '"':
                    $result .= '\\"';
                    break;
                case '\\':
                    $result .= '\\\\';
                    break;
                case "\n":
                    $result .= '\\n';
                    break;
                case "\r":
                    $result .= '\\r';
                    break;
                case "\t":
                    $result .= '\\t';
                    break;
                case "\x08":
                    $result .= '\\b';
                    break;
                case "\x0C":
                    $result .= '\\f';
                    break;
                case '<':
                    $result .= '\\u003c';
                    break;
                case '>':
                    $result .= '\\u003e';
                    break;
                case '&':
                    $result .= '\\u0026';
                    break;
                default:
                    if ($code < 0x20) {
                        $result .= sprintf('\\u%04x', $code);
                    } elseif ($code === 0xE2 && substr($text, $i, 3) === "\xE2\x80\xA8") {
                        $result .= '\\u2028';
                        $i += 2;
                    } elseif ($code === 0xE2 && substr($text, $i, 3) === "\xE2\x80\xA9") {
                        $result .= '\\u2029';
                        $i += 2;
                    } else {
                        $result .= $char;
                    }
            }
        }

        return $result . '"';
    }

    /**
     * FUN-29.
     */
    public static function percentEncode(string $text): string
    {
        return rawurlencode($text);
    }

    /**
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array
    {
        return [
            'escape' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => Helpers::safe(Escape::html(Helpers::stringify($a[0])))],
            'raw' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => Helpers::safe(Helpers::stringify($a[0]))],
            'json' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => self::toJson($a[0])],
            'url' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => self::percentEncode(Helpers::stringify($a[0]))],
            'nl2br' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => preg_replace('/\r\n|\n/', "<br>\n", Helpers::string($a[0], 'nl2br'))],
            'str' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => Helpers::stringify($a[0])],
            'type' => ['min' => 1, 'max' => 1, 'call' => static fn (array $a) => Value::typeOf($a[0])],
        ];
    }
}
