<?php
// FMT-16: the published formatter accepts options and returns its success/failure result.

declare(strict_types=1);

namespace Polyspec\Template\Tests\Format;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\Formatter;
use Polyspec\Template\Format\Invariant;
use Polyspec\Template\Tests\Support;

/**
 * Expected formatter output, idempotence and error results, with the fixtures of the TypeScript formatter.
 */
final class FormatterTest extends TestCase
{
    public static function text(FormatResult $result): string
    {
        if ($result->error !== null) {
            self::fail('format failed: ' . json_encode((array) $result->error, JSON_THROW_ON_ERROR));
        }

        return (string) $result->text;
    }

    /**
     * @return iterable<string, array{0: string, 1: string}>
     */
    public static function fixtures(): iterable
    {
        $root = Support::repoRoot() . '/packages/language/tests/fixtures';
        $names = array_values(
            array_filter(
                Support::entries("{$root}/input"),
                static fn (string $name): bool => str_ends_with($name, '.tpl'),
            ),
        );
        foreach ($names as $name) {
            yield $name => [Support::read("{$root}/input/{$name}"), Support::read("{$root}/expected/{$name}")];
        }
    }

    #[DataProvider('fixtures')]
    public function testFormatsTheFixture(string $input, string $expected): void
    {
        $once = self::text(Formatter::format($input));
        self::assertSame($expected, $once);
        self::assertEquals(new FormatResult($once, false, null), Formatter::format($once));
    }

    /**
     * FMT-14: when nothing changes, the text is the source.
     */
    public function testReportsAnUnchangedSource(): void
    {
        self::assertEquals(new FormatResult('<p>{= a}</p>', false, null), Formatter::format('<p>{= a}</p>'));
    }

    public function testKeepsAByteOrderMarkAndCrlf(): void
    {
        $source = "\u{FEFF}<ul>\r\n{@ x=xs}\r\n<li>{=x}</li>\r\n{/}\r\n</ul>\r\n";
        self::assertSame(
            "\u{FEFF}<ul>\r\n  {@ x = xs}\r\n    <li>{= x}</li>\r\n  {/}\r\n</ul>\r\n",
            self::text(Formatter::format($source)),
        );
    }

    public function testFormatsOnlyTheTagsInsideARange(): void
    {
        self::assertSame(
            '{=a}{= b}{=c}',
            self::text(Formatter::format('{=a}{=b}{=c}', ['range' => ['start' => 4, 'end' => 8]])),
        );
    }

    /**
     * FMT-8, LEX-22, LEX-20: the formatter reads the tags with the delimiter option []; LEX-11, LEX-21: the ] of a[0]
     * stays in the expression; FMT-4, FMT-5: the echo tag and its operators take the spacing of the style.
     */
    public function testFormatsWithTheDelimiterOption(): void
    {
        self::assertSame(
            "[= a[0] + 1]\n[= [1, 2][1]]",
            self::text(Formatter::format("[= a[0]+1]\n[= [1,2][1]]", ['delimiters' => '[]'])),
        );
    }

    public function testFormatsAWrappedTagWithSameCharacterDelimiters(): void
    {
        self::assertSame(
            'var page = ";;= json(page) | raw;;";',
            self::text(Formatter::format('var page = ";;=json(page)|raw;;";', ['delimiters' => ';;'])),
        );
    }

    public function testReturnsTheParserErrorPosition(): void
    {
        $error = Formatter::format("<p>\n  {? a}\n</p>", ['name' => 'x.tpl'])->error;
        self::assertNotNull($error);
        self::assertSame(
            ['parse', 'E_PARSE_UNCLOSED_BLOCK', 2, 3],
            [$error->reason, $error->code, $error->line, $error->col],
        );
    }

    public function testNeverChangesAComment(): void
    {
        self::assertEquals(new FormatResult('{*   a   *}{**}', false, null), Formatter::format('{*   a   *}{**}'));
    }

    public function testFormatsTheBodyOfEveryTagKind(): void
    {
        $source = '{=a+b}{?  x}{:?y}{:}{/}{?#  side}{/}{+   a.tpl  }'
            . '{#  card   c.tpl  t:p.t }{@ i=xs}{:   n+=1}{: n++}{/}';
        self::assertSame(
            '{= a + b}{? x}{:? y}{:}{/}{?# side}{/}{+ a.tpl}{# card c.tpl t:p.t}{@ i = xs}{:n += 1}{:n++}{/}',
            self::text(Formatter::format($source, ['indent' => null])),
        );
    }

    public function testKeepsABodyThatSpansLines(): void
    {
        self::assertEquals(
            new FormatResult("{= a\n+b}", false, null),
            Formatter::format("{= a\n+b}", ['indent' => null]),
        );
    }

    public function testCountsTheErrorColumnInBytes(): void
    {
        $error = Formatter::format("é<div>\né<p>a</div>")->error;
        self::assertNotNull($error);
        self::assertSame(['html', null, 2, 7], [$error->reason, $error->code, $error->line, $error->col]);
    }

    public function testRejectsAnIndentUnitThatIsNotSpacesOrOneTab(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Formatter::format('<p></p>', ['indent' => " \t"]);
    }

    public function testRejectsAnEmptyIndentUnit(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Formatter::format('<p></p>', ['indent' => '']);
    }

    public function testSameTreeIgnoresSpansAndKeyOrder(): void
    {
        self::assertTrue(
            Invariant::sameTree(
                ['type' => 'Var', 'name' => 'a', 'span' => [0, 1]],
                ['span' => [4, 5], 'name' => 'a', 'type' => 'Var'],
            ),
        );
        self::assertFalse(
            Invariant::sameTree(
                ['type' => 'Text', 'value' => 'a ', 'span' => [0, 2]],
                ['type' => 'Text', 'value' => 'a', 'span' => [0, 1]],
            ),
        );
        self::assertFalse(Invariant::sameTree(['body' => [1, 2]], ['body' => [1]]));
        self::assertFalse(Invariant::sameTree(['value' => 1.0], ['value' => '1']));
    }

    public function testRemovesLineIndentationFromText(): void
    {
        self::assertSame(
            ['body' => [['type' => 'Text', 'value' => "a\nb\n"], ['type' => 'Echo']]],
            Invariant::withoutLineIndentation(
                [
                    'body' => [
                        ['type' => 'Text', 'value' => "  a\n\tb\n"],
                        ['type' => 'Text', 'value' => '  '],
                        ['type' => 'Echo'],
                    ],
                ],
            ),
        );
    }
}
