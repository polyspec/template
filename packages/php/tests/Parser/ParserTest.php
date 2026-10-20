<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Parser;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Parser\BlockTag;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Source;
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
        $ast = AstProgram::parse('{/* c */}{/re/.test(s)}.a { @media x { } }{ x = 1 }', 't.tpl');
        self::assertCount(1, $ast['body']);
        self::assertSame('Text', $ast['body'][0]['type']);
    }

    public function testSigilFormsStartTags(): void
    {
        $ast = AstProgram::parse('{= a}{@ i = xs}{/}{? a}{:}{/}', 't.tpl');
        self::assertSame(['Echo', 'For', 'If'], array_column($ast['body'], 'type'));
    }

    /** LEX-22: the option selects the delimiters; LEX-23: a directive selects them for the rest of the file, only first. */
    public function testDelimitersOptionAndDirective(): void
    {
        self::assertSame('Echo', AstProgram::parse(';= a;', 't.tpl', ['delimiters' => ';;'])['body'][0]['type']);
        $ast = AstProgram::parse("{% delimiter [] }\n[= a[0]]\n", 't.tpl');
        self::assertSame(['Echo', 'Text'], array_column($ast['body'], 'type'));
        self::assertSame(
            'E_PARSE_INVALID_DIRECTIVE',
            self::codeOf(static fn () => AstProgram::parse('{= a}{% delimiter ;;}', 't.tpl')),
        );
        self::assertSame(
            'E_PARSE_INVALID_DIRECTIVE',
            self::codeOf(static fn () => AstProgram::parse('{% delimiter ab}', 't.tpl')),
        );
    }

    /**
     * LEX-21, LEX-22: a delimiter option is a string of two delimiter characters.
     * A delimiter option that is not a delimiter pair is the argument error of PHP, not an ERR-1 error (ERR-13).
     */
    public function testAnInvalidDelimiterOptionIsAnArgumentError(): void
    {
        $runs = [
            static fn () => AstProgram::parse('x', 't.tpl', ['delimiters' => '[']),
            static fn () => new AstProgram(null, ['delimiters' => '[[[']),
        ];
        foreach ($runs as $run) {
            try {
                $run();
                self::fail('no argument error');
            } catch (\InvalidArgumentException $error) {
                self::assertStringContainsString('is not a delimiter pair', $error->getMessage());
            }
        }
    }

    public function testBlockStructureErrors(): void
    {
        self::assertSame('E_PARSE_UNEXPECTED_CLOSE', self::codeOf(static fn () => AstProgram::parse('{/}', 't.tpl')));
        self::assertSame('E_PARSE_UNCLOSED_BLOCK', self::codeOf(static fn () => AstProgram::parse('{? a}', 't.tpl')));
        self::assertSame('E_PARSE_ELSE_OUTSIDE_BLOCK', self::codeOf(static fn () => AstProgram::parse('{:}', 't.tpl')));
        self::assertSame(
            'E_PARSE_DUPLICATE_ELSE',
            self::codeOf(static fn () => AstProgram::parse('{? a}{:}{:}{/}', 't.tpl')),
        );
        self::assertSame(
            'E_PARSE_ELSEIF_AFTER_ELSE',
            self::codeOf(static fn () => AstProgram::parse('{? a}{:}{:? b}{/}', 't.tpl')),
        );
        self::assertSame(
            'E_PARSE_ELSEIF_NOT_IN_IF',
            self::codeOf(static fn () => AstProgram::parse('{?# a}{:? b}{/}', 't.tpl')),
        );
    }

    /** AST-2, LEX-16: a span counts UTF-8 bytes. */
    public function testSpansCountBytes(): void
    {
        $ast = AstProgram::parse('é{= a}', 't.tpl');
        self::assertSame([2, 7], $ast['body'][1]['span']);
    }

    /** ERR-1: a parse error is a TemplateError with the fields code, template, line, col, offset, end and message, in that order. */
    public function testAParseErrorIsTheErrorObject(): void
    {
        try {
            AstProgram::parse("a\n{? x}", 'x.tpl');
            self::fail('the parse did not fail');
        } catch (TemplateError $error) {
            $object = $error->toArray();
            self::assertSame(['code', 'template', 'line', 'col', 'offset', 'end', 'message'], array_keys($object));
            self::assertSame(['E_PARSE_UNCLOSED_BLOCK', 'x.tpl', 2, 1, 2, 3], array_slice(array_values($object), 0, 6));
            self::assertNotSame('', $object['message']);
        }
    }

    /** A delimiter that is not exactly one byte is a ValueError of the entry or the constructor that receives it. */
    public function testADelimiterThatIsNotOneByteIsAValueError(): void
    {
        $source = Source::fromBytes('t.tpl', 'a');
        $cases = [
            [
                'Polyspec\Template\Parser\Parser::parse(): Argument #2 ($open) must be a single character',
                static fn () => Parser::parse($source, '{{', '}'),
            ],
            [
                'Polyspec\Template\Parser\Parser::analyze(): Argument #3 ($close) must be a single character',
                static fn () => Parser::analyze($source, '{', ''),
            ],
            [
                'Polyspec\Template\Parser\Parser::__construct(): Argument #3 ($close) must be a single character',
                static fn () => new Parser($source, '[', ']]'),
            ],
            [
                'Polyspec\Template\Parser\BlockTag::__construct(): Argument #3 ($close) must be a single character',
                static fn () => new BlockTag($source, 't.tpl', '}}', 1),
            ],
        ];
        foreach ($cases as [$message, $call]) {
            try {
                $call();
                $this->fail($message . ' expected');
            } catch (\ValueError $error) {
                self::assertSame($message, $error->getMessage());
            }
        }
    }
}
