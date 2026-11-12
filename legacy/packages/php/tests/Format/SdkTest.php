<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Format;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\FormatError;
use Polyspec\Template\Format\FormatResult;
use Polyspec\Template\Format\Formatter;
use Polyspec\Template\Tests\Support;

/**
 * FMT-16: formatter options, results and error data are public SDK values.
 *
 * @phpstan-type FormatterCase array{
 *   id: string, source: string, expected: array<string, mixed>,
 *   options: array{name?: string, delimiters?: string, indent?: string|null,
 *     templateBlocks?: 'indent'|'flat', range?: array{start: int, end: int}}
 * }
 * @phpstan-type ErrorData array{
 *   reason: 'parse'|'invariant'|'html', code: string|null, line: int, col: int, message: string
 * }
 * @phpstan-type Fixture array{cases: list<FormatterCase>, errors: list<ErrorData>}
 */
final class SdkTest extends TestCase
{
    /** @return Fixture */
    private static function fixture(): array
    {
        /** @var Fixture $fixture */
        $fixture = Support::json(Support::read(Support::repoRoot() . '/tests/fixtures/formatter-sdk.json'));

        return $fixture;
    }

    public function testPreservesSharedFormatterResults(): void
    {
        foreach (self::fixture()['cases'] as $item) {
            $result = Formatter::format($item['source'], $item['options']);
            self::assertInstanceOf(FormatResult::class, $result);
            if ($result->error === null) {
                $actual = ['ok' => true, 'text' => $result->text, 'changed' => $result->changed];
            } else {
                $error = $result->error->toArray();
                self::assertNotSame('', $error['message']);
                unset($error['message']);
                $actual = ['ok' => false, 'error' => $error];
            }
            self::assertEquals($item['expected'], $actual, $item['id']);
        }
    }

    public function testConstructsSharedErrorData(): void
    {
        foreach (self::fixture()['errors'] as $data) {
            $error = new FormatError(...$data);
            self::assertSame($data, $error->toArray());
            $result = FormatResult::error($error);
            self::assertNull($result->text);
            self::assertFalse($result->changed);
            self::assertSame($error, $result->error);
            $constructed = new FormatResult(null, false, $error);
            self::assertSame($error, $constructed->error);
            $text = FormatResult::text('text', false);
            self::assertSame('text', $text->text);
            self::assertFalse($text->changed);
            self::assertNull($text->error);
        }
    }
}
