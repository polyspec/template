<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\Expression;
use Polyspec\Template\Format\FormatError;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\Invariant;

/**
 * The value classes and the helpers of the formatter of the library as the extension registers them: a result holds
 * the text or the error of a format, the expression tokens of a tag join with the separators of the style, and two
 * trees are the same template when they are equal without spans.
 */
final class FormatClassesTest extends TestCase
{
    public function testTheExtensionRegistersTheFormatHelpers(): void
    {
        foreach ([FormatError::class, FormatResult::class, Expression::class, Invariant::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
    }

    public function testAResultHoldsTheTextOrTheErrorOfAFormat(): void
    {
        $error = new FormatError('parse', 'E_PARSE_UNCLOSED_TAG', 2, 5, 'tag is not closed');
        $this->assertSame(
            [
                'reason' => 'parse',
                'code' => 'E_PARSE_UNCLOSED_TAG',
                'line' => 2,
                'col' => 5,
                'message' => 'tag is not closed',
            ],
            $error->toArray(),
        );

        $text = FormatResult::text('a', true);
        $this->assertSame(['a', true, null], [$text->text, $text->changed, $text->error]);
        $failed = FormatResult::error($error);
        $this->assertSame([null, false, $error], [$failed->text, $failed->changed, $failed->error]);

        $this->expectException(\Error::class);
        (static function (object $value): void {
            $value->text = 'b';
        })($text);
    }

    public function testTheTokensOfAnExpressionJoinWithTheSeparatorsOfTheStyle(): void
    {
        $this->assertSame('-a - f(x, !y).k[0] | upper', Expression::join(self::tokens([
            ['-', 'operator'], ['a', 'variable'], ['-', 'operator'], ['f', 'function'], ['(', 'punctuation'],
            ['x', 'variable'], [',', 'punctuation'], ['!', 'operator'], ['y', 'variable'], [')', 'punctuation'],
            ['.k', 'property'], ['[', 'punctuation'], ['0', 'number'], [']', 'punctuation'], ['|', 'operator'],
            ['upper', 'function'],
        ])));
        $this->assertSame('x in [...a] ? C::n :.m()', Expression::join(self::tokens([
            ['x', 'variable'], ['in', 'keyword'], ['[', 'punctuation'], ['...', 'operator'], ['a', 'variable'],
            [']', 'punctuation'], ['?', 'operator'], ['C', 'variable'], ['::', 'operator'], ['n', 'variable'],
            [':', 'operator'], ['.m', 'function'], ['(', 'punctuation'], [')', 'punctuation'],
        ])));
        $this->assertSame('', Expression::join([]));
    }

    public function testTwoTreesAreTheSameTemplateWithoutSpans(): void
    {
        $this->assertSame(
            [3 => ['type' => 'Text', 'value' => 'a'], 7 => 'x'],
            Invariant::withoutSpans([3 => ['type' => 'Text', 'span' => [0, 1], 'value' => 'a'], 7 => 'x', 'span' => 1]),
        );
        $this->assertSame(
            ['body' => [['k' => 1]]],
            Invariant::withoutSpans(['span' => [0, 1], 'body' => [['span' => [1, 2], 'k' => 1]]]),
        );
        $this->assertSame(
            ['type' => 'Template', 'body' => [
                ['type' => 'Text', 'value' => "a\nb\nc  "],
                ['type' => 'Echo', 'value' => '  x'],
            ]],
            Invariant::withoutLineIndentation(['type' => 'Template', 'body' => [
                ['type' => 'Text', 'value' => "  a\n\t b\nc  "],
                ['type' => 'Text', 'value' => "  \t"],
                ['type' => 'Echo', 'value' => '  x'],
            ]]),
        );
        $this->assertSame([true, false, true, false, false], [
            Invariant::sameTree(['a' => 1, 'b' => [1, 2], 'span' => [0, 1]], ['b' => [1, 2], 'a' => 1]),
            Invariant::sameTree([1, 2], [2, 1]),
            Invariant::sameTree([1, 2], ['0' => 1, '1' => 2]),
            Invariant::sameTree(['a' => 1.0], ['a' => 1]),
            Invariant::sameTree([0 => 'a'], [1 => 'a']),
        ]);
    }

    /**
     * @param list<array{0: string, 1: string}> $pairs
     * @return list<array{text: string, kind: string}>
     */
    private static function tokens(array $pairs): array
    {
        return array_map(static fn (array $pair): array => ['text' => $pair[0], 'kind' => $pair[1]], $pairs);
    }
}
