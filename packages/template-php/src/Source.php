<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * Template source: UTF-8 validation, BOM removal and the line index (LEX-1, LEX-2, LEX-16).
 */
final class Source
{
    /** @var list<int> byte offsets of line starts */
    public readonly array $lines;

    private function __construct(public readonly string $name, public readonly string $text)
    {
        $this->lines = self::lineIndex($text);
    }

    public static function fromBytes(string $name, string $bytes): self
    {
        $invalid = Utf8::firstInvalid($bytes);
        if ($invalid >= 0) {
            throw TemplateError::at('E_LEX_INVALID_UTF8', $name, self::lineIndex($bytes), $invalid, $invalid + 1, "invalid UTF-8 byte at offset {$invalid}");
        }
        if (str_starts_with($bytes, "\xEF\xBB\xBF")) {
            $bytes = substr($bytes, 3);
        }

        return new self($name, $bytes);
    }

    /**
     * @return list<int>
     */
    public static function lineIndex(string $text): array
    {
        $starts = [0];
        $offset = 0;
        while (($found = strpos($text, "\n", $offset)) !== false) {
            $starts[] = $found + 1;
            $offset = $found + 1;
        }

        return $starts;
    }

    /**
     * @param list<int> $lines
     * @return array{0: int, 1: int} 1-based line and byte column
     */
    public static function position(array $lines, int $offset): array
    {
        $low = 0;
        $high = count($lines) - 1;
        while ($low < $high) {
            $mid = intdiv($low + $high + 1, 2);
            if ($lines[$mid] <= $offset) {
                $low = $mid;
            } else {
                $high = $mid - 1;
            }
        }

        return [$low + 1, $offset - $lines[$low] + 1];
    }

    public function length(): int
    {
        return strlen($this->text);
    }
}
