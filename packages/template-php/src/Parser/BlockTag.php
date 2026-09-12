<?php

declare(strict_types=1);

namespace Polyspec\Template\Parser;

use Polyspec\Template\Ast;
use Polyspec\Template\Expr\Lexer;
use Polyspec\Template\Expr\Parser as ExpressionParser;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * Path tokens (GRM-3) and block tag bodies (GRM-13 to GRM-15).
 */
final class BlockTag
{
    private const PATH_CHARS = '/^[A-Za-z0-9_.\/-]$/';
    private const IDENT = '/^[A-Za-z_][A-Za-z0-9_]*$/';

    public function __construct(
        private readonly Source $source,
        private readonly string $template,
        private readonly string $close,
        private readonly int $closeCount,
    ) {
    }

    private function fail(string $code, int $start, int $end, string $message): TemplateError
    {
        return TemplateError::at($code, $this->template, $this->source->lines, $start, $end, $message);
    }

    private function atClose(int $index): bool
    {
        $sequence = str_repeat($this->close, $this->closeCount);

        return substr($this->source->text, $index, strlen($sequence)) === $sequence;
    }

    /**
     * Reads a quoted string or a run of path characters. Returns null at the close delimiter or end of input.
     *
     * @return array{kind: string, value: string, start: int, end: int}|null
     */
    private function readToken(int $index): ?array
    {
        $text = $this->source->text;
        $index = Scanner::skipHorizontalSpace($text, $index);
        if ($index >= strlen($text) || $this->atClose($index)) {
            return null;
        }
        $char = $text[$index];
        if ($char === '"' || $char === "'") {
            [$decoded, $end] = Lexer::stringLiteral($this->source, $index, $this->template);

            return ['kind' => 'path', 'value' => $decoded, 'start' => $index, 'end' => $end];
        }
        $end = $index;
        while ($end < strlen($text) && preg_match(self::PATH_CHARS, $text[$end]) === 1) {
            $end++;
        }
        $value = substr($text, $index, $end - $index);
        if (str_contains($value, '.') || str_contains($value, '/')) {
            return ['kind' => 'path', 'value' => $value, 'start' => $index, 'end' => $end];
        }
        if (preg_match(self::IDENT, $value) === 1) {
            return ['kind' => 'ident', 'value' => $value, 'start' => $index, 'end' => $end];
        }

        return ['kind' => 'ident', 'value' => '', 'start' => $index, 'end' => $index + 1];
    }

    /**
     * GRM-12: `+ path`.
     *
     * @return array{0: string, 1: int} path and the index after it
     */
    public function readIncludePath(int $index): array
    {
        $token = $this->readToken($index);
        if ($token === null || $token['value'] === '') {
            $at = Scanner::skipHorizontalSpace($this->source->text, $index);
            throw $this->fail('E_PARSE_INVALID_PATH', $at, $at + 1, 'include requires a path');
        }
        if ($token['kind'] !== 'path') {
            throw $this->fail('E_PARSE_INVALID_PATH', $token['start'], $token['end'], json_encode($token['value']) . ' is not a path');
        }

        return [$token['value'], $token['end']];
    }

    /**
     * GRM-13 to GRM-15: `# [id] [path] {scope_item}`.
     *
     * @return array{id: string|null, path: string|null, scope: list<array{name: string, expr: array<string, mixed>}>, end: int}
     */
    public function readBlockBody(int $index): array
    {
        $text = $this->source->text;
        $id = null;
        $path = null;
        $scope = [];
        $cursor = $index;
        $token = $this->readToken($cursor);
        if ($token === null || $token['value'] === '') {
            $at = Scanner::skipHorizontalSpace($text, $cursor);
            throw $this->fail('E_PARSE_INVALID_BLOCK_TAG', $at, $at + 1, 'block tag requires an identifier or a path');
        }
        if ($token['kind'] === 'path') {
            $path = $token['value'];
            $cursor = $token['end'];
        } else {
            $id = $token['value'];
            $cursor = $token['end'];
            $token = $this->readToken($cursor);
            if ($token !== null && $token['kind'] === 'path') {
                $path = $token['value'];
                $cursor = $token['end'];
            }
        }
        for (;;) {
            $token = $this->readToken($cursor);
            if ($token === null) {
                break;
            }
            if ($token['kind'] !== 'ident' || $token['value'] === '') {
                throw $this->fail('E_PARSE_INVALID_BLOCK_TAG', $token['start'], $token['end'], 'unexpected ' . json_encode(substr($text, $token['start'], $token['end'] - $token['start'])) . ' in block tag');
            }
            $cursor = $token['end'];
            if (($text[$cursor] ?? '') === ':') {
                $valueStart = $cursor + 1;
                if ($valueStart >= strlen($text) || Scanner::isHorizontalSpace($text[$valueStart])) {
                    throw $this->fail('E_PARSE_INVALID_BLOCK_TAG', $cursor, $cursor + 1, 'scope item requires a value after ":"');
                }
                $parser = new ExpressionParser($this->source, $valueStart, $this->close, $this->closeCount, null, $this->template);
                $scope[] = ['name' => $token['value'], 'expr' => $parser->parsePostfix(true)];
                $cursor = $parser->end();
            } else {
                $scope[] = ['name' => $token['value'], 'expr' => Ast::variable($token['value'], $token['start'], $token['end'])];
            }
        }

        return ['id' => $id, 'path' => $path, 'scope' => $scope, 'end' => $cursor];
    }
}
