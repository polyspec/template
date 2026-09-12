<?php

declare(strict_types=1);

namespace Polyspec\Template\Parser;

use Polyspec\Template\Ast;
use Polyspec\Template\Expr\Parser as ExpressionParser;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * Template parser: text scanning, tag bodies, block structure and standalone lines
 * (docs/spec/lexical.md, docs/spec/grammar.md).
 *
 * Items in a body are text pieces (`['kind' => 'text', ...]`) or nodes until finalize() merges the pieces.
 */
final class Parser
{
    private const RESERVED = ['true' => true, 'false' => true, 'null' => true, 'in' => true];
    private const ASSIGN_HEAD = '/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*\/%]=|=(?![=>]))/';
    private const LOOP_HEAD = '/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/';

    private string $open;
    private string $close;
    private readonly string $text;
    /** @var list<mixed> */
    private array $root = [];
    /** @var list<array{node: array<string, mixed>, items: list<mixed>, hasElse: bool, openStart: int}> */
    private array $frames = [];
    /** @var list<array{start: int, end: int, echo: bool}> */
    private array $tags = [];
    private bool $sawTag = false;
    private bool $textBeforeFirstTagIsWhitespace = true;

    public function __construct(private readonly Source $source, string $open = '{', string $close = '}')
    {
        $this->open = $open;
        $this->close = $close;
        $this->text = $source->text;
    }

    /**
     * @return array<string, mixed>
     */
    public static function parse(Source $source, string $open = '{', string $close = '}'): array
    {
        return (new self($source, $open, $close))->run();
    }

    private function fail(string $code, int $start, int $end, string $message): TemplateError
    {
        return TemplateError::at($code, $this->source->name, $this->source->lines, $start, $end, $message);
    }

    /**
     * @return list<mixed>
     */
    private function &items(): array
    {
        $count = count($this->frames);
        if ($count === 0) {
            return $this->root;
        }

        return $this->frames[$count - 1]['items'];
    }

    private function push(mixed $item): void
    {
        $items = &$this->items();
        $items[] = $item;
    }

    /**
     * @return array<string, mixed>
     */
    private function run(): array
    {
        $this->scan();
        if ($this->frames !== []) {
            $frame = $this->frames[count($this->frames) - 1];
            throw $this->fail('E_PARSE_UNCLOSED_BLOCK', $frame['openStart'], $frame['openStart'] + 1, 'block is not closed before the end of the file');
        }
        $removed = Standalone::ranges($this->text, $this->tags);

        return ['type' => 'Template', 'name' => $this->source->name, 'body' => $this->finalize($this->root, $removed)];
    }

    private function scan(): void
    {
        $text = $this->text;
        $length = strlen($text);
        $index = 0;
        $textStart = 0;
        while ($index < $length) {
            $char = $text[$index];
            $open = $this->open;
            if ($char === '\\' && ($text[$index + 1] ?? null) === $open && Scanner::startsTag($text, $index + 1, $this->close)) {
                $this->flushText($textStart, $index);
                $this->pushText($index, $index + 2, $open);
                $index += 2;
                $textStart = $index;
                continue;
            }
            if ($char === $open && Scanner::startsTag($text, $index, $this->close)) {
                $this->flushText($textStart, $index);
                $index = $this->parseTag($index, $index, 1, null);
                $textStart = $index;
                continue;
            }
            $wrapper = Scanner::wrappedTagAt($text, $index, $open, $this->close);
            if ($wrapper !== null) {
                $this->flushText($textStart, $index);
                $openIndex = Scanner::skipHorizontalSpace($text, $index + strlen($wrapper[0])) + 1;
                $index = $this->parseTag($index, $openIndex, 2, $wrapper);
                $textStart = $index;
                continue;
            }
            $index++;
        }
        $this->flushText($textStart, $length);
    }

    private function flushText(int $start, int $end): void
    {
        if ($end > $start) {
            $this->pushText($start, $end, substr($this->text, $start, $end - $start));
        }
    }

    private function pushText(int $start, int $end, string $value): void
    {
        if (!$this->sawTag && $this->textBeforeFirstTagIsWhitespace && trim($value, " \t\r\n") !== '') {
            $this->textBeforeFirstTagIsWhitespace = false;
        }
        $this->push(['kind' => 'text', 'start' => $start, 'end' => $end, 'value' => $value]);
    }

    private function closeSequence(int $closeCount): string
    {
        return str_repeat($this->close, $closeCount);
    }

    /**
     * Parses one tag and returns the byte index after it.
     *
     * @param array{0: string, 1: string}|null $wrapper
     */
    private function parseTag(int $start, int $open, int $closeCount, ?array $wrapper): int
    {
        $text = $this->text;
        $sigil = Scanner::sigilAfter($text, $open);
        $bodyStart = $sigil === null ? $open + 1 : Scanner::skipHorizontalSpace($text, $open + 1) + strlen($sigil);
        $firstTag = !$this->sawTag;
        $this->sawTag = true;
        $echo = false;
        switch ($sigil) {
            case '*':
                $end = $this->parseComment($start, $open, $closeCount, $wrapper, $bodyStart);
                break;
            case '=':
                $echo = true;
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $expr = $parser->parseExpression();
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $this->push(Ast::echo($expr, $start, $end));
                break;
            case '@':
                $end = $this->parseLoop($start, $open, $closeCount, $wrapper, $bodyStart);
                break;
            case '?':
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $test = $parser->parseExpression();
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $node = ['type' => 'If', 'branches' => [['test' => $test, 'body' => [], 'span' => [$start, $end]]], 'else' => null, 'span' => [$start, $end]];
                $this->frames[] = ['node' => $node, 'items' => [], 'hasElse' => false, 'openStart' => $start];
                break;
            case '?#':
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $id = $parser->expect('IDENT');
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $node = ['type' => 'IfBlock', 'id' => $id->value, 'body' => [], 'else' => null, 'span' => [$start, $end]];
                $this->frames[] = ['node' => $node, 'items' => [], 'hasElse' => false, 'openStart' => $start];
                break;
            case ':?':
                $frameIndex = count($this->frames) - 1;
                if ($frameIndex < 0) {
                    throw $this->fail('E_PARSE_ELSE_OUTSIDE_BLOCK', $start, $start + 1, '"{:?}" outside of a block');
                }
                if ($this->frames[$frameIndex]['node']['type'] !== 'If') {
                    throw $this->fail('E_PARSE_ELSEIF_NOT_IN_IF', $start, $start + 1, '"{:?}" inside a loop or if-block');
                }
                if ($this->frames[$frameIndex]['hasElse']) {
                    throw $this->fail('E_PARSE_ELSEIF_AFTER_ELSE', $start, $start + 1, '"{:?}" after "{:}"');
                }
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $test = $parser->parseExpression();
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $this->storeBranch($frameIndex);
                $this->frames[$frameIndex]['node']['branches'][] = ['test' => $test, 'body' => [], 'span' => [$start, $end]];
                $this->frames[$frameIndex]['items'] = [];
                break;
            case ':':
                if (preg_match(self::ASSIGN_HEAD, substr($text, $bodyStart, 80)) === 1) {
                    $end = $this->parseAssignment($start, $open, $closeCount, $wrapper, $bodyStart);
                    break;
                }
                $frameIndex = count($this->frames) - 1;
                if ($frameIndex < 0) {
                    throw $this->fail('E_PARSE_ELSE_OUTSIDE_BLOCK', $start, $start + 1, '"{:}" outside of a block');
                }
                if ($this->frames[$frameIndex]['hasElse']) {
                    throw $this->fail('E_PARSE_DUPLICATE_ELSE', $start, $start + 1, 'second "{:}" in the same block');
                }
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $bodyStart));
                $this->storeBranch($frameIndex);
                $this->frames[$frameIndex]['hasElse'] = true;
                $this->frames[$frameIndex]['items'] = [];
                break;
            case '/':
                $frame = array_pop($this->frames);
                if ($frame === null) {
                    throw $this->fail('E_PARSE_UNEXPECTED_CLOSE', $start, $start + 1, '"{/}" without an open block');
                }
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $bodyStart));
                $node = $this->closeFrame($frame);
                $node['span'] = [$frame['openStart'], $end];
                $this->push($node);
                break;
            case '+':
                $reader = new BlockTag($this->source, $this->source->name, $this->close, $closeCount);
                [$path, $pathEnd] = $reader->readIncludePath($bodyStart);
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $pathEnd));
                $this->push(Ast::include($path, $start, $end));
                break;
            case '#':
                $reader = new BlockTag($this->source, $this->source->name, $this->close, $closeCount);
                $body = $reader->readBlockBody($bodyStart);
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $body['end']));
                $this->push(Ast::block($body['id'], $body['path'], $body['scope'], $start, $end));
                break;
            case '%':
                $end = $this->parseDirective($start, $open, $closeCount, $wrapper, $bodyStart, $firstTag);
                break;
            case null:
                throw $this->fail('E_PARSE_UNEXPECTED_TOKEN', $bodyStart, $bodyStart + 1, 'unknown tag');
            default:
                throw $this->fail('E_PARSE_UNEXPECTED_TOKEN', $bodyStart, $bodyStart + 1, 'unknown tag');
        }
        $this->tags[] = ['start' => $start, 'end' => $end, 'echo' => $echo];

        return $end;
    }

    /**
     * Moves the items collected so far into the current branch of the frame.
     */
    private function storeBranch(int $frameIndex): void
    {
        $frame = &$this->frames[$frameIndex];
        $items = $frame['items'];
        $node = &$frame['node'];
        if ($node['type'] === 'If') {
            if ($frame['hasElse']) {
                $node['else'] = $items;
            } else {
                $last = count($node['branches']) - 1;
                $node['branches'][$last]['body'] = $items;
            }
        } elseif ($node['type'] === 'For') {
            if ($frame['hasElse']) {
                $node['empty'] = $items;
            } else {
                $node['body'] = $items;
            }
        } else {
            if ($frame['hasElse']) {
                $node['else'] = $items;
            } else {
                $node['body'] = $items;
            }
        }
    }

    /**
     * @param array{node: array<string, mixed>, items: list<mixed>, hasElse: bool, openStart: int} $frame
     * @return array<string, mixed>
     */
    private function closeFrame(array $frame): array
    {
        $this->frames[] = $frame;
        $this->storeBranch(count($this->frames) - 1);
        $frame = array_pop($this->frames);

        return $frame['node'];
    }

    private function expressionParser(int $open, int $closeCount, int $start): ExpressionParser
    {
        return new ExpressionParser($this->source, $start, $this->close, $closeCount, $open, $this->source->name);
    }

    private function expectCloseRaw(int $open, int $closeCount, int $index): int
    {
        $at = Scanner::skipHorizontalSpace($this->text, $index);
        $sequence = $this->closeSequence($closeCount);
        if (substr($this->text, $at, strlen($sequence)) === $sequence) {
            return $at + strlen($sequence);
        }
        if (strpos($this->text, $this->close, $at) === false) {
            throw $this->fail('E_PARSE_UNTERMINATED_TAG', $open, $open + 1, 'tag is not terminated');
        }

        throw $this->fail('E_PARSE_UNEXPECTED_TOKEN', $at, $at + 1, 'unexpected ' . json_encode($this->text[$at]) . ' before the end of the tag');
    }

    /**
     * @param array{0: string, 1: string}|null $wrapper
     */
    private function finishTag(int $start, ?array $wrapper, int $afterClose): int
    {
        if ($wrapper === null) {
            return $afterClose;
        }
        $at = Scanner::skipHorizontalSpace($this->text, $afterClose);
        if (substr($this->text, $at, strlen($wrapper[1])) !== $wrapper[1]) {
            throw $this->fail('E_PARSE_INVALID_WRAPPER', $start, $start + strlen($wrapper[0]), 'wrapped tag is not followed by ' . json_encode($wrapper[1]));
        }

        return $at + strlen($wrapper[1]);
    }

    /**
     * @param array{0: string, 1: string}|null $wrapper
     */
    private function parseComment(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart): int
    {
        $terminator = '*' . $this->closeSequence($closeCount);
        $at = strpos($this->text, $terminator, $bodyStart);
        if ($at === false) {
            throw $this->fail('E_PARSE_UNTERMINATED_COMMENT', $open, $open + 1, 'comment is not terminated');
        }

        return $this->finishTag($start, $wrapper, $at + strlen($terminator));
    }

    /**
     * @param array{0: string, 1: string}|null $wrapper
     */
    private function parseLoop(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart): int
    {
        if (preg_match(self::LOOP_HEAD, substr($this->text, $bodyStart), $head) !== 1) {
            $at = Scanner::skipHorizontalSpace($this->text, $bodyStart);
            throw $this->fail('E_PARSE_UNEXPECTED_TOKEN', $at, $at + 1, 'loop requires "name = expression"');
        }
        $name = $head[1];
        $nameStart = $bodyStart + (int) strpos($head[0], $name);
        if (isset(self::RESERVED[$name])) {
            throw $this->fail('E_PARSE_RESERVED_NAME', $nameStart, $nameStart + strlen($name), "{$name} is a reserved word");
        }
        $parser = $this->expressionParser($open, $closeCount, $bodyStart + strlen($head[0]));
        $iter = $parser->parseExpression();
        $end = $this->finishTag($start, $wrapper, $parser->expectClose());
        $node = ['type' => 'For', 'name' => $name, 'iter' => $iter, 'body' => [], 'empty' => null, 'span' => [$start, $end]];
        $this->frames[] = ['node' => $node, 'items' => [], 'hasElse' => false, 'openStart' => $start];

        return $end;
    }

    /**
     * @param array{0: string, 1: string}|null $wrapper
     */
    private function parseAssignment(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart): int
    {
        if (preg_match(self::ASSIGN_HEAD, substr($this->text, $bodyStart), $head) !== 1) {
            throw $this->fail('E_PARSE_UNEXPECTED_TOKEN', $bodyStart, $bodyStart + 1, 'unknown tag');
        }
        $name = $head[1];
        $operator = $head[2];
        $nameStart = $bodyStart + strpos($head[0], $name);
        if (isset(self::RESERVED[$name])) {
            throw $this->fail('E_PARSE_RESERVED_NAME', $nameStart, $nameStart + strlen($name), "{$name} is a reserved word");
        }
        $variable = Ast::variable($name, $nameStart, $nameStart + strlen($name));
        $afterOperator = $bodyStart + strlen($head[0]);
        if ($operator === '++' || $operator === '--') {
            $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $afterOperator));
            $one = Ast::literal('number', 1.0, $afterOperator - 2, $afterOperator);
            $expr = Ast::binary($operator === '++' ? '+' : '-', $variable, $one, $bodyStart, $afterOperator);
        } else {
            $parser = $this->expressionParser($open, $closeCount, $afterOperator);
            $value = $parser->parseExpression();
            $end = $this->finishTag($start, $wrapper, $parser->expectClose());
            $expr = $operator === '=' ? $value : Ast::binary($operator[0], $variable, $value, $bodyStart, $parser->end());
        }
        $this->push(Ast::set($name, $expr, $start, $end));

        return $end;
    }

    /**
     * @param array{0: string, 1: string}|null $wrapper
     */
    private function parseDirective(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart, bool $firstTag): int
    {
        $invalid = fn (string $message): TemplateError => $this->fail('E_PARSE_INVALID_DIRECTIVE', $start, $start + 1, $message);
        if (!$firstTag || !$this->textBeforeFirstTagIsWhitespace) {
            throw $invalid('delimiter directive is not the first tag');
        }
        $index = Scanner::skipHorizontalSpace($this->text, $bodyStart);
        if (substr($this->text, $index, 9) !== 'delimiter') {
            throw $invalid('directive is not "delimiter"');
        }
        $index = Scanner::skipHorizontalSpace($this->text, $index + 9);
        $value = '';
        $sequence = $this->closeSequence($closeCount);
        while ($index < strlen($this->text) && !Scanner::isHorizontalSpace($this->text[$index]) && substr($this->text, $index, strlen($sequence)) !== $sequence) {
            $value .= $this->text[$index];
            $index++;
            if (strlen($value) > 2) {
                break;
            }
        }
        $delimiters = Scanner::parseDelimiters($value);
        if ($delimiters === null) {
            throw $invalid(json_encode($value) . ' is not a delimiter pair');
        }
        $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $index));
        [$this->open, $this->close] = $delimiters;

        return $end;
    }

    /**
     * Applies standalone removal to text pieces and merges them into Text nodes.
     *
     * @param list<mixed> $items
     * @param list<array{0: int, 1: int}> $removed
     * @return list<array<string, mixed>>
     */
    private function finalize(array $items, array $removed): array
    {
        $nodes = [];
        $pending = [];
        $flush = function () use (&$nodes, &$pending): void {
            if ($pending === []) {
                return;
            }
            $value = implode('', array_column($pending, 'value'));
            if ($value !== '') {
                $nodes[] = Ast::text($value, $pending[0]['start'], $pending[count($pending) - 1]['end']);
            }
            $pending = [];
        };
        foreach ($items as $item) {
            if (isset($item['kind'])) {
                foreach (self::cutPiece($item, $removed) as $piece) {
                    $pending[] = $piece;
                }
                continue;
            }
            $flush();
            $nodes[] = $this->finalizeNode($item, $removed);
        }
        $flush();

        return $nodes;
    }

    /**
     * @param array<string, mixed> $node
     * @param list<array{0: int, 1: int}> $removed
     * @return array<string, mixed>
     */
    private function finalizeNode(array $node, array $removed): array
    {
        switch ($node['type']) {
            case 'If':
                foreach ($node['branches'] as $i => $branch) {
                    $node['branches'][$i]['body'] = $this->finalize($branch['body'], $removed);
                }
                if ($node['else'] !== null) {
                    $node['else'] = $this->finalize($node['else'], $removed);
                }

                return $node;
            case 'For':
                $node['body'] = $this->finalize($node['body'], $removed);
                if ($node['empty'] !== null) {
                    $node['empty'] = $this->finalize($node['empty'], $removed);
                }

                return $node;
            case 'IfBlock':
                $node['body'] = $this->finalize($node['body'], $removed);
                if ($node['else'] !== null) {
                    $node['else'] = $this->finalize($node['else'], $removed);
                }

                return $node;
            default:
                return $node;
        }
    }

    /**
     * Removes the parts of a text piece that fall inside removed ranges.
     *
     * @param array{kind: string, start: int, end: int, value: string} $piece
     * @param list<array{0: int, 1: int}> $removed
     * @return list<array{kind: string, start: int, end: int, value: string}>
     */
    private static function cutPiece(array $piece, array $removed): array
    {
        $result = [];
        $cursor = $piece['start'];
        $sourceSized = $piece['end'] - $piece['start'] === strlen($piece['value']);
        $push = static function (int $start, int $end) use (&$result, $piece, $sourceSized): void {
            if ($end <= $start) {
                return;
            }
            $value = $sourceSized ? substr($piece['value'], $start - $piece['start'], $end - $start) : $piece['value'];
            $result[] = ['kind' => 'text', 'start' => $start, 'end' => $end, 'value' => $value];
        };
        foreach ($removed as [$rangeStart, $rangeEnd]) {
            if ($rangeEnd <= $cursor) {
                continue;
            }
            if ($rangeStart >= $piece['end']) {
                break;
            }
            $push($cursor, min($rangeStart, $piece['end']));
            $cursor = max($cursor, $rangeEnd);
        }
        $push($cursor, $piece['end']);

        return $result;
    }
}
