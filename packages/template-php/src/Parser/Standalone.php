<?php

declare(strict_types=1);

namespace Polyspec\Template\Parser;

/**
 * Standalone line groups (LEX-14, LEX-15).
 */
final class Standalone
{
    /**
     * Returns the byte ranges [start, end) that standalone line groups remove from the output.
     *
     * @param list<array{start: int, end: int, echo: bool}> $tags
     * @return list<array{0: int, 1: int}>
     */
    public static function ranges(string $text, array $tags): array
    {
        $lineStarts = [0];
        $offset = 0;
        while (($found = strpos($text, "\n", $offset)) !== false) {
            $lineStarts[] = $found + 1;
            $offset = $found + 1;
        }
        $lineCount = count($lineStarts);
        $length = strlen($text);
        $lineOf = static function (int $index) use ($lineStarts, $lineCount): int {
            $low = 0;
            $high = $lineCount - 1;
            while ($low < $high) {
                $mid = intdiv($low + $high + 1, 2);
                if ($lineStarts[$mid] <= $index) {
                    $low = $mid;
                } else {
                    $high = $mid - 1;
                }
            }

            return $low;
        };
        $tagsByLine = array_fill(0, $lineCount, []);
        usort($tags, static fn (array $a, array $b): int => $a['start'] <=> $b['start']);
        foreach ($tags as $tag) {
            $tagsByLine[$lineOf($tag['start'])][] = $tag;
        }
        $ranges = [];
        $line = 0;
        while ($line < $lineCount) {
            $groupEnd = $line;
            $hasTag = false;
            $hasEcho = false;
            $groupTags = [];
            for ($cursor = $line; $cursor <= $groupEnd; $cursor++) {
                foreach ($tagsByLine[$cursor] as $tag) {
                    $hasTag = true;
                    if ($tag['echo']) {
                        $hasEcho = true;
                    }
                    $groupTags[] = $tag;
                    $endLine = $lineOf(max($tag['start'], $tag['end'] - 1));
                    if ($endLine > $groupEnd) {
                        $groupEnd = $endLine;
                    }
                }
            }
            if ($hasTag && !$hasEcho) {
                $start = $lineStarts[$line];
                $end = $groupEnd + 1 < $lineCount ? $lineStarts[$groupEnd + 1] : $length;
                if (self::onlyWhitespaceOutside($text, $start, $end, $groupTags)) {
                    $ranges[] = [$start, $end];
                }
            }
            $line = $groupEnd + 1;
        }

        return $ranges;
    }

    /**
     * @param list<array{start: int, end: int, echo: bool}> $tags
     */
    private static function onlyWhitespaceOutside(string $text, int $start, int $end, array $tags): bool
    {
        $index = $start;
        foreach ($tags as $tag) {
            if (!self::whitespaceOnly($text, $index, $tag['start'])) {
                return false;
            }
            $index = $tag['end'];
        }

        return self::whitespaceOnly($text, $index, $end);
    }

    private static function whitespaceOnly(string $text, int $start, int $end): bool
    {
        if ($end <= $start) {
            return true;
        }

        return trim(substr($text, $start, $end - $start), " \t\r\n") === '';
    }
}
