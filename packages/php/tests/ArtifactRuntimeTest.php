<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;

/**
 * RT-56: the artifact that the build compiler wrote loads through AstProgram::loadArtifact and renders with the bytes of its
 * source. The fixture is the output of compileAst of tests/fixtures/artifact-runtime.
 */
final class ArtifactRuntimeTest extends TestCase
{
    public function testLoadArtifactRendersTheSourceBytes(): void
    {
        $directory = Support::repoRoot() . '/tests/fixtures/artifact-runtime/artifact';
        self::assertSame('<p>a&lt;b</p>', AstProgram::loadArtifact($directory)->render('page.tpl', ['x' => 'a<b']));
    }
}
