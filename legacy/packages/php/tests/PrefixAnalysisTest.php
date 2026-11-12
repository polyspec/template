<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Source;
use Polyspec\Template\Parser\Parser;

/** EDT-11: prefix analysis preserves accepted ranges and the first parser error. */
final class PrefixAnalysisTest extends TestCase
{
    public function testPreservesSharedPrefixes(): void
    {
        /**
         * @var array{cases: list<array{
         *   id: string, name: string, source: string, delimiters?: string, expected: array<string, mixed>
         * }>} $fixture
         */
        $fixture = Support::json(Support::read(Support::repoRoot() . '/tests/fixtures/prefix-analysis.json'));
        self::assertNotEmpty($fixture['cases']);
        foreach ($fixture['cases'] as $item) {
            $options = isset($item['delimiters']) ? ['delimiters' => $item['delimiters']] : [];
            $delimiters = $item['delimiters'] ?? '{}';
            $source = Source::fromText($item['name'], $item['source']);
            $results = [
                AstProgram::analyzePrefix($item['source'], $item['name'], $options),
                Parser::analyzePrefix($source, $delimiters[0], $delimiters[1]),
            ];
            foreach ($results as $result) {
                if ($result['error'] !== null) {
                    self::assertInstanceOf(TemplateError::class, $result['error']);
                    $error = $result['error']->toArray();
                    self::assertNotSame('', $error['message']);
                    unset($error['message']); // ERR-1: message is free English text.
                    $result['error'] = $error;
                }
                self::assertEquals($item['expected'], $result, $item['id']);
            }
        }
    }

    public function testRejectsInvalidSourceAndOptions(): void
    {
        try {
            AstProgram::analyzePrefix("\xff", 'invalid.tpl');
            self::fail('invalid UTF-8 was accepted');
        } catch (TemplateError $error) {
            self::assertSame('E_LEX_INVALID_UTF8', $error->errorCode);
        }
        $this->expectException(\InvalidArgumentException::class);
        AstProgram::analyzePrefix('x', 'invalid.tpl', ['delimiters' => '[']);
    }
}
