<?php

declare(strict_types=1);

namespace Polyspec\Template\Parser;

/**
 * Tag start detection (LEX-5, LEX-6, LEX-9, LEX-17, LEX-18) and delimiter validation (LEX-21).
 */
final class Scanner
{
    public const SIGILS = ['?#', ':?', '=', '@', '?', ':', '/', '+', '#', '*', '%'];

    /** @var list<array{0: string, 1: string}> opener and closer */
    public const WRAPPERS = [['"', '"'], ["'", "'"], ['/*', '*/'], ['<!--', '-->']];

    private const LOOP_FORM = '/^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=/';

    public static function skipHorizontalSpace(string $text, int $index): int
    {
        $length = strlen($text);
        while ($index < $length && ($text[$index] === ' ' || $text[$index] === "\t")) {
            $index++;
        }

        return $index;
    }

    public static function isHorizontalSpace(string $char): bool
    {
        return $char === ' ' || $char === "\t";
    }

    /**
     * Returns the sigil after the open delimiter at $open, or null (LEX-5).
     */
    public static function sigilAfter(string $text, int $open): ?string
    {
        $index = self::skipHorizontalSpace($text, $open + 1);
        foreach (self::SIGILS as $sigil) {
            if (substr($text, $index, strlen($sigil)) === $sigil) {
                return $sigil;
            }
        }

        return null;
    }

    /**
     * Whether the open delimiter at $open starts a tag (LEX-5 or LEX-6).
     */
    public static function startsTag(string $text, int $open, string $close): bool
    {
        $sigil = self::sigilAfter($text, $open);
        if ($sigil === null) {
            return false;
        }
        $after = self::skipHorizontalSpace($text, $open + 1) + strlen($sigil);
        if ($sigil === '/') {
            return ($text[self::skipHorizontalSpace($text, $after)] ?? null) === $close;
        }
        if ($sigil === '@') {
            return preg_match(self::LOOP_FORM, substr($text, $after, 80)) === 1;
        }

        return true;
    }

    /**
     * Returns the wrapper [opener, closer] whose opener starts at $index and is followed by a wrapped tag start, or null.
     *
     * @return array{0: string, 1: string}|null
     */
    public static function wrappedTagAt(string $text, int $index, string $open, string $close): ?array
    {
        foreach (self::WRAPPERS as $wrapper) {
            if (substr($text, $index, strlen($wrapper[0])) !== $wrapper[0]) {
                continue;
            }
            $after = self::skipHorizontalSpace($text, $index + strlen($wrapper[0]));
            if (($text[$after] ?? null) === $open && ($text[$after + 1] ?? null) === $open && self::startsTag($text, $after + 1, $close)) {
                return $wrapper;
            }

            return null;
        }

        return null;
    }

    /**
     * LEX-21.
     */
    public static function isDelimiterChar(string $char): bool
    {
        if (strlen($char) !== 1) {
            return false;
        }
        $code = ord($char);
        if ($code <= 0x20 || $code >= 0x7F) {
            return false;
        }
        if (ctype_alnum($char)) {
            return false;
        }

        return $char !== '_' && $char !== '\\';
    }

    /**
     * @return array{0: string, 1: string}|null open and close
     */
    public static function parseDelimiters(string $value): ?array
    {
        if (strlen($value) !== 2 || !self::isDelimiterChar($value[0]) || !self::isDelimiterChar($value[1])) {
            return null;
        }

        return [$value[0], $value[1]];
    }
}
