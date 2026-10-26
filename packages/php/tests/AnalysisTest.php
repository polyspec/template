<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\TemplateError;

/** EDT-10: public analysis preserves AST, tags and classified byte ranges. */
final class AnalysisTest extends TestCase
{
    public function testPreservesSharedAnalysisContexts(): void
    {
        /** @var array{cases: list<array{id: string, name: string, source: string, expected: array<string, mixed>}>} $fixture */
        $fixture = Support::json(Support::read(Support::repoRoot() . '/tests/fixtures/analysis-context.json'));
        self::assertNotEmpty($fixture['cases']);
        foreach ($fixture['cases'] as $item) {
            $result = AstProgram::analyze($item['source'], $item['name']);
            self::assertEquals($item['expected'], $result, $item['id']);
            self::assertSame(AstProgram::parse($item['source'], $item['name']), $result['ast']);
        }
    }

    public function testRejectsIncompleteSource(): void
    {
        try {
            AstProgram::analyze('{? x}', 'invalid.tpl');
            self::fail('incomplete source was accepted');
        } catch (TemplateError $error) {
            self::assertSame('E_PARSE_UNCLOSED_BLOCK', $error->errorCode);
        }
    }
}
