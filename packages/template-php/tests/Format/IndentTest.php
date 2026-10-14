<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Format;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\FormatError;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\Formatter;

/**
 * Indentation of lines by the nesting of HTML elements and template blocks, and the html error.
 */
final class IndentTest extends TestCase
{
    private const BOARD = [
        '<div class="board-list">',
        '<h2>{= t["list.heading"]}</h2>',
        '{? length(p.props.posts) == 0}',
        '<p>{= t["list.empty"]}</p>',
        '{:}',
        '<ul>',
        '{@ post = p.props.posts}',
        '<li><a href="{= post.href}">{= post.title}</a></li>',
        '{/}',
        '</ul>',
        '{/}',
        '</div>',
        '',
    ];

    private static function lines(string ...$items): string
    {
        return implode("\n", $items);
    }

    /**
     * Formats a source and checks that the result formats to itself.
     *
     * @param array<string, mixed> $options
     */
    private static function formatted(string $source, array $options = []): string
    {
        $once = FormatterTest::text(Formatter::format($source, $options));
        self::assertEquals(new FormatResult($once, false, null), Formatter::format($once, $options));

        return $once;
    }

    private static function htmlError(string $source): FormatError
    {
        $error = Formatter::format($source)->error;
        self::assertNotNull($error);
        self::assertSame('html', $error->reason);
        self::assertNull($error->code);

        return $error;
    }

    public function testIndentsHtmlElementsAndTemplateBlocksByTwoSpaces(): void
    {
        self::assertSame(self::lines(
            '<div class="board-list">',
            '  <h2>{= t["list.heading"]}</h2>',
            '  {? length(p.props.posts) == 0}',
            '    <p>{= t["list.empty"]}</p>',
            '  {:}',
            '    <ul>',
            '      {@ post = p.props.posts}',
            '        <li><a href="{= post.href}">{= post.title}</a></li>',
            '      {/}',
            '    </ul>',
            '  {/}',
            '</div>',
            '',
        ), self::formatted(self::lines(...self::BOARD)));
    }

    public function testGivesTemplateBlocksNoLevelWhenFlat(): void
    {
        self::assertSame(self::lines(
            '<div class="board-list">',
            '  <h2>{= t["list.heading"]}</h2>',
            '  {? length(p.props.posts) == 0}',
            '  <p>{= t["list.empty"]}</p>',
            '  {:}',
            '  <ul>',
            '    {@ post = p.props.posts}',
            '    <li><a href="{= post.href}">{= post.title}</a></li>',
            '    {/}',
            '  </ul>',
            '  {/}',
            '</div>',
            '',
        ), self::formatted(self::lines(...self::BOARD), ['templateBlocks' => 'flat']));
    }

    public function testUsesTheIndentUnitAndReplacesExistingIndentation(): void
    {
        $source = self::lines('<ul>', '        <li>a</li>', "\t<li>b</li>", '</ul>');
        self::assertSame(self::lines('<ul>', "\t<li>a</li>", "\t<li>b</li>", '</ul>'), self::formatted($source, ['indent' => "\t"]));
        self::assertSame(self::lines('<ul>', '    <li>a</li>', '    <li>b</li>', '</ul>'), self::formatted($source, ['indent' => '    ']));
    }

    public function testKeepsEveryLineWithIndentNull(): void
    {
        self::assertSame("<ul>\n        <li>{= a}</li>\n</ul>", self::formatted("<ul>\n        <li>{=a}</li>\n</ul>", ['indent' => null]));
    }

    public function testEmptiesBlankLinesAndKeepsTheTextAfterTheIndentation(): void
    {
        self::assertSame("<div>\n\n  a   b  \n</div>", self::formatted("<div>\n   \n  a   b  \n</div>"));
    }

    public function testKeepsTheIndentationInsideKeptElementsAndComments(): void
    {
        $source = self::lines(
            '<div>',
            '<pre>',
            '    code {= x}',
            '</pre>',
            '<textarea>',
            '   <b>text</b>',
            '   </textarea>',
            '<script>',
            '  if (a < b) { f("</div>"); }',
            '    </script>',
            '<style>',
            '      p { color: red; }',
            '</style>',
            '<!--',
            '        <div>',
            '-->',
            '<p>a</p>',
            '</div>',
        );
        self::assertSame(self::lines(
            '<div>',
            '  <pre>',
            '    code {= x}',
            '</pre>',
            '  <textarea>',
            '   <b>text</b>',
            '   </textarea>',
            '  <script>',
            '  if (a < b) { f("</div>"); }',
            '    </script>',
            '  <style>',
            '      p { color: red; }',
            '</style>',
            '  <!--',
            '        <div>',
            '-->',
            '  <p>a</p>',
            '</div>',
        ), self::formatted($source));
    }

    public function testIndentsAMultiLineStartTagAndKeepsQuotedValues(): void
    {
        $source = self::lines('<div>', '<input', 'type="text"', '      name="q">', '<p title="first', '      second">x</p>', '</div>');
        self::assertSame(
            self::lines('<div>', '  <input', '    type="text"', '    name="q">', '  <p title="first', '      second">x</p>', '</div>'),
            self::formatted($source),
        );
    }

    public function testKeepsTheContinuationLinesOfATagThatSpansLines(): void
    {
        self::assertSame(self::lines('<div>', '  {= a +', '      b}', '</div>'), self::formatted(self::lines('<div>', '{= a +', '      b}', '</div>')));
    }

    public function testOpensNoElementForVoidAndSelfClosingTagsDoctypeAndInstructions(): void
    {
        $source = self::lines('<!DOCTYPE html>', '<div>', '<br>', '<img src="a.png" />', '<svg><path d="M0"/></svg>', '<p>x</p>', '</div>');
        self::assertSame(
            self::lines('<!DOCTYPE html>', '<div>', '  <br>', '  <img src="a.png" />', '  <svg><path d="M0"/></svg>', '  <p>x</p>', '</div>'),
            self::formatted($source),
        );
    }

    public function testIndentsEachBranchFromTheStartOfTheBlock(): void
    {
        $source = self::lines('<main>', '{? a}', '<div class="x">', '{:}', '<div class="y">', '{/}', '<p>{= b}</p>', '</div>', '</main>');
        self::assertSame(
            self::lines('<main>', '  {? a}', '    <div class="x">', '  {:}', '    <div class="y">', '  {/}', '    <p>{= b}</p>', '  </div>', '</main>'),
            self::formatted($source),
        );
    }

    public function testReadsTemplateTagsInsideAStartTagAndEndTagsInAnyCase(): void
    {
        $source = self::lines('<DIV {? a}class="x"{/}>', '<span>{= b}</span>', '</div>');
        self::assertSame(self::lines('<DIV {? a}class="x"{/}>', '  <span>{= b}</span>', '</div>'), self::formatted($source));
    }

    public function testIndentsWithCustomDelimitersAndKeepsAByteOrderMarkAndCrlf(): void
    {
        self::assertSame(
            "\u{FEFF}<ul>\r\n  [@ x = xs]\r\n    <li>[= x]</li>\r\n  [/]\r\n</ul>\r\n",
            self::formatted("\u{FEFF}<ul>\r\n[@ x = xs]\r\n<li>[= x]</li>\r\n[/]\r\n</ul>\r\n", ['delimiters' => '[]']),
        );
    }

    public function testIndentsOnlyTheLinesThatStartInsideTheRange(): void
    {
        $source = self::lines('<ul>', '<li>a</li>', '<li>{=b}</li>', '</ul>');
        $start = (int) strpos($source, '<li>{=b}');
        self::assertSame(
            self::lines('<ul>', '<li>a</li>', '  <li>{= b}</li>', '</ul>'),
            FormatterTest::text(Formatter::format($source, ['range' => ['start' => $start, 'end' => strlen($source)]])),
        );
    }

    public function testReportsAnEndTagThatDoesNotMatchTheOpenElement(): void
    {
        $error = self::htmlError("<div>\n<p>a</div>");
        self::assertSame([2, 5], [$error->line, $error->col]);
    }

    public function testReportsAnElementThatIsNotClosed(): void
    {
        $error = self::htmlError("<ul>\n<li>a\n</ul>");
        self::assertSame([3, 1], [$error->line, $error->col]);
        $error = self::htmlError("<div>\n<p>a</p>");
        self::assertSame([1, 1], [$error->line, $error->col]);
    }

    public function testReportsBranchesThatEndWithDifferentElements(): void
    {
        $error = self::htmlError("{? a}<div class=\"x\">{:}<p>{/}\n</div>");
        self::assertSame([1, 27], [$error->line, $error->col]);
        $error = self::htmlError("{? a}<div>{/}\n</div>");
        self::assertSame([1, 11], [$error->line, $error->col]);
        $error = self::htmlError("{? a}<div>{:? b}<div>{/}\n</div>");
        self::assertSame([1, 22], [$error->line, $error->col]);
    }

    public function testFormatsTheSameSourceWithIndentNullDespiteAnHtmlError(): void
    {
        self::assertSame("<div>\n<p>{= a}</div>", FormatterTest::text(Formatter::format("<div>\n<p>{=a}</div>", ['indent' => null])));
    }
}
