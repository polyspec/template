<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

use Polyspec\Template\Utf8;

/**
 * JSON text parser that preserves document order and applies the number rules of VAL-12.
 */
final class Json
{
    private int $index = 0;

    private function __construct(private readonly string $text)
    {
    }

    /**
     * Parses JSON bytes into a template value.
     */
    public static function parse(string $bytes): mixed
    {
        $invalid = Utf8::firstInvalid($bytes);
        if ($invalid >= 0) {
            throw new BindError('E_DATA_INVALID_UTF8', "invalid UTF-8 at byte {$invalid}");
        }
        $parser = new self($bytes);
        $value = $parser->parseValue();
        $parser->skipWhitespace();
        if ($parser->index < strlen($bytes)) {
            $parser->fail('unexpected character after the JSON value');
        }

        return $value;
    }

    private function fail(string $message): never
    {
        throw new JsonSyntaxError("{$message} at offset {$this->index}", $this->index);
    }

    private function skipWhitespace(): void
    {
        $length = strlen($this->text);
        while ($this->index < $length && strpos(" \t\n\r", $this->text[$this->index]) !== false) {
            $this->index++;
        }
    }

    private function parseValue(): mixed
    {
        $this->skipWhitespace();
        $char = $this->text[$this->index] ?? null;
        switch ($char) {
            case '{':
                return $this->parseObject();
            case '[':
                return $this->parseArray();
            case '"':
                return $this->parseString();
            case 't':
                return $this->parseWord('true', true);
            case 'f':
                return $this->parseWord('false', false);
            case 'n':
                return $this->parseWord('null', null);
            default:
                if ($char === '-' || ($char !== null && ctype_digit($char))) {
                    return $this->parseNumber();
                }
                $this->fail('unexpected character');
        }
    }

    private function parseWord(string $word, mixed $value): mixed
    {
        if (substr($this->text, $this->index, strlen($word)) === $word) {
            $this->index += strlen($word);

            return $value;
        }
        $this->fail("expected {$word}");
    }

    private function parseObject(): MapValue
    {
        $map = new MapValue();
        $this->index++;
        $this->skipWhitespace();
        if (($this->text[$this->index] ?? null) === '}') {
            $this->index++;

            return $map;
        }
        for (;;) {
            $this->skipWhitespace();
            if (($this->text[$this->index] ?? null) !== '"') {
                $this->fail('expected a string key');
            }
            $key = $this->parseString();
            $this->skipWhitespace();
            if (($this->text[$this->index] ?? null) !== ':') {
                $this->fail('expected ":"');
            }
            $this->index++;
            $map->set($key, $this->parseValue());
            $this->skipWhitespace();
            $next = $this->text[$this->index] ?? null;
            if ($next === ',') {
                $this->index++;
                continue;
            }
            if ($next === '}') {
                $this->index++;

                return $map;
            }
            $this->fail('expected "," or "}"');
        }
    }

    /**
     * @return list<mixed>
     */
    private function parseArray(): array
    {
        $list = [];
        $this->index++;
        $this->skipWhitespace();
        if (($this->text[$this->index] ?? null) === ']') {
            $this->index++;

            return $list;
        }
        for (;;) {
            $list[] = $this->parseValue();
            $this->skipWhitespace();
            $next = $this->text[$this->index] ?? null;
            if ($next === ',') {
                $this->index++;
                continue;
            }
            if ($next === ']') {
                $this->index++;

                return $list;
            }
            $this->fail('expected "," or "]"');
        }
    }

    private function parseString(): string
    {
        $this->index++;
        $result = '';
        $start = $this->index;
        $length = strlen($this->text);
        for (;;) {
            if ($this->index >= $length) {
                $this->fail('unterminated string');
            }
            $char = $this->text[$this->index];
            if ($char === '"') {
                $result .= substr($this->text, $start, $this->index - $start);
                $this->index++;

                return $result;
            }
            if ($char === '\\') {
                $result .= substr($this->text, $start, $this->index - $start);
                $this->index++;
                $escape = $this->text[$this->index] ?? null;
                switch ($escape) {
                    case '"':
                        $result .= '"';
                        break;
                    case '\\':
                        $result .= '\\';
                        break;
                    case '/':
                        $result .= '/';
                        break;
                    case 'b':
                        $result .= "\x08";
                        break;
                    case 'f':
                        $result .= "\x0C";
                        break;
                    case 'n':
                        $result .= "\n";
                        break;
                    case 'r':
                        $result .= "\r";
                        break;
                    case 't':
                        $result .= "\t";
                        break;
                    case 'u':
                        $result .= $this->parseUnicodeEscape();
                        break;
                    default:
                        $this->fail('invalid escape');
                }
                $this->index++;
                $start = $this->index;
                continue;
            }
            if (ord($char) < 0x20) {
                $this->fail('control character in string');
            }
            $this->index++;
        }
    }

    /**
     * Reads the four hexadecimal digits after \u (the index is at the u) and combines surrogate pairs.
     */
    private function parseUnicodeEscape(): string
    {
        $hex = substr($this->text, $this->index + 1, 4);
        if (preg_match('/^[0-9a-fA-F]{4}$/', $hex) !== 1) {
            $this->fail('invalid unicode escape');
        }
        $this->index += 4;
        $code = hexdec($hex);
        if ($code >= 0xD800 && $code <= 0xDBFF && substr($this->text, $this->index + 1, 2) === '\\u') {
            $low = substr($this->text, $this->index + 3, 4);
            if (preg_match('/^[0-9a-fA-F]{4}$/', $low) === 1) {
                $lowCode = hexdec($low);
                if ($lowCode >= 0xDC00 && $lowCode <= 0xDFFF) {
                    $this->index += 6;
                    $code = 0x10000 + (($code - 0xD800) << 10) + ($lowCode - 0xDC00);
                }
            }
        }

        return Utf8::chr((int) $code);
    }

    private function parseNumber(): float
    {
        if (preg_match('/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/', substr($this->text, $this->index), $m) !== 1) {
            $this->fail('invalid number');
        }
        $literal = $m[0];
        $this->index += strlen($literal);
        $value = (float) $literal;
        if (!is_finite($value)) {
            throw new BindError('E_DATA_NUMBER_NOT_FINITE', "number {$literal} is not finite");
        }
        $isIntegerLiteral = !isset($m[2]) && !isset($m[3]);
        if ($isIntegerLiteral && abs($value) > Number::MAX_SAFE) {
            throw new BindError('E_DATA_NUMBER_RANGE', "integer {$literal} is outside the safe range");
        }

        return $value;
    }
}
