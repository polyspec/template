<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Format;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\Formatter;
use Polyspec\Template\Format\Invariant;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Tests\Support;

/**
 * Safety invariant over every conformance input, with indent null and with the default indentation: the formatted
 * AST equals the source AST without spans (and without line indentation when lines are indented), the text outside
 * tags is unchanged, and formatting is idempotent. With indentation the result may instead be the html error.
 */
final class InvariantTest extends TestCase
{
    /**
     * @return iterable<string, array{0: string, 1: array{delimiters?: string}}>
     */
    public static function inputs(): iterable
    {
        $root = Support::casesDir();
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
        );
        $files = [];
        foreach ($iterator as $file) {
            if ($file instanceof \SplFileInfo && str_ends_with($file->getFilename(), '.tpl')) {
                $files[] = $file->getPathname();
            }
        }
        sort($files);
        foreach ($files as $file) {
            yield substr($file, strlen($root) + 1) => [$file, Support::delimiterOptions(dirname($file))];
        }
    }

    public function testFindsTheConformanceInputs(): void
    {
        self::assertGreaterThan(200, iterator_count(self::inputs()));
    }

    /**
     * @param array{delimiters?: string} $parseOptions
     */
    #[DataProvider('inputs')]
    public function testHoldsTheInvariant(string $file, array $parseOptions): void
    {
        $source = Support::read($file);
        $name = 'input.tpl';
        $kept = ['name' => $name, 'indent' => null] + $parseOptions;
        $options = ['name' => $name] + $parseOptions;
        $result = Formatter::format($source, $kept);
        $indented = Formatter::format($source, $options);
        try {
            $before = AstProgram::parse($source, $name, $parseOptions);
        } catch (TemplateError) {
            foreach ([$result, $indented] as $item) {
                self::assertSame('parse', $item->error?->reason);
            }

            return;
        }
        self::assertNull($result->error, json_encode((array) $result->error, JSON_THROW_ON_ERROR));
        $text = (string) $result->text;
        self::assertTrue(Invariant::sameTree($before, AstProgram::parse($text, $name, $parseOptions)));
        self::assertSame(self::outsideTags($source, $parseOptions), self::outsideTags($text, $parseOptions));
        self::assertEquals(new FormatResult($text, false, null), Formatter::format($text, $kept));

        if ($indented->error !== null) {
            self::assertSame('html', $indented->error->reason);

            return;
        }
        $text = (string) $indented->text;
        self::assertTrue(
            Invariant::sameTree(
                Invariant::withoutLineIndentation($before),
                Invariant::withoutLineIndentation(AstProgram::parse($text, $name, $parseOptions)),
            ),
        );
        self::assertSame(
            self::withoutIndentation(self::outsideTags($source, $parseOptions)),
            self::withoutIndentation(self::outsideTags($text, $parseOptions)),
        );
        self::assertEquals(new FormatResult($text, false, null), Formatter::format($text, $options));
    }

    /**
     * The source text outside every tag, comment and directive, in order.
     *
     * @param array{delimiters?: string} $parseOptions
     * @return list<string>
     */
    private static function outsideTags(string $source, array $parseOptions): array
    {
        $text = str_starts_with($source, "\xEF\xBB\xBF") ? substr($source, 3) : $source;
        $pieces = [];
        $cursor = 0;
        foreach (AstProgram::analyze($text, 'x.tpl', $parseOptions)['tags'] as $tag) {
            $pieces[] = substr($text, $cursor, $tag['start'] - $cursor);
            $cursor = $tag['end'];
        }
        $pieces[] = substr($text, $cursor);

        return $pieces;
    }

    /**
     * @param list<string> $pieces
     * @return list<string>
     */
    private static function withoutIndentation(array $pieces): array
    {
        return array_map(
            static fn (string $piece): string => (string) preg_replace('/(^|\n)[ \t]+/', '$1', $piece),
            $pieces,
        );
    }
}
