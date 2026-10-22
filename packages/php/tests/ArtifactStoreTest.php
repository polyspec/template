<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;

/**
 * RT-56 ArtifactStore.loadOrRefresh: "dev" builds on every call, "true" reuses an artifact that loads, and "false" never
 * builds. The PHP extension runs this file too (config/parity.json).
 */
final class ArtifactStoreTest extends TestCase
{
    public function testLoadOrRefreshFollowsItsPolicy(): void
    {
        $directory = Support::repoRoot() . '/tests/fixtures/artifact-runtime/artifact';
        $builds = 0;
        $build = static function (string $path) use (&$builds): void {
            ++$builds;
        };
        AstProgram::loadOrRefresh($directory, 'true', $build);
        self::assertSame(0, $builds);
        AstProgram::loadOrRefresh($directory, 'dev', $build);
        self::assertSame(1, $builds);
        self::assertSame('<p>b</p>', AstProgram::loadOrRefresh($directory, 'false', $build)->render('page.tpl', ['x' => 'b']));
        self::assertSame(1, $builds);
        $this->expectException(\RuntimeException::class);
        AstProgram::loadOrRefresh(Support::repoRoot() . '/tests/fixtures/artifact-runtime/none', 'false', $build);
    }
}
