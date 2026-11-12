<?php

declare(strict_types=1);

namespace Polyspec\Template\Parser;

use Polyspec\Template\Ast;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\Expr\Parser as ExpressionParser;
use Polyspec\Template\Expr\Token;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * Template parser: text scanning, tag bodies, block structure and standalone lines
 * (docs/spec/lexical.md, docs/spec/grammar.md).
 *
 * Items in a body are text pieces (`['kind' => 'text', ...]`) or nodes until finalize() merges the pieces.
 *
 * @phpstan-type Wrapper array{0: string, 1: string}
 * @phpstan-type Analysis array{
 *     ast: array<string, mixed>,
 *     tags: list<array{start: int, end: int, echo: bool, kind: string, bodyStart: int, bodyEnd: int}>,
 *     tokens: list<array{start: int, end: int, kind: string}>,
 * }
 * @phpstan-type PrefixAnalysis array{
 *     ast: array<string, mixed>|null,
 *     tags: list<array{start: int, end: int, echo: bool, kind: string, bodyStart: int, bodyEnd: int}>,
 *     tokens: list<array{start: int, end: int, kind: string}>,
 *     error: TemplateError|null,
 * }
 * @internal
 */
final class Parser
{
    private const RESERVED = ['true' => true, 'false' => true, 'null' => true, 'in' => true];
    private const ASSIGN_HEAD = '/\G([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*\/%]=|=(?![=>]))/';
    /** The tag kind of each sigil of an accepted tag; `:` is `assignment` when an assignment head follows it. */
    private const KINDS = [
        '*' => 'comment',
        '=' => 'echo',
        '@' => 'for',
        '?' => 'if',
        '?#' => 'ifblock',
        ':?' => 'elseif',
        ':' => 'else',
        '/' => 'close',
        '+' => 'include',
        '#' => 'block',
        '%' => 'directive',
    ];
    private const LOOP_HEAD = '/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/';

    private string $open;
    private string $close;
    private readonly string $text;
    /** @var list<mixed> */
    private array $root = [];
    /** @var list<array{node: array<string, mixed>, items: list<mixed>, hasElse: bool, openStart: int}> */
    private array $frames = [];
    /** @var list<array{start: int, end: int, echo: bool, kind: string, bodyStart: int, bodyEnd: int}> */
    private array $tags = [];
    /** @var list<array{start: int, end: int, kind: string}> */
    private array $tokens = [];
    /** @var list<ExpressionParser> the expression parsers of the tag being parsed */
    private array $tagParsers = [];
    /** @var list<array{start: int, end: int, kind: string}> the tokens outside expressions of the tag being parsed */
    private array $tagTokens = [];
    /** @var list<array{type: 'Comment', value: string, span: array{0: int, 1: int}}> */
    private array $comments = [];
    private bool $sawTag = false;
    private bool $textBeforeFirstTagIsWhitespace = true;

    public function __construct(private readonly Source $source, string $open = '{', string $close = '}')
    {
        self::requireOneByteDelimiters('__construct', $open, $close);
        $this->open = $open;
        $this->close = $close;
        $this->text = $source->text;
    }

    /**
     * @return array<string, mixed>
     */
    public static function parse(Source $source, string $open = '{', string $close = '}'): array
    {
        self::requireOneByteDelimiters('parse', $open, $close);

        return (new self($source, $open, $close))->run();
    }

    /**
     * A delimiter is exactly one byte; any other string is a ValueError of the method that received it (P8).
     */
    private static function requireOneByteDelimiters(string $method, string $open, string $close): void
    {
        $prefix = self::class . '::' . $method . '(): Argument #';
        if (strlen($open) !== 1) {
            throw new \ValueError($prefix . '2 ($open) must be a single character');
        }
        if (strlen($close) !== 1) {
            throw new \ValueError($prefix . '3 ($close) must be a single character');
        }
    }

    /**
     * Parses a template once and returns its AST with the accepted tags and the EDT-8 tokens of their parts.
     *
     * A tag has its kind, its byte range and the byte range of its body between the open and the close delimiters,
     * sigil included. Tokens are in source order.
     *
     * @return Analysis
     */
    public static function analyze(Source $source, string $open = '{', string $close = '}'): array
    {
        self::requireOneByteDelimiters('analyze', $open, $close);
        $parser = new self($source, $open, $close);
        $ast = $parser->run();

        return ['ast' => $ast, 'tags' => $parser->tags, 'tokens' => $parser->tokens];
    }

    /**
     * EDT-11: returns the accepted prefix and the first parser error.
     *
     * @return PrefixAnalysis
     */
    public static function analyzePrefix(Source $source, string $open = '{', string $close = '}'): array
    {
        self::requireOneByteDelimiters('analyzePrefix', $open, $close);
        $parser = new self($source, $open, $close);
        $error = null;
        $ast = null;
        try {
            $ast = $parser->run();
        } catch (TemplateError $failure) {
            $error = $failure;
        }

        return ['ast' => $ast, 'tags' => $parser->tags, 'tokens' => $parser->tokens, 'error' => $error];
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
            throw $this->fail(
                ErrorCode::E_PARSE_UNCLOSED_BLOCK,
                $frame['openStart'],
                $frame['openStart'] + 1,
                'block is not closed before the end of the file',
            );
        }
        $removed = Standalone::ranges($this->text, $this->tags);

        return [
            'type' => 'Template',
            'name' => $this->source->name,
            'body' => $this->finalize($this->root, $removed),
            'comments' => $this->comments,
        ];
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
            if (
                $char === '\\'
                && ($text[$index + 1] ?? null) === $open
                && Scanner::startsTag($text, $index + 1, $this->close)
            ) {
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
     * @param Wrapper|null $wrapper
     */
    private function parseTag(int $start, int $open, int $closeCount, ?array $wrapper): int
    {
        $text = $this->text;
        $sigil = Scanner::sigilAfter($text, $open);
        $bodyStart = $sigil === null ? $open + 1 : Scanner::skipHorizontalSpace(
            $text,
            Scanner::skipHorizontalSpace($text, $open + 1) + strlen($sigil),
        );
        $firstTag = !$this->sawTag;
        $this->sawTag = true;
        $this->tagParsers = [];
        $this->tagTokens = [];
        $echo = false;
        $assignment = false;
        switch ($sigil) {
            case '*':
                $end = $this->parseComment($start, $open, $closeCount, $wrapper, $bodyStart);
                break;
            case '=':
                $echo = true;
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $expr = $parser->parseExpression();
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $this->push(Ast::node('Echo', ['expr' => $expr], $start, $end));
                break;
            case '@':
                $end = $this->parseLoop($start, $open, $closeCount, $wrapper, $bodyStart);
                break;
            case '?':
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $test = $parser->parseExpression();
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $node = [
                    'type' => 'If',
                    'branches' => [['test' => $test, 'body' => [], 'span' => [$start, $end]]],
                    'else' => null,
                    'span' => [$start, $end],
                ];
                $this->openFrame($node, $start);
                break;
            case '?#':
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $id = $parser->expect('IDENT');
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $node = [
                    'type' => 'IfBlock',
                    'id' => $id->value,
                    'body' => [],
                    'else' => null,
                    'span' => [$start, $end],
                ];
                $this->openFrame($node, $start);
                break;
            case ':?':
                $frameIndex = count($this->frames) - 1;
                if ($frameIndex < 0) {
                    throw $this->fail(
                        ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK,
                        $start,
                        $start + 1,
                        '"{:?}" outside of a block',
                    );
                }
                if ($this->frames[$frameIndex]['node']['type'] !== 'If') {
                    throw $this->fail(
                        ErrorCode::E_PARSE_ELSEIF_NOT_IN_IF,
                        $start,
                        $start + 1,
                        '"{:?}" inside a loop or if-block',
                    );
                }
                if ($this->frames[$frameIndex]['hasElse']) {
                    throw $this->fail(ErrorCode::E_PARSE_ELSEIF_AFTER_ELSE, $start, $start + 1, '"{:?}" after "{:}"');
                }
                $parser = $this->expressionParser($open, $closeCount, $bodyStart);
                $test = $parser->parseExpression();
                $end = $this->finishTag($start, $wrapper, $parser->expectClose());
                $this->storeBranch($frameIndex);
                $this->frames[$frameIndex]['node']['branches'][] = [
                    'test' => $test,
                    'body' => [],
                    'span' => [$start, $end],
                ];
                $this->frames[$frameIndex]['items'] = [];
                break;
            case ':':
                if (preg_match(self::ASSIGN_HEAD, $text, $head, 0, $bodyStart) === 1) {
                    $assignment = true;
                    $end = $this->parseAssignment($start, $open, $closeCount, $wrapper, $bodyStart);
                    break;
                }
                $frameIndex = count($this->frames) - 1;
                if ($frameIndex < 0) {
                    throw $this->fail(
                        ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK,
                        $start,
                        $start + 1,
                        '"{:}" outside of a block',
                    );
                }
                if ($this->frames[$frameIndex]['hasElse']) {
                    throw $this->fail(
                        ErrorCode::E_PARSE_DUPLICATE_ELSE,
                        $start,
                        $start + 1,
                        'second "{:}" in the same block',
                    );
                }
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $bodyStart));
                $this->storeBranch($frameIndex);
                $this->frames[$frameIndex]['hasElse'] = true;
                $this->frames[$frameIndex]['items'] = [];
                break;
            case '/':
                $frame = array_pop($this->frames);
                if ($frame === null) {
                    throw $this->fail(
                        ErrorCode::E_PARSE_UNEXPECTED_CLOSE,
                        $start,
                        $start + 1,
                        '"{/}" without an open block',
                    );
                }
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $bodyStart));
                $node = $this->closeFrame($frame);
                $node['span'] = [$frame['openStart'], $end];
                $this->push($node);
                break;
            case '+':
                $reader = new BlockTag($this->source, $this->source->name, $this->close, $closeCount);
                $path = $reader->readIncludePath($bodyStart);
                $this->mark($path['start'], $path['end'], $path['quoted'] ? 'string' : 'path');
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $path['end']));
                $this->push(Ast::node('Include', ['path' => $path['path']], $start, $end));
                break;
            case '#':
                $reader = new BlockTag($this->source, $this->source->name, $this->close, $closeCount);
                $body = $reader->readBlockBody($bodyStart);
                foreach ($body['words'] as $word) {
                    $this->mark($word['start'], $word['end'], $word['quoted'] ? 'string' : 'path');
                }
                $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $body['end']));
                $this->push(Ast::node(
                    'Block',
                    ['id' => $body['id'], 'path' => $body['path'], 'scope' => $body['scope']],
                    $start,
                    $end,
                ));
                break;
            case '%':
                $end = $this->parseDirective($start, $open, $closeCount, $wrapper, $bodyStart, $firstTag);
                break;
            case null:
                throw $this->fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, $bodyStart, $bodyStart + 1, 'unknown tag');
            default:
                throw $this->fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, $bodyStart, $bodyStart + 1, 'unknown tag');
        }
        $kind = $assignment ? 'assignment' : self::KINDS[$sigil];
        $tagBodyStart = $open + 1;
        $tagBodyEnd = $this->closeStart($wrapper, $closeCount, $end);
        $this->tags[] = [
            'start' => $start,
            'end' => $end,
            'echo' => $echo,
            'kind' => $kind,
            'bodyStart' => $tagBodyStart,
            'bodyEnd' => $tagBodyEnd,
        ];
        if ($kind === 'comment') {
            $this->tokens[] = ['start' => $start, 'end' => $end, 'kind' => 'comment'];

            return $end;
        }
        $this->tokens[] = ['start' => $start, 'end' => $tagBodyStart, 'kind' => 'delimiter'];
        $sigilStart = Scanner::skipHorizontalSpace($text, $tagBodyStart);
        $this->tokens[] = ['start' => $sigilStart, 'end' => $sigilStart + strlen($sigil), 'kind' => 'keyword'];
        array_push($this->tokens, ...$this->tagTokens);
        foreach ($this->tagParsers as $parser) {
            array_push($this->tokens, ...self::expressionTokens($parser));
        }
        $this->tokens[] = ['start' => $tagBodyEnd, 'end' => $end, 'kind' => 'delimiter'];

        return $end;
    }

    private function mark(int $start, int $end, string $kind): void
    {
        $this->tagTokens[] = ['start' => $start, 'end' => $end, 'kind' => $kind];
    }

    /**
     * The byte index of the close delimiters of the tag that ends at $end: before the wrapper closer and the
     * horizontal whitespace in front of it (LEX-19).
     *
     * @param Wrapper|null $wrapper
     */
    private function closeStart(?array $wrapper, int $closeCount, int $end): int
    {
        $tail = $end;
        if ($wrapper !== null) {
            $tail -= strlen($wrapper[1]);
            while ($tail > 0 && Scanner::isHorizontalSpace($this->text[$tail - 1])) {
                $tail--;
            }
        }

        return $tail - $closeCount;
    }

    /**
     * The EDT-8 tokens of the expression that a parser consumed; names are classified by their neighbours.
     *
     * @return list<array{start: int, end: int, kind: string}>
     */
    private static function expressionTokens(ExpressionParser $parser): array
    {
        $tokens = array_values(array_filter(
            $parser->lexer->consumed(),
            static fn (Token $token): bool => $token->type !== 'CLOSE' && $token->type !== 'EOF',
        ));
        $result = [];
        foreach ($tokens as $index => $token) {
            $previous = $tokens[$index - 1] ?? null;
            $next = $tokens[$index + 1] ?? null;
            $kind = match ($token->type) {
                'STRING' => 'string',
                'NUMBER' => 'number',
                'NULL', 'TRUE', 'FALSE', 'IN' => 'keyword',
                'IDENT' => $next?->type === 'LPAREN' || $previous?->type === 'PIPE' ? 'function' : 'variable',
                'DOT_IDENT' => $next?->type === 'LPAREN' ? 'function' : 'property',
                'DOT_INDEX' => 'property',
                default => 'operator',
            };
            $result[] = ['start' => $token->start, 'end' => $token->end, 'kind' => $kind];
        }

        return $result;
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
        $parser = new ExpressionParser($this->source, $start, $this->close, $closeCount, $open, $this->source->name);
        $this->tagParsers[] = $parser;

        return $parser;
    }

    private function expectCloseRaw(int $open, int $closeCount, int $index): int
    {
        $at = Scanner::skipHorizontalSpace($this->text, $index);
        $sequence = $this->closeSequence($closeCount);
        if (substr($this->text, $at, strlen($sequence)) === $sequence) {
            return $at + strlen($sequence);
        }
        if (strpos($this->text, $this->close, $at) === false) {
            throw $this->fail(ErrorCode::E_PARSE_UNTERMINATED_TAG, $open, $open + 1, 'tag is not terminated');
        }

        throw $this->fail(
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
            $at,
            $at + 1,
            'unexpected ' . json_encode($this->text[$at]) . ' before the end of the tag',
        );
    }

    /**
     * Opens a block: its tag node, with no items and no else yet.
     *
     * @param array<string, mixed> $node
     */
    private function openFrame(array $node, int $start): void
    {
        $this->frames[] = ['node' => $node, 'items' => [], 'hasElse' => false, 'openStart' => $start];
    }

    /**
     * @param Wrapper|null $wrapper
     */
    private function finishTag(int $start, ?array $wrapper, int $afterClose): int
    {
        if ($wrapper === null) {
            return $afterClose;
        }
        $at = Scanner::skipHorizontalSpace($this->text, $afterClose);
        if (substr($this->text, $at, strlen($wrapper[1])) !== $wrapper[1]) {
            throw $this->fail(
                ErrorCode::E_PARSE_INVALID_WRAPPER,
                $start,
                $start + strlen($wrapper[0]),
                'wrapped tag is not followed by ' . json_encode($wrapper[1]),
            );
        }

        return $at + strlen($wrapper[1]);
    }

    /** A reserved word is no loop or assignment name (GRM-7, GRM-17). */
    private function rejectReservedName(string $name, int $nameStart): void
    {
        if (isset(self::RESERVED[$name])) {
            throw $this->fail(
                ErrorCode::E_PARSE_RESERVED_NAME,
                $nameStart,
                $nameStart + strlen($name),
                "{$name} is a reserved word",
            );
        }
    }

    /**
     * A comment tag up to its terminator, which the AST keeps as a comment node (AST-9).
     *
     * @param Wrapper|null $wrapper
     */
    private function parseComment(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart): int
    {
        $terminator = '*' . $this->closeSequence($closeCount);
        $at = strpos($this->text, $terminator, $bodyStart);
        if ($at === false) {
            throw $this->fail(ErrorCode::E_PARSE_UNTERMINATED_COMMENT, $open, $open + 1, 'comment is not terminated');
        }
        $end = $this->finishTag($start, $wrapper, $at + strlen($terminator));
        // The value starts after the sigil `*` (AST-9).
        $valueStart = Scanner::skipHorizontalSpace($this->text, $open + 1) + 1;
        $this->comments[] = Ast::node(
            'Comment',
            ['value' => substr($this->text, $valueStart, $at - $valueStart)],
            $start,
            $end,
        );

        return $end;
    }

    /**
     * The head of a loop tag: the loop variable and the iterable, which opens a block.
     *
     * @param Wrapper|null $wrapper
     */
    private function parseLoop(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart): int
    {
        if (preg_match(self::LOOP_HEAD, substr($this->text, $bodyStart), $head) !== 1) {
            $at = Scanner::skipHorizontalSpace($this->text, $bodyStart);
            throw $this->fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, $at, $at + 1, 'loop requires "name = expression"');
        }
        $name = $head[1];
        $nameStart = $bodyStart + (int) strpos($head[0], $name);
        $this->rejectReservedName($name, $nameStart);
        $this->mark($nameStart, $nameStart + strlen($name), 'variable');
        $this->mark($bodyStart + strlen($head[0]) - 1, $bodyStart + strlen($head[0]), 'operator');
        $parser = $this->expressionParser($open, $closeCount, $bodyStart + strlen($head[0]));
        $iter = $parser->parseExpression();
        $end = $this->finishTag($start, $wrapper, $parser->expectClose());
        $node = [
            'type' => 'For',
            'name' => $name,
            'iter' => $iter,
            'body' => [],
            'empty' => null,
            'span' => [$start, $end],
        ];
        $this->openFrame($node, $start);

        return $end;
    }

    /**
     * An assignment tag: `=`, `+=` and the other compound forms, and `++` and `--`, as a Set node.
     *
     * @param Wrapper|null $wrapper
     */
    private function parseAssignment(int $start, int $open, int $closeCount, ?array $wrapper, int $bodyStart): int
    {
        if (preg_match(self::ASSIGN_HEAD, $this->text, $head, 0, $bodyStart) !== 1) {
            throw $this->fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, $bodyStart, $bodyStart + 1, 'unknown tag');
        }
        $name = $head[1];
        $operator = $head[2];
        $nameStart = $bodyStart + strpos($head[0], $name);
        $this->rejectReservedName($name, $nameStart);
        $variable = Ast::node('Var', ['name' => $name], $nameStart, $nameStart + strlen($name));
        $afterOperator = $bodyStart + strlen($head[0]);
        $this->mark($nameStart, $nameStart + strlen($name), 'variable');
        $this->mark($afterOperator - strlen($operator), $afterOperator, 'operator');
        if ($operator === '++' || $operator === '--') {
            $end = $this->finishTag($start, $wrapper, $this->expectCloseRaw($open, $closeCount, $afterOperator));
            $one = Ast::node('Literal', ['kind' => 'number', 'value' => 1.0], $afterOperator - 2, $afterOperator);
            $expr = Ast::node(
                'Binary',
                ['op' => $operator === '++' ? '+' : '-', 'left' => $variable, 'right' => $one],
                $bodyStart,
                $afterOperator,
            );
        } else {
            $parser = $this->expressionParser($open, $closeCount, $afterOperator);
            $value = $parser->parseExpression();
            $end = $this->finishTag($start, $wrapper, $parser->expectClose());
            $expr = $operator === '=' ? $value : Ast::node(
                'Binary',
                ['op' => $operator[0], 'left' => $variable, 'right' => $value],
                $bodyStart,
                $parser->lexer->consumedEnd(),
            );
        }
        $this->push(Ast::node('Set', ['name' => $name, 'expr' => $expr], $start, $end));

        return $end;
    }

    /**
     * @param Wrapper|null $wrapper
     */
    private function parseDirective(
        int $start,
        int $open,
        int $closeCount,
        ?array $wrapper,
        int $bodyStart,
        bool $firstTag,
    ): int {
        $invalid = fn (string $message): TemplateError => $this->fail(
            ErrorCode::E_PARSE_INVALID_DIRECTIVE,
            $start,
            $start + 1,
            $message,
        );
        if (!$firstTag || !$this->textBeforeFirstTagIsWhitespace) {
            throw $invalid('delimiter directive is not the first tag');
        }
        $index = Scanner::skipHorizontalSpace($this->text, $bodyStart);
        if (substr($this->text, $index, 9) !== 'delimiter') {
            throw $invalid('directive is not "delimiter"');
        }
        $this->mark($index, $index + 9, 'keyword');
        $index = Scanner::skipHorizontalSpace($this->text, $index + 9);
        $valueStart = $index;
        $value = '';
        $sequence = $this->closeSequence($closeCount);
        while (
            $index < strlen($this->text)
            && !Scanner::isHorizontalSpace($this->text[$index])
            && substr($this->text, $index, strlen($sequence)) !== $sequence
        ) {
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
        $this->mark($valueStart, $index, 'string');
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
                $nodes[] = Ast::node(
                    'Text',
                    ['value' => $value],
                    $pending[0]['start'],
                    $pending[count($pending) - 1]['end'],
                );
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
