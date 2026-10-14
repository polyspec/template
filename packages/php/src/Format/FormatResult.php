<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * The result of the formatter: the formatted text and whether it differs from the source, or the reason why the
 * source is kept.
 */
final class FormatResult
{
    public function __construct(
        public readonly ?string $text,
        public readonly bool $changed,
        public readonly ?FormatError $error,
    ) {
    }

    public static function text(string $text, bool $changed): self
    {
        return new self($text, $changed, null);
    }

    public static function error(FormatError $error): self
    {
        return new self(null, false, $error);
    }
}
