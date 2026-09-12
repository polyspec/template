<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Engine;
use Polyspec\Template\GeneratedPreparedRender;
use Polyspec\Template\GeneratedRequest;
use Polyspec\Template\Loader\ArrayLoader;

final class EngineRefreshTest extends TestCase
{
    public function testDevelopmentRefreshesOnEveryRender(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '1']);
        $engine = new Engine($loader, ['artifact_refresh' => 'dev']);

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->set('a.tpl', '2');
        self::assertSame('2', $engine->render('a.tpl'));
    }

    public function testFalseKeepsTheFirstArtifact(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '1']);
        $engine = new Engine($loader, ['artifact_refresh' => 'false']);

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->set('a.tpl', '2');
        self::assertSame('1', $engine->render('a.tpl'));
    }

    public function testGeneratedModeUsesTheSamePreparedRenderContract(): void
    {
        $engine = new Engine(new ArrayLoader(['ignored' => '']), [
            'compile' => ['mode' => 'gen', 'generated_renderer' => static fn (GeneratedRequest $request): GeneratedPreparedRender => new GeneratedPreparedRender(static fn (): string => 'generated')],
        ]);

        self::assertSame('generated', $engine->render('ignored'));
        self::assertSame('generated', $engine->prepare('ignored')->render());
    }
}
