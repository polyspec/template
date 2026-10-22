<?php
// EDT-9: the tags of the analysis are the accepted tags that the editors paint.

declare(strict_types=1);

namespace Polyspec\Template\Tests\Parser;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;

/**
 * Syntax analysis: the accepted tags with their kinds and body ranges, and the EDT-8 token of every part of a tag.
 */
final class AnalyzeTest extends TestCase
{
    public function testReturnsOnlyAcceptedTagsWithTheirKinds(): void
    {
        $source = '<style>.a { @media x { } }</style>{/re/.test(s)}{= title}{? ok}yes{:}no{/}';
        $result = AstProgram::analyze($source, 't.tpl');
        self::assertSame(
            [['{= title}', 'echo'], ['{? ok}', 'if'], ['{:}', 'else'], ['{/}', 'close']],
            array_map(
                static fn (array $tag): array => [
                    substr($source, $tag['start'], $tag['end'] - $tag['start']),
                    $tag['kind'],
                ],
                $result['tags'],
            ),
        );
        self::assertSame(['Text', 'Echo', 'If'], array_column($result['ast']['body'], 'type'));
        self::assertSame(
            [
                'delimiter {',
                'keyword =',
                'variable title',
                'delimiter }',
                'delimiter {',
                'keyword ?',
                'variable ok',
                'delimiter }',
                'delimiter {',
                'keyword :',
                'delimiter }',
                'delimiter {',
                'keyword /',
                'delimiter }',
            ],
            self::tokens($source, $result['tokens']),
        );
        self::assertSame(['= title', '? ok', ':', '/'], self::bodies($source, $result['tags']));
    }

    public function testGivesEachTagTheRangeOfItsBody(): void
    {
        $source = '<a href="{{= url }}">{* c *}';
        self::assertSame(['= url ', '* c *'], self::bodies($source, AstProgram::analyze($source, 't.tpl')['tags']));
    }

    /**
     * @return iterable<string, array{0: string, 1: list<string>}>
     */
    public static function tagKinds(): iterable
    {
        yield 'comment' => ['{* note *}', ['comment {* note *}']];
        yield 'echo' => [
            '{= (user.name ?? null) | upper(1, "x")}',
            [
                'delimiter {',
                'keyword =',
                'operator (',
                'variable user',
                'property .name',
                'operator ??',
                'keyword null',
                'operator )',
                'operator |',
                'function upper',
                'operator (',
                'number 1',
                'operator ,',
                'string "x"',
                'operator )',
                'delimiter }',
            ],
        ];
        yield 'for' => [
            '{@ item = items}{/}',
            [
                'delimiter {',
                'keyword @',
                'variable item',
                'operator =',
                'variable items',
                'delimiter }',
                'delimiter {',
                'keyword /',
                'delimiter }',
            ],
        ];
        yield 'assignment' => [
            '{: count += 1}',
            ['delimiter {', 'keyword :', 'variable count', 'operator +=', 'number 1', 'delimiter }'],
        ];
        yield 'increment' => [
            '{: count++}',
            ['delimiter {', 'keyword :', 'variable count', 'operator ++', 'delimiter }'],
        ];
        yield 'if' => [
            '{? a in b}{:? !c}{:}{/}',
            [
                'delimiter {',
                'keyword ?',
                'variable a',
                'keyword in',
                'variable b',
                'delimiter }',
                'delimiter {',
                'keyword :?',
                'operator !',
                'variable c',
                'delimiter }',
                'delimiter {',
                'keyword :',
                'delimiter }',
                'delimiter {',
                'keyword /',
                'delimiter }',
            ],
        ];
        yield 'ifblock' => [
            '{?# side}{/}',
            ['delimiter {', 'keyword ?#', 'variable side', 'delimiter }', 'delimiter {', 'keyword /', 'delimiter }'],
        ];
        yield 'include' => [
            '{+ parts/head.tpl}{+ "quoted.tpl"}',
            [
                'delimiter {',
                'keyword +',
                'path parts/head.tpl',
                'delimiter }',
                'delimiter {',
                'keyword +',
                'string "quoted.tpl"',
                'delimiter }',
            ],
        ];
        yield 'block' => [
            '{# card cards/card.tpl title:page.title x}',
            [
                'delimiter {',
                'keyword #',
                'path card',
                'path cards/card.tpl',
                'path title:page.title',
                'path x',
                'delimiter }',
            ],
        ];
        yield 'directive' => [
            '{% delimiter []}[= a]',
            [
                'delimiter {',
                'keyword %',
                'keyword delimiter',
                'string []',
                'delimiter }',
                'delimiter [',
                'keyword =',
                'variable a',
                'delimiter ]',
            ],
        ];
        yield 'wrapped' => ['<a href="{{= url }}">', ['delimiter "{{', 'keyword =', 'variable url', 'delimiter }}"']];
    }

    /**
     * @param list<string> $expected
     */
    /** FMT-1, GRM-2: every part of every form of a tag body is classified. */
    #[DataProvider('tagKinds')]
    public function testClassifiesEveryPartOfEveryTagKind(string $source, array $expected): void
    {
        self::assertSame($expected, self::tokens($source, AstProgram::analyze($source, 't.tpl')['tokens']));
    }

    public function testTokenOffsetsAreBytesAfterTheByteOrderMark(): void
    {
        $source = "\xEF\xBB\xBFé{= a}";
        self::assertSame(
            [[2, 3, 'delimiter'], [3, 4, 'keyword'], [5, 6, 'variable'], [6, 7, 'delimiter']],
            array_map(
                static fn (array $token): array => [$token['start'], $token['end'], $token['kind']],
                AstProgram::analyze($source, 't.tpl')['tokens'],
            ),
        );
    }

    public function testUsesTheDelimiterOption(): void
    {
        $source = '[? a]x[/]';
        self::assertSame(
            ['if', 'close'],
            array_column(AstProgram::analyze($source, 't.tpl', ['delimiters' => '[]'])['tags'], 'kind'),
        );
    }

    /**
     * @param list<array{start: int, end: int, kind: string}> $tokens
     * @return list<string>
     */
    private static function tokens(string $source, array $tokens): array
    {
        return array_map(
            static fn (array $token): string => $token['kind'] . ' ' . substr(
                $source,
                $token['start'],
                $token['end'] - $token['start'],
            ),
            $tokens,
        );
    }

    /**
     * @param list<array{bodyStart: int, bodyEnd: int}> $tags
     * @return list<string>
     */
    private static function bodies(string $source, array $tags): array
    {
        return array_map(
            static fn (array $tag): string => substr($source, $tag['bodyStart'], $tag['bodyEnd'] - $tag['bodyStart']),
            $tags,
        );
    }
}
