<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;

/**
 * RT-62: a prepared render renders identical bytes on every call, and render is prepare(...)->render(). The PHP extension
 * runs this file too.
 */
final class PreparedRenderCallTest extends TestCase
{
    public function testPreparedRenderIsTheSingleCallRender(): void
    {
        $program = AstProgram::loadArtifact(Support::repoRoot() . '/tests/fixtures/artifact-runtime/artifact');
        $prepared = $program->prepare('page.tpl', ['x' => 'a<b']);
        $first = $prepared->render();
        self::assertSame($first, $prepared->render());
        self::assertSame($first, $program->render('page.tpl', ['x' => 'a<b']));
    }
}
