<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\Analyzer;
use Polyspec\Template\Format\Formatter;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\PackageAnalyzer;
use Polyspec\Template\TemplateError;

/**
 * The formatter of the library as the extension registers it: the tags and the lines of a template in the formatting
 * style, with its options, and the result refused when the formatted text does not parse to the same template.
 */
final class FormatterClassTest extends TestCase
{
    public function testTheExtensionRegistersTheFormatter(): void
    {
        $class = new \ReflectionClass(Formatter::class);
        $this->assertTrue($class->isInternal(), Formatter::class . ' is not registered by the extension');
        $this->assertTrue($class->isFinal());

        $analyzer = (new \ReflectionMethod(Formatter::class, 'format'))->getParameters()[2];
        $this->assertTrue($analyzer->isDefaultValueAvailable());
        $this->assertInstanceOf(PackageAnalyzer::class, $analyzer->getDefaultValue());
    }

    public function testATemplateIsFormattedWithItsOptions(): void
    {
        $this->assertSame(
            ["<ul>\n  {@ x = xs}\n    <li>{= x}</li>\n  {/}\n</ul>\n", true, null],
            self::fields(Formatter::format("<ul>\n{@ x=xs}\n<li>{=x}</li>\n{/}\n</ul>\n")),
        );
        $this->assertSame(
            ["\u{FEFF}{= x}\n<p>\n  {= y}\n</p>", true, null],
            self::fields(Formatter::format("\u{FEFF}{=x}\n<p>\n{=y}\n</p>")),
        );
        $this->assertSame(
            ['{=a}{= b}', true, null],
            self::fields(Formatter::format('{=a}{=b}', ['range' => ['start' => 4, 'end' => 8]])),
        );
        $this->assertSame(
            ["<p>\n{= a}\n</p>", true, null],
            self::fields(Formatter::format("<p>\n{=a}\n</p>", ['indent' => null])),
        );
        $this->assertSame(['{= a}', false, null], self::fields(Formatter::format('{= a}')));
        $this->assertSame(
            ['[= a]', true, null],
            self::fields(Formatter::format('[=a]', ['delimiters' => '[]', 'name' => 'n.tpl'])),
        );
    }

    public function testASourceThatCannotBeFormattedGivesTheReason(): void
    {
        $this->assertSame(
            [null, false, ['reason' => 'parse', 'code' => 'E_PARSE_UNTERMINATED_TAG', 'line' => 1, 'col' => 1,
                'message' => 'tag is not terminated']],
            self::fields(Formatter::format('{= a')),
        );
        $this->assertSame(
            [null, false, ['reason' => 'parse', 'code' => null, 'line' => 0, 'col' => 0,
                'message' => '"x" is not a delimiter pair']],
            self::fields(Formatter::format('{= a}', ['delimiters' => 'x'])),
        );
        $this->assertSame(
            [null, false, ['reason' => 'html', 'code' => null, 'line' => 2, 'col' => 1,
                'message' => 'the end tag </span> does not match the open element <div>']],
            self::fields(Formatter::format("<div>\n</span>")),
        );
        $this->assertSame(
            [null, false, ['reason' => 'html', 'code' => null, 'line' => 3, 'col' => 1,
                'message' => 'a template block without an else branch must end with the HTML elements open at its'
                    . ' start']],
            self::fields(Formatter::format("{? a}\n<p>\n{/}\n", ['indent' => "\t", 'templateBlocks' => 'flat'])),
        );
    }

    public function testAResultThatParsesToAnotherTemplateIsRefused(): void
    {
        $empty = new class () implements Analyzer {
            public function analyze(string $source, string $name, array $options): array
            {
                return (new PackageAnalyzer())->analyze($source, $name, $options);
            }

            public function parse(string $source, string $name, array $options): array
            {
                return ['type' => 'Template', 'name' => $name, 'body' => [], 'comments' => []];
            }
        };
        $this->assertSame(
            [null, false, ['reason' => 'invariant', 'code' => null, 'line' => 2, 'col' => 1,
                'message' => 'formatted text parses to a different AST']],
            self::fields(Formatter::format("<p>\n{=a}\n</p>", [], $empty)),
        );

        $failing = new class () implements Analyzer {
            public function analyze(string $source, string $name, array $options): array
            {
                return (new PackageAnalyzer())->analyze($source, $name, $options);
            }

            public function parse(string $source, string $name, array $options): array
            {
                throw TemplateError::withoutPosition('E_PARSE_UNCLOSED_TAG', $name, 'boom');
            }
        };
        $this->assertSame(
            [null, false, ['reason' => 'invariant', 'code' => null, 'line' => 1, 'col' => 2,
                'message' => 'formatted text does not parse: boom']],
            self::fields(Formatter::format('{=a}', [], $failing)),
        );
    }

    public function testAnOptionOutsideItsValuesIsAnArgumentError(): void
    {
        $cases = [
            'indent must be a run of spaces or one tab' => ['indent' => '  x'],
            'templateBlocks must be indent or flat' => ['templateBlocks' => 'no'],
        ];
        foreach ($cases as $message => $options) {
            try {
                Formatter::format('', $options);
                $this->fail($message . ' expected');
            } catch (\InvalidArgumentException $error) {
                $this->assertSame($message, $error->getMessage());
            }
        }
    }

    /** @return array{0: string|null, 1: bool, 2: array<string, mixed>|null} */
    private static function fields(FormatResult $result): array
    {
        return [$result->text, $result->changed, $result->error?->toArray()];
    }
}
