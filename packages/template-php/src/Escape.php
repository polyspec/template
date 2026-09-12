<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * HTML escaping (RT-32, FUN-10).
 */
final class Escape
{
    private const REPLACEMENTS = ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;', '"' => '&quot;', "'" => '&#39;'];

    public static function html(string $text): string
    {
        return strtr($text, self::REPLACEMENTS);
    }
}
