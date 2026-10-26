<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * Indentation: the spaces and tabs at the start of each line, set by the nesting of HTML elements and template blocks.
 *
 * Offsets are byte offsets into the text. A step is a change of depth at an offset; `dedent` marks a tag that takes one
 * level from its own line.
 * @internal
 */
final class Indent
{
    private const VOID = [
        'area',
        'base',
        'br',
        'col',
        'embed',
        'hr',
        'img',
        'input',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
    ];
    // Elements whose content is not HTML markup: the indentation does not read tags inside them.
    private const RAW = ['script', 'style', 'textarea'];
    // Elements whose lines keep their indentation.
    private const KEPT = ['pre', 'script', 'style', 'textarea'];
    private const OPEN_BLOCK = ['if', 'for', 'ifblock'];
    private const BRANCH = ['elseif', 'else'];

    /** @var list<array{index: int, delta: int, dedent: bool}> */
    private array $steps = [];
    /** @var list<array{0: int, 1: int}> ranges in which a line start keeps its indentation */
    private array $kept = [];
    /** @var list<array{0: int, 1: int}> ranges of HTML tags spanning lines, whose inner lines get one more level */
    private array $inside = [];
    /** @var list<array{name: string, start: int}> the open HTML elements */
    private array $elements = [];
    /** @var list<array{start: list<array{name: string, start: int}>, branchEnd: list<string>|null, hasElse: bool}> */
    private array $blocks = [];
    private int $next = 0;

    /**
     * @param list<array{kind: string, start: int, end: int}> $tags
     */
    private function __construct(
        private readonly string $text,
        private readonly array $tags,
        private readonly bool $counted,
    ) {
    }

    /**
     * Returns the edits that set the indentation of every line, or the reason why the HTML structure cannot be
     * indented: the byte offset of the tag where the structure fails and a message.
     *
     * @param list<array{kind: string, start: int, end: int}> $tags
     * @param array{start: int, end: int}|null $range only lines that start inside it are indented
     * @return array{edits: list<array{start: int, end: int, text: string}>}
     *     |array{error: array{index: int, message: string}}
     */
    public static function edits(string $text, array $tags, string $unit, string $templateBlocks, ?array $range): array
    {
        $scan = new self($text, $tags, $templateBlocks === 'indent');
        $error = $scan->scan();
        if ($error !== null) {
            return ['error' => $error];
        }
        $edits = [];
        foreach ($scan->lines($unit) as $line) {
            if ($line['indentation'] === null) {
                continue;
            }
            if ($range !== null && ($line['start'] < $range['start'] || $line['start'] >= $range['end'])) {
                continue;
            }
            if (substr($text, $line['start'], $line['end'] - $line['start']) !== $line['indentation']) {
                $edits[] = ['start' => $line['start'], 'end' => $line['end'], 'text' => $line['indentation']];
            }
        }

        return ['edits' => $edits];
    }

    /**
     * The indentation of every line: its start, the end of its current indentation, and the indentation it gets, or
     * null for a line that keeps its indentation.
     *
     * @return list<array{start: int, end: int, indentation: string|null}>
     */
    private function lines(string $unit): array
    {
        $text = $this->text;
        $length = strlen($text);
        $lines = [];
        $dedents = [];
        foreach ($this->steps as $step) {
            if ($step['dedent']) {
                $dedents[$step['index']] = true;
            }
        }
        $step = 0;
        $depth = 0;
        $lineStart = 0;
        while (true) {
            while ($step < count($this->steps) && $this->steps[$step]['index'] < $lineStart) {
                $depth += $this->steps[$step++]['delta'];
            }
            $first = $lineStart;
            while ($first < $length && ($text[$first] === ' ' || $text[$first] === "\t")) {
                $first++;
            }
            if (self::within($this->kept, $lineStart)) {
                $lines[] = ['start' => $lineStart, 'end' => $first, 'indentation' => null];
            } else {
                $blank = $first === $length || $text[$first] === "\n" || $text[$first] === "\r";
                $level = $depth + (self::within($this->inside, $lineStart) ? 1 : 0);
                if (isset($dedents[$first])) {
                    $level--;
                }
                // The formatter empties a blank line.
                $lines[] = [
                    'start' => $lineStart,
                    'end' => $first,
                    'indentation' => $blank ? '' : str_repeat($unit, max($level, 0)),
                ];
            }
            $newline = strpos($text, "\n", $lineStart);
            if ($newline === false) {
                break;
            }
            $lineStart = $newline + 1;
        }

        return $lines;
    }

    /**
     * @param list<array{0: int, 1: int}> $ranges
     */
    private static function within(array $ranges, int $index): bool
    {
        foreach ($ranges as [$start, $end]) {
            if ($start < $index && $index < $end) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function names(): array
    {
        return array_column($this->elements, 'name');
    }

    /**
     * Reads the structure of the text into steps and ranges.
     *
     * @return array{index: int, message: string}|null
     */
    private function scan(): ?array
    {
        $text = $this->text;
        $length = strlen($text);
        $raw = null;
        $keptStart = null;
        $position = 0;
        while ($position < $length) {
            $tag = $this->tags[$this->next] ?? null;
            if ($tag !== null && $tag['start'] === $position) {
                $failure = $this->templateTag($tag);
                if ($failure !== null) {
                    return $failure;
                }
                $this->next++;
                $position = $tag['end'];
                continue;
            }
            if ($text[$position] !== '<') {
                $position++;
                continue;
            }
            if ($raw !== null && strtolower(substr($text, $position, strlen($raw) + 2)) !== "</{$raw}") {
                $position++;
                continue;
            }
            if (substr($text, $position, 4) === '<!--') {
                $close = strpos($text, '-->', $position + 4);
                $end = $close === false ? $length : $close + 3;
                $this->kept[] = [$position, $end];
                // Template tags inside an HTML comment are still template tags; the comment keeps its lines.
                while ($this->next < count($this->tags) && $this->tags[$this->next]['start'] < $end) {
                    $failure = $this->templateTag($this->tags[$this->next++]);
                    if ($failure !== null) {
                        return $failure;
                    }
                }
                $position = $end;
                continue;
            }
            $second = $text[$position + 1] ?? '';
            if ($second === '!' || $second === '?') {
                $end = $this->htmlTagEnd($position);
                if (is_array($end)) {
                    return $end;
                }
                $position = $end;
                continue;
            }
            if (preg_match('/^<(\/?)([A-Za-z][A-Za-z0-9-]*)/', substr($text, $position, 64), $match) !== 1) {
                $position++;
                continue;
            }
            $closing = $match[1] === '/';
            $name = strtolower($match[2]);
            $end = $this->htmlTagEnd($position);
            if (is_array($end)) {
                return $end;
            }
            if (str_contains(substr($text, $position, $end - $position), "\n")) {
                $this->inside[] = [$position, $end];
            }
            if ($closing) {
                if (in_array($name, self::VOID, true)) {
                    $position = $end;
                    continue;
                }
                $open = $this->elements[count($this->elements) - 1] ?? null;
                if ($open === null) {
                    return ['index' => $position, 'message' => "the end tag </{$name}> has no open element"];
                }
                if ($open['name'] !== $name) {
                    return [
                        'index' => $position,
                        'message' => "the end tag </{$name}> does not match the open element <{$open['name']}>",
                    ];
                }
                $this->steps[] = ['index' => $position, 'delta' => -1, 'dedent' => true];
                array_pop($this->elements);
                if (
                    in_array($name, self::KEPT, true)
                    && !array_intersect($this->names(), self::KEPT)
                    && $keptStart !== null
                ) {
                    $newline = strpos($text, "\n", $position);
                    $this->kept[] = [$keptStart, $newline === false ? $length : $newline];
                    $keptStart = null;
                }
                $raw = null;
                $position = $end;
                continue;
            }
            $selfClosing = $text[$end - 2] === '/';
            if (!in_array($name, self::VOID, true) && !$selfClosing) {
                $this->elements[] = ['name' => $name, 'start' => $position];
                $this->steps[] = ['index' => $end, 'delta' => 1, 'dedent' => false];
                if (in_array($name, self::KEPT, true) && $keptStart === null) {
                    $keptStart = $end;
                }
                if (in_array($name, self::RAW, true)) {
                    $raw = $name;
                }
            }
            $position = $end;
        }

        $open = $this->elements[count($this->elements) - 1] ?? null;
        if ($open !== null) {
            return ['index' => $open['start'], 'message' => "the element <{$open['name']}> is not closed"];
        }
        // A stable sort by offset, as Array.prototype.sort is.
        usort($this->steps, static fn (array $left, array $right): int => $left['index'] <=> $right['index']);

        return null;
    }

    /**
     * Template tags are opaque to the HTML scan; block tags open, branch and close template blocks. Every branch of a
     * block must end with the same open HTML elements, and a block without an else branch with those of its start.
     *
     * @param array{kind: string, start: int, end: int} $tag
     * @return array{index: int, message: string}|null
     */
    private function templateTag(array $tag): ?array
    {
        $this->kept[] = [$tag['start'], $tag['end']];
        if (in_array($tag['kind'], self::OPEN_BLOCK, true)) {
            $this->blocks[] = ['start' => $this->elements, 'branchEnd' => null, 'hasElse' => false];
            if ($this->counted) {
                $this->steps[] = ['index' => $tag['end'], 'delta' => 1, 'dedent' => false];
            }

            return null;
        }
        if (!in_array($tag['kind'], self::BRANCH, true) && $tag['kind'] !== 'close') {
            return null;
        }
        $last = count($this->blocks) - 1;
        if ($last < 0) {
            return null;
        }
        $block = $this->blocks[$last];
        $end = $this->names();
        if ($block['branchEnd'] !== null && $block['branchEnd'] !== $end) {
            return [
                'index' => $tag['start'],
                'message' => 'the HTML elements open at the end of this branch differ from those of the first branch',
            ];
        }
        if ($tag['kind'] === 'close') {
            if (!$block['hasElse'] && array_column($block['start'], 'name') !== $end) {
                return [
                    'index' => $tag['start'],
                    'message' => 'a template block without an else branch must end with the HTML elements open at its '
                        . 'start',
                ];
            }
            array_pop($this->blocks);
            // The close tag aligns with the start of its block; the elements that every branch opened apply after it.
            $opened = count($end) - count($block['start']);
            if ($opened !== 0) {
                $this->steps[] = ['index' => $this->beforeLine($tag['start']), 'delta' => -$opened, 'dedent' => false];
                $this->steps[] = ['index' => $tag['end'], 'delta' => $opened, 'dedent' => false];
            }
            if ($this->counted) {
                $this->steps[] = ['index' => $tag['start'], 'delta' => -1, 'dedent' => true];
            }

            return null;
        }
        $this->blocks[$last]['branchEnd'] = $end;
        if ($tag['kind'] === 'else') {
            $this->blocks[$last]['hasElse'] = true;
        }
        // The next branch starts from the elements open at the start of the block.
        $this->steps[] = [
            'index' => $this->beforeLine($tag['start']),
            'delta' => count($block['start']) - count($this->elements),
            'dedent' => false,
        ];
        $this->elements = $block['start'];
        if ($this->counted) {
            $this->steps[] = ['index' => $tag['start'], 'delta' => 0, 'dedent' => true];
        }

        return null;
    }

    /**
     * Moves past one HTML tag from `<` and returns its end, reading template tags inside it.
     *
     * @return int|array{index: int, message: string}
     */
    private function htmlTagEnd(int $start): int|array
    {
        $text = $this->text;
        $length = strlen($text);
        $quote = null;
        $quoteStart = 0;
        $index = $start + 1;
        while ($index < $length) {
            $tag = $this->tags[$this->next] ?? null;
            if ($tag !== null && $tag['start'] === $index) {
                $failure = $this->templateTag($tag);
                if ($failure !== null) {
                    return $failure;
                }
                $this->next++;
                $index = $tag['end'];
                continue;
            }
            $character = $text[$index];
            if ($quote !== null) {
                if ($character === $quote) {
                    $this->kept[] = [$quoteStart, $index];
                    $quote = null;
                }
            } elseif ($character === '"' || $character === "'") {
                $quote = $character;
                $quoteStart = $index;
            } elseif ($character === '>') {
                return $index + 1;
            }
            $index++;
        }

        return ['index' => $start, 'message' => 'the HTML tag is not closed with ">"'];
    }

    /**
     * The offset from which a change of depth applies to the line of a tag: before the line when the tag starts it.
     */
    private function beforeLine(int $index): int
    {
        $newline = $index > 0 ? strrpos(substr($this->text, 0, $index), "\n") : false;
        $lineStart = $newline === false ? 0 : $newline + 1;

        return preg_match(
            '/^[ \t]*$/',
            substr($this->text, $lineStart, $index - $lineStart),
        ) === 1 ? $lineStart - 1 : $index;
    }
}
