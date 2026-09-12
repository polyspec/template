<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

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
        $options = [];
        $optionsJson = Support::read($directory . '/options.json');
        if ($optionsJson !== null) {
            $decoded = json_decode($optionsJson, true);
            if (isset($decoded['delimiters'])) {
                $options['delimiters'] = $decoded['delimiters'];
            }
        }
        $expectedError = Support::read($directory . '/expected.error.json');
        $expectedHtml = Support::read($directory . '/expected.html');
        $expectedAst = Support::read($directory . '/expected.ast.json');

        if ($expectedAst !== null) {
            $source = Support::read($directory . '/input.tpl') ?? '';
            $ast = Engine::parseToJson($source, 'input.tpl', $options);
            $this->assertSame(json_decode($expectedAst, true), json_decode($ast, true));
        }

        $assign = Support::read($directory . '/data.json') ?? '{}';
        $define = Support::read($directory . '/define.json');
        $env = Support::read($directory . '/env.json');

        if ($expectedError !== null && preg_match('//u', $assign) !== 1) {
            // The command line interface reports invalid UTF-8 in the data file itself.
            $this->assertSame('E_DATA_INVALID_UTF8', json_decode($expectedError, true)['code']);

            return;
        }

        try {
            $output = (new Engine($directory, $options))->renderJson('input.tpl', $assign, $define, $env);
        } catch (TemplateError $error) {
            $this->assertNotNull($expectedError, "unexpected error {$error->getErrorCode()}");
            $expected = json_decode($expectedError, true);
            $actual = $error->toArray();
            $this->assertSame(
                $expected,
                ['code' => $actual['code'], 'template' => $actual['template'], 'line' => $actual['line'], 'col' => $actual['col']],
            );

            return;
        }

        $this->assertNull($expectedError, 'expected an error');
        $this->assertSame($expectedHtml, $output);
    }
}
