<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\TemplateError;

final class EngineRefreshTest extends TestCase
{
    public function testDevelopmentRefreshesOnEveryRender(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '1']);
        $engine = new Engine(new AstProgram($loader, ['artifact_refresh' => 'dev']));

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->set('a.tpl', '2');
        self::assertSame('2', $engine->render('a.tpl'));
    }

    public function testFalseKeepsTheFirstArtifact(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '1']);
        $engine = new Engine(new AstProgram($loader, ['artifact_refresh' => 'false']));

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->set('a.tpl', '2');
        self::assertSame('1', $engine->render('a.tpl'));
    }

    public function testConfiguredExpressionDepthLimitIsApplied(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '{= !true}']);
        $engine = new Engine(new AstProgram($loader, ['limits' => ['expressionDepth' => 1]]));

        try {
            $engine->render('a.tpl');
            self::fail('render should exceed the configured expression depth');
        } catch (TemplateError $error) {
            self::assertSame('E_RUNTIME_LIMIT', $error->errorCode);
            self::assertSame('expression nesting exceeds 1', $error->getMessage());
        }
    }
}
