<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * Expression spacing: joins the expression tokens of one tag with the separators of the formatting style.
 *
 * A token is its text and the EDT-8 class that the parser gives it.
 * @internal
 */
final class Expression
{
    /**
     * Joins expression tokens with the separators of the formatting style: one space around binary and ternary
     * operators, `|`, `=>` and `in`; one space after `,`; no space after `(`, `[`, `...` and unary `!` and `-`; no
     * space before `,`, `)`, `]` and accessors; no space between a function or method name and `(`, between an
     * operand and an index `[`, and around the `::` token of `Class::name`.
     *
     * @param list<array{text: string, kind: string}> $tokens
     */
    public static function join(array $tokens): string
    {
        if ($tokens === []) {
            return '';
        }
        $unary = [];
        foreach ($tokens as $index => $token) {
            $unary[$index] = $token['text'] === '!'
                || ($token['text'] === '-' && !self::endsOperand($tokens[$index - 1] ?? null));
        }
        $output = $tokens[0]['text'];
        for ($index = 1; $index < count($tokens); $index++) {
            $output .= self::separator(
                $tokens[$index - 1],
                $tokens[$index],
                $unary[$index - 1],
            ) . $tokens[$index]['text'];
        }

        return $output;
    }

    /**
     * A name that can be called or indexed: a variable or a function name, not a keyword.
     *
     * @param array{text: string, kind: string} $token
     */
    private static function isName(array $token): bool
    {
        return $token['kind'] === 'variable' || ($token['kind'] === 'function' && !str_starts_with(
            $token['text'],
            '.',
        ));
    }

    /**
     * DOT_IDENT and DOT_INDEX tokens (EXP-5), which stay adjacent to the token on their left.
     *
     * @param array{text: string, kind: string} $token
     */
    private static function isAccessor(array $token): bool
    {
        return $token['kind'] === 'property' || ($token['kind'] === 'function' && str_starts_with($token['text'], '.'));
    }

    /**
     * Whether the token can end an operand, so that a following `-` is binary and a following `[` is an index.
     *
     * @param array{text: string, kind: string}|null $token
     */
    private static function endsOperand(?array $token): bool
    {
        if ($token === null) {
            return false;
        }
        if ($token['text'] === ')' || $token['text'] === ']') {
            return true;
        }
        if ($token['kind'] === 'keyword') {
            return $token['text'] !== 'in';
        }

        return $token['kind'] !== 'operator';
    }

    /**
     * @param array{text: string, kind: string} $previous
     * @param array{text: string, kind: string} $current
     */
    private static function separator(array $previous, array $current, bool $previousUnary): string
    {
        if ($previous['text'] === '::' || $current['text'] === '::') {
            return '';
        }
        if (in_array($current['text'], [',', ')', ']'], true) || self::isAccessor($current)) {
            return '';
        }
        if (in_array($previous['text'], ['(', '[', '...'], true) || $previousUnary) {
            return '';
        }
        if ($current['text'] === '(') {
            return self::isName($previous) || self::isAccessor($previous) ? '' : ' ';
        }
        if ($current['text'] === '[') {
            return self::endsOperand($previous) ? '' : ' ';
        }

        return ' ';
    }
}
