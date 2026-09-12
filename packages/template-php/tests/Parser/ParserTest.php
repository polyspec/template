<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Parser;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Engine;
use Polyspec\Template\TemplateError;

/**
 * Parser behavior that the fixtures do not cover directly.
 */
final class ParserTest extends TestCase
{
    private static function codeOf(callable $fn): ?string
    {
        try {
            $fn();

            return null;
        } catch (TemplateError $error) {
            return $error->errorCode;
        }
    }

    public function testJavascriptAndCssBracesStayText(): void
    {
        $ast = Engine::parse('{/* c */}{/re/.test(s)}.a { @media x { } }{ x = 1 }', 't.tpl');
        self::assertCount(1, $ast['body']);
        self::assertSame('Text', $ast['body'][0]['type']);
    }

    public function testSigilFormsStartTags(): void
    {
        $ast = Engine::parse('{= a}{@ i = xs}{/}{? a}{:}{/}', 't.tpl');
        self::assertSame(['Echo', 'For', 'If'], array_column($ast['body'], 'type'));
    }

    public function testDelimitersOptionAndDirective(): void
    {
        self::assertSame('Echo', Engine::parse(';= a;', 't.tpl', ['delimiters' => ';;'])['body'][0]['type']);
        $ast = Engine::parse("{% delimiter [] }\n[= a[0]]\n", 't.tpl');
        self::assertSame(['Echo', 'Text'], array_column($ast['body'], 'type'));
        self::assertSame('E_PARSE_INVALID_DIRECTIVE', self::codeOf(static fn () => Engine::parse('{= a}{% delimiter ;;}', 't.tpl')));
        self::assertSame('E_PARSE_INVALID_DIRECTIVE', self::codeOf(static fn () => Engine::parse('{% delimiter ab}', 't.tpl')));
    }

    public function testBlockStructureErrors(): void
    {
        self::assertSame('E_PARSE_UNEXPECTED_CLOSE', self::codeOf(static fn () => Engine::parse('{/}', 't.tpl')));
        self::assertSame('E_PARSE_UNCLOSED_BLOCK', self::codeOf(static fn () => Engine::parse('{? a}', 't.tpl')));
        self::assertSame('E_PARSE_ELSE_OUTSIDE_BLOCK', self::codeOf(static fn () => Engine::parse('{:}', 't.tpl')));
        self::assertSame('E_PARSE_DUPLICATE_ELSE', self::codeOf(static fn () => Engine::parse('{? a}{:}{:}{/}', 't.tpl')));
        self::assertSame('E_PARSE_ELSEIF_AFTER_ELSE', self::codeOf(static fn () => Engine::parse('{? a}{:}{:? b}{/}', 't.tpl')));
        self::assertSame('E_PARSE_ELSEIF_NOT_IN_IF', self::codeOf(static fn () => Engine::parse('{?# a}{:? b}{/}', 't.tpl')));
    }

    public function testSpansCountBytes(): void
    {
        $ast = Engine::parse('é{= a}', 't.tpl');
        self::assertSame([2, 7], $ast['body'][1]['span']);
    }
}
