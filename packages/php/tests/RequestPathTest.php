<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;

/**
 * RT-59: rendering a loaded artifact parses nothing and discovers no source (the artifact directory holds no .tpl
 * file), and two renders with the same assign give identical bytes and leave the assign unchanged. The PHP extension
 * runs this file too.
 */
final class RequestPathTest extends TestCase
{
    public function testRendersALoadedArtifactTheSameWay(): void
    {
        $program = AstProgram::loadArtifact(Support::repoRoot() . '/tests/fixtures/artifact-runtime/artifact');
        $assign = ['x' => 'a<b'];
        $first = $program->render('page.tpl', $assign);
        self::assertSame($first, $program->render('page.tpl', $assign));
        self::assertSame('<p>a&lt;b</p>', $first);
        self::assertSame(['x' => 'a<b'], $assign);
    }
}
