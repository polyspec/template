<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\Formatter;
use Polyspec\Template\Format\Invariant;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\NativeAnalyzer;
use Polyspec\Template\Native\TemplateError;

/**
 * The formatter of the PHP package over the native analysis: the expected formatted text of the cases, the safety
 * invariant and idempotence over every conformance input.
 */
final class FormatTest extends TestCase
{
    /**
     * @return iterable<string, array{0: string}>
     */
    public static function caseProvider(): iterable
    {
        foreach (Support::cases() as [$id, $directory]) {
            yield $id => [$directory];
        }
    }

    public function testReportsANativeParseError(): void
    {
        $error = Formatter::format("<p>\n  {? a}\n</p>", ['name' => 'x.tpl'], new NativeAnalyzer())->error;
        $this->assertNotNull($error);
        $this->assertSame(['parse', 'E_PARSE_UNCLOSED_BLOCK', 2, 3], [$error->reason, $error->code, $error->line, $error->col]);
    }

    public function testFormatsWithTheDelimiterOption(): void
    {
        $this->assertSame("[= a[0] + 1]\n[= [1, 2][1]]", Formatter::format("[= a[0]+1]\n[= [1,2][1]]", ['delimiters' => '[]'], new NativeAnalyzer())->text);
    }

    #[DataProvider('caseProvider')]
    public function testFormatsTheCase(string $directory): void
    {
        $source = Support::read($directory . '/input.tpl') ?? '';
        $parseOptions = Support::delimiterOptions($directory);
        $analyzer = new NativeAnalyzer();
        $results = [];
        foreach (['indent' => [], 'keep' => ['indent' => null]] as $mode => $modeOptions) {
            $options = ['name' => 'input.tpl'] + $modeOptions + $parseOptions;
            $result = Formatter::format($source, $options, $analyzer);
            $results[$mode] = $result->error === null
                ? ['text' => $result->text]
                : ['error' => ['reason' => $result->error->reason, 'code' => $result->error->code, 'line' => $result->error->line, 'col' => $result->error->col]];
            if ($result->error !== null) {
                $this->assertContains($result->error->reason, ['parse', 'html']);
                continue;
            }
            $text = (string) $result->text;
            $before = Engine::parse($source, 'input.tpl', $parseOptions);
            $after = Engine::parse($text, 'input.tpl', $parseOptions);
            $this->assertTrue($mode === 'keep' ? Invariant::sameTree($before, $after) : Invariant::sameTree(Invariant::withoutLineIndentation($before), Invariant::withoutLineIndentation($after)));
            $this->assertEquals(new FormatResult($text, false, null), Formatter::format($text, $options, $analyzer));
        }
        $expected = Support::read($directory . '/expected.format.json');
        if ($expected !== null) {
            $this->assertSame(json_decode($expected, true), $results);
        } else {
            $this->assertSame('parse', $results['indent']['error']['reason'] ?? null);
            $this->expectException(TemplateError::class);
            Engine::parse($source, 'input.tpl', $parseOptions);
        }
    }
}
