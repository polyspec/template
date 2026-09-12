<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * UTF-8 helpers shared by the source reader, the data binder and the functions.
 */
final class Utf8
{
    /**
     * Returns the index of the first invalid byte, or -1 when the bytes are valid UTF-8.
     */
    public static function firstInvalid(string $bytes): int
    {
        $n = strlen($bytes);
        $i = 0;
        while ($i < $n) {
            $b0 = ord($bytes[$i]);
            if ($b0 < 0x80) {
                $i++;
                continue;
            }
            if ($b0 >= 0xC2 && $b0 <= 0xDF) {
                $need = 1;
                $min = 0x80;
                $code = $b0 & 0x1F;
            } elseif ($b0 >= 0xE0 && $b0 <= 0xEF) {
                $need = 2;
                $min = 0x800;
                $code = $b0 & 0x0F;
            } elseif ($b0 >= 0xF0 && $b0 <= 0xF4) {
                $need = 3;
                $min = 0x10000;
                $code = $b0 & 0x07;
            } else {
                return $i;
            }
            for ($k = 1; $k <= $need; $k++) {
                if ($i + $k >= $n) {
                    return $i;
                }
                $b = ord($bytes[$i + $k]);
                if (($b & 0xC0) !== 0x80) {
                    return $i;
                }
                $code = ($code << 6) | ($b & 0x3F);
            }
            if ($code < $min || $code > 0x10FFFF || ($code >= 0xD800 && $code <= 0xDFFF)) {
                return $i;
            }
            $i += $need + 1;
        }

        return -1;
    }

    /**
     * Encodes a code point as UTF-8.
     */
    public static function chr(int $code): string
    {
        if ($code >= 0xD800 && $code <= 0xDFFF) {
            $code = 0xFFFD;
        }

        return mb_chr($code, 'UTF-8') ?: '';
    }

    /**
     * @return list<string> code points of a valid UTF-8 string
     */
    public static function codePoints(string $text): array
    {
        return $text === '' ? [] : mb_str_split($text, 1, 'UTF-8');
    }

    public static function length(string $text): int
    {
        return mb_strlen($text, 'UTF-8');
    }
}
