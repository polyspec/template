<?php

declare(strict_types=1);

namespace Polyspec\Template\Expr;

use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Utf8;

/**
 * Expression tokens as defined in EXP-1 to EXP-6 and CNF-13.
 */
final class Lexer
{
    private const OPERATORS = [
        '===' => 'SEQ', '!==' => 'SNE', '...' => 'SPREAD',
        '==' => 'EQ', '!=' => 'NE', '<=' => 'LE', '>=' => 'GE', '&&' => 'AND', '||' => 'OR',
        '??' => 'COALESCE', '?:' => 'ELVIS', '=>' => 'ARROW',
        '(' => 'LPAREN', ')' => 'RPAREN', '[' => 'LBRACKET', ']' => 'RBRACKET', ',' => 'COMMA',
        '|' => 'PIPE', '?' => 'QUESTION', ':' => 'COLON', '+' => 'PLUS', '-' => 'MINUS',
        '*' => 'STAR', '/' => 'SLASH', '%' => 'PERCENT', '!' => 'BANG', '<' => 'LT', '>' => 'GT',
    ];

    private const EXPRESSION_CHARS = '()[],|?:=>.+-*/%!<&\'"';

    private const POSTFIX_END = ['IDENT' => true, 'NUMBER' => true, 'STRING' => true, 'NULL' => true, 'TRUE' => true, 'FALSE' => true, 'RPAREN' => true, 'RBRACKET' => true, 'DOT_IDENT' => true, 'DOT_INDEX' => true];

    private int $index;
    private ?Token $previous = null;
    private ?Token $lookahead = null;
    private int $nestingDepth = 0;
    private readonly bool $closeIsExpressionChar;

    /**
     * @param string|null $close close delimiter character, or null for a bare expression
     * @param int|null $openIndex byte index of the tag start, or null for a bare expression
     */
    public function __construct(
        private readonly Source $source,
        int $start,
        public readonly ?string $close,
        public readonly int $closeCount,
        public readonly ?int $openIndex,
        private readonly string $template,
    ) {
        $this->index = $start;
        $this->closeIsExpressionChar = $close !== null && str_contains(self::EXPRESSION_CHARS, $close);
    }

    public function error(string $code, int $start, int $end, string $message): TemplateError
    {
        return TemplateError::at($code, $this->template, $this->source->lines, $start, $end, $message);
    }

    public function peek(): Token
    {
        if ($this->lookahead === null) {
            $this->lookahead = $this->read();
        }

        return $this->lookahead;
    }

    public function next(): Token
    {
        $token = $this->peek();
        $this->lookahead = null;
        $this->previous = $token;
        if ($token->type === 'LPAREN' || $token->type === 'LBRACKET') {
            $this->nestingDepth++;
        }
        if ($token->type === 'RPAREN' || $token->type === 'RBRACKET') {
            $this->nestingDepth--;
        }

        return $token;
    }

    /**
     * Byte index after the last consumed token.
     */
    public function consumedEnd(): int
    {
        return $this->previous !== null ? $this->previous->end : $this->index;
    }

    public function text(): string
    {
        return $this->source->text;
    }

    /**
     * Reads a string literal starting at the quote at $start (EXP-3).
     *
     * @return array{0: string, 1: int} decoded text and the index after the closing quote
     */
    public static function stringLiteral(Source $source, int $start, string $template): array
    {
        $text = $source->text;
        $length = strlen($text);
        $quote = $text[$start];
        $decoded = '';
        $index = $start + 1;
        for (;;) {
            if ($index >= $length) {
                throw TemplateError::at('E_PARSE_UNTERMINATED_STRING', $template, $source->lines, $start, $start + 1, 'string literal is not terminated');
            }
            $char = $text[$index];
            if ($char === $quote) {
                return [$decoded, $index + 1];
            }
            if ($char !== '\\') {
                $decoded .= $char;
                $index++;
                continue;
            }
            $escape = $text[$index + 1] ?? null;
            switch ($escape) {
                case '\\':
                    $decoded .= '\\';
                    $index += 2;
                    break;
                case "'":
                    $decoded .= "'";
                    $index += 2;
                    break;
                case '"':
                    $decoded .= '"';
                    $index += 2;
                    break;
                case 'n':
                    $decoded .= "\n";
                    $index += 2;
                    break;
                case 'r':
                    $decoded .= "\r";
                    $index += 2;
                    break;
                case 't':
                    $decoded .= "\t";
                    $index += 2;
                    break;
                case 'u':
                    $hex = substr($text, $index + 2, 4);
                    if (preg_match('/^[0-9a-fA-F]{4}$/', $hex) !== 1) {
                        throw TemplateError::at('E_PARSE_INVALID_ESCAPE', $template, $source->lines, $index, $index + 2, 'invalid escape sequence');
                    }
                    $code = (int) hexdec($hex);
                    $index += 6;
                    if ($code >= 0xD800 && $code <= 0xDBFF && substr($text, $index, 2) === '\\u') {
                        $low = substr($text, $index + 2, 4);
                        if (preg_match('/^[0-9a-fA-F]{4}$/', $low) === 1) {
                            $lowCode = (int) hexdec($low);
                            if ($lowCode >= 0xDC00 && $lowCode <= 0xDFFF) {
                                $code = 0x10000 + (($code - 0xD800) << 10) + ($lowCode - 0xDC00);
                                $index += 6;
                            }
                        }
                    }
                    $decoded .= Utf8::chr($code);
                    break;
                default:
                    throw TemplateError::at('E_PARSE_INVALID_ESCAPE', $template, $source->lines, $index, $index + 2, 'invalid escape sequence');
            }
        }
    }

    private static function isIdentStart(string $char): bool
    {
        return ctype_alpha($char) || $char === '_';
    }

    private static function isIdentPart(string $char): bool
    {
        return ctype_alnum($char) || $char === '_';
    }

    private function read(): Token
    {
        $text = $this->source->text;
        $length = strlen($text);
        while ($this->index < $length && strpos(" \t\r\n", $text[$this->index]) !== false) {
            $this->index++;
        }
        $start = $this->index;
        if ($start >= $length) {
            return new Token('EOF', '', $start, $start);
        }

        if ($this->close !== null && (($this->previous !== null && isset(self::POSTFIX_END[$this->previous->type]) && $this->nestingDepth === 0) || !$this->closeIsExpressionChar)) {
            $sequence = str_repeat($this->close, $this->closeCount);
            if (substr($text, $start, strlen($sequence)) === $sequence) {
                $this->index = $start + strlen($sequence);

                return new Token('CLOSE', $sequence, $start, $this->index);
            }
        }

        $char = $text[$start];
        if (self::isIdentStart($char)) {
            $end = $start + 1;
            while ($end < $length && self::isIdentPart($text[$end])) {
                $end++;
            }
            $this->index = $end;
            $value = substr($text, $start, $end - $start);
            $type = match ($value) {
                'null' => 'NULL',
                'true' => 'TRUE',
                'false' => 'FALSE',
                'in' => 'IN',
                default => 'IDENT',
            };

            return new Token($type, $value, $start, $end);
        }
        if (ctype_digit($char)) {
            return $this->readNumber($start);
        }
        if ($char === '"' || $char === "'") {
            [$decoded, $end] = self::stringLiteral($this->source, $start, $this->template);
            $this->index = $end;

            return new Token('STRING', substr($text, $start, $end - $start), $start, $end, $decoded);
        }
        if ($char === '.') {
            return $this->readDot($start);
        }
        foreach (self::OPERATORS as $operator => $type) {
            if (substr($text, $start, strlen($operator)) === $operator) {
                $this->index = $start + strlen($operator);

                return new Token($type, $operator, $start, $this->index);
            }
        }

        throw $this->error('E_PARSE_UNEXPECTED_TOKEN', $start, $start + 1, 'unexpected character ' . json_encode($char));
    }

    private function readNumber(int $start): Token
    {
        $text = $this->source->text;
        $length = strlen($text);
        $end = $start;
        while ($end < $length && ctype_digit($text[$end])) {
            $end++;
        }
        if (($text[$end] ?? '') === '.' && $end + 1 < $length && ctype_digit($text[$end + 1])) {
            $end++;
            while ($end < $length && ctype_digit($text[$end])) {
                $end++;
            }
        }
        if (($text[$end] ?? '') === 'e' || ($text[$end] ?? '') === 'E') {
            $cursor = $end + 1;
            if (($text[$cursor] ?? '') === '+' || ($text[$cursor] ?? '') === '-') {
                $cursor++;
            }
            if ($cursor < $length && ctype_digit($text[$cursor])) {
                while ($cursor < $length && ctype_digit($text[$cursor])) {
                    $cursor++;
                }
                $end = $cursor;
            } else {
                throw $this->error('E_PARSE_INVALID_NUMBER', $start, $cursor, 'invalid number ' . json_encode(substr($text, $start, $cursor - $start)));
            }
        }
        $following = $text[$end] ?? '';
        $closeAtEnd = $this->close !== null && $this->nestingDepth === 0 && substr($text, $end, strlen($this->close)) === $this->close;
        if ($end < $length && (self::isIdentPart($following) || ($following === '.' && !$closeAtEnd))) {
            $cursor = $end + 1;
            while ($cursor < $length && (self::isIdentPart($text[$cursor]) || $text[$cursor] === '.')) {
                $cursor++;
            }
            throw $this->error('E_PARSE_INVALID_NUMBER', $start, $cursor, 'invalid number ' . json_encode(substr($text, $start, $cursor - $start)));
        }
        $this->index = $end;

        return new Token('NUMBER', substr($text, $start, $end - $start), $start, $end);
    }

    private function readDot(int $start): Token
    {
        $text = $this->source->text;
        $length = strlen($text);
        if (substr($text, $start, 3) === '...') {
            $this->index = $start + 3;

            return new Token('SPREAD', '...', $start, $this->index);
        }
        $next = $text[$start + 1] ?? '';
        $adjacent = $this->previous !== null && $this->previous->end === $start && isset(self::POSTFIX_END[$this->previous->type]);
        if ($adjacent && $next !== '' && self::isIdentStart($next)) {
            $end = $start + 2;
            while ($end < $length && self::isIdentPart($text[$end])) {
                $end++;
            }
            $this->index = $end;

            return new Token('DOT_IDENT', substr($text, $start, $end - $start), $start, $end);
        }
        if ($adjacent && $next !== '' && ctype_digit($next)) {
            $end = $start + 2;
            while ($end < $length && ctype_digit($text[$end])) {
                $end++;
            }
            $this->index = $end;

            return new Token('DOT_INDEX', substr($text, $start, $end - $start), $start, $end);
        }
        if ($next !== '' && ctype_digit($next)) {
            $end = $start + 1;
            while ($end < $length && (self::isIdentPart($text[$end]) || $text[$end] === '.')) {
                $end++;
            }
            throw $this->error('E_PARSE_INVALID_NUMBER', $start, $end, 'invalid number ' . json_encode(substr($text, $start, $end - $start)));
        }

        throw $this->error('E_PARSE_UNEXPECTED_TOKEN', $start, $start + 1, 'unexpected "."');
    }
}
