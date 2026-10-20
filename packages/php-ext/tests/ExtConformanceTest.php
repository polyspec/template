<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\TemplateError;

/**
 * Conformance cases rendered by the extension (CNF-6 to CNF-9).
 */
final class ExtConformanceTest extends TestCase
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

    #[DataProvider('caseProvider')]
    public function testCase(string $directory): void
    {
        $options = Support::delimiterOptions($directory);
        $expectedError = Support::readOptional($directory . '/expected.error.json');
        $expectedHtml = Support::readOptional($directory . '/expected.html');
        $expectedAst = Support::readOptional($directory . '/expected.ast.json');

        if ($expectedAst !== null) {
            $source = Support::read($directory . '/input.tpl');
            $ast = Engine::parseToJson($source, 'input.tpl', $options);
            $this->assertSame(Support::json($expectedAst), Support::json($ast));
        }

        $assign = Support::readOptional($directory . '/data.json') ?? '{}';
        $define = Support::readOptional($directory . '/define.json');
        $env = Support::readOptional($directory . '/env.json');

        if ($expectedError !== null && preg_match('//u', $assign) !== 1) {
            // The command line interface reports invalid UTF-8 in the data file itself.
            $this->assertSame('E_DATA_INVALID_UTF8', Support::json($expectedError)['code']);

            return;
        }

        try {
            $output = (new Engine($directory, $options))->renderJson('input.tpl', $assign, $define, $env);
        } catch (TemplateError $error) {
            $this->assertNotNull($expectedError, "unexpected error {$error->errorCode}");
            $expected = Support::json($expectedError);
            $actual = $error->toArray();
            $this->assertSame(
                $expected,
                [
                    'code' => $actual['code'],
                    'template' => $actual['template'],
                    'line' => $actual['line'],
                    'col' => $actual['col'],
                ],
            );

            return;
        }

        $this->assertNull($expectedError, 'expected an error');
        $this->assertSame($expectedHtml, $output);
    }
}
