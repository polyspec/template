<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * Tag body formatting: writes the body of each tag kind in the formatting style (GRM-2).
 */
final class Body
{
    private const WHITESPACE = '/^[ \t\r\n]*$/';

    // The characters that JavaScript's String.prototype.trim removes: WhiteSpace and LineTerminator of ECMA-262.
    private const TRIM = '/^[\t\n\v\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+|[\t\n\v\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+$/u';

    /**
     * Returns the formatted body of a tag, or null when the tag is kept as written: comments, directives, bodies that
     * contain a line terminator and bodies whose expression tokens do not cover every non-whitespace character.
     *
     * @param list<array{start: int, end: int, kind: string}> $tokens the tokens inside the body, its sigil first
     */
    public static function format(string $kind, string $source, int $bodyStart, int $bodyEnd, array $tokens): ?string
    {
        $body = substr($source, $bodyStart, $bodyEnd - $bodyStart);
        if (strpbrk($body, "\r\n") !== false || $kind === 'comment' || $kind === 'directive') {
            return null;
        }
        $sigil = $tokens[0];
        $rest = array_slice($tokens, 1);
        $text = static fn (array $token): string => substr($source, $token['start'], $token['end'] - $token['start']);
        $after = (string) preg_replace(self::TRIM, '', substr($source, $sigil['end'], $bodyEnd - $sigil['end']));
        $input = ['source' => $source, 'bodyEnd' => $bodyEnd];

        switch ($kind) {
            case 'echo':
                return self::withRest('=', self::expressionText($input, $rest, $sigil['end']));
            case 'if':
                return self::withRest('?', self::expressionText($input, $rest, $sigil['end']));
            case 'elseif':
                return self::withRest(':?', self::expressionText($input, $rest, $sigil['end']));
            case 'else':
                return ':';
            case 'close':
                return '/';
            case 'ifblock':
                return self::withRest('?#', $after);
            case 'include':
                return self::withRest('+', $after);
            case 'block':
                return self::withRest('#', implode(' ', self::words($after)));
            case 'for':
                // The loop variable and its `=`, then the iterated expression.
                [$name, $equals] = $rest;
                $iter = self::expressionText($input, array_slice($rest, 2), $equals['end']);

                return $iter === null ? null : '@ ' . $text($name) . ' = ' . $iter;
            case 'assignment':
                // The assigned name and its operator, then the value unless the operator is `++` or `--`.
                [$name, $operator] = $rest;
                if (count($rest) === 2) {
                    return preg_match(self::WHITESPACE, substr($source, $operator['end'], $bodyEnd - $operator['end'])) === 1 ? ':' . $text($name) . $text($operator) : null;
                }
                $value = self::expressionText($input, array_slice($rest, 2), $operator['end']);

                return $value === null ? null : ':' . $text($name) . ' ' . $text($operator) . ' ' . $value;
            default:
                throw new \LogicException("unknown tag kind {$kind}");
        }
    }

    private static function withRest(string $sigil, ?string $rest): ?string
    {
        if ($rest === null) {
            return null;
        }

        return $rest === '' ? $sigil : "{$sigil} {$rest}";
    }

    /**
     * Joins the expression tokens that start at $from. Returns null when anything other than whitespace lies between
     * them.
     *
     * @param array{source: string, bodyEnd: int} $input
     * @param list<array{start: int, end: int, kind: string}> $tokens
     */
    private static function expressionText(array $input, array $tokens, int $from): ?string
    {
        $source = $input['source'];
        $cursor = $from;
        $joined = [];
        foreach ($tokens as $token) {
            if (preg_match(self::WHITESPACE, substr($source, $cursor, $token['start'] - $cursor)) !== 1) {
                return null;
            }
            $joined[] = ['text' => substr($source, $token['start'], $token['end'] - $token['start']), 'kind' => $token['kind']];
            $cursor = $token['end'];
        }
        if (preg_match(self::WHITESPACE, substr($source, $cursor, $input['bodyEnd'] - $cursor)) !== 1 || $joined === []) {
            return null;
        }

        return Expression::join($joined);
    }

    /**
     * Splits a block tag body at horizontal whitespace outside string literals.
     *
     * @return list<string>
     */
    private static function words(string $text): array
    {
        $result = [];
        $current = '';
        $quote = null;
        $length = strlen($text);
        for ($index = 0; $index < $length; $index++) {
            $char = $text[$index];
            if ($quote !== null) {
                $current .= $char;
                if ($char === '\\') {
                    $current .= $text[$index + 1] ?? '';
                    $index++;
                } elseif ($char === $quote) {
                    $quote = null;
                }
                continue;
            }
            if ($char === ' ' || $char === "\t") {
                if ($current !== '') {
                    $result[] = $current;
                }
                $current = '';
                continue;
            }
            if ($char === '"' || $char === "'") {
                $quote = $char;
            }
            $current .= $char;
        }
        if ($current !== '') {
            $result[] = $current;
        }

        return $result;
    }
}
