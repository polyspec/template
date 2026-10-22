<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\BoundMap;
use Polyspec\Template\Loader\FilesystemLoader;

/**
 * RT-70 and VAL-22: renders of one program read one bound map and keep its values. PHP has no concurrent host code, so the
 * renders are interleaved: two programs render the same bound map alternately, and every render produces the bytes of the
 * shared fixture while the bound map stays the same. The PHP extension runs this file too (config/parity.json).
 */
final class ConcurrentBoundMapTest extends TestCase
{
    public function testInterleavedRendersReadOneBoundMap(): void
    {
        $directory = Support::repoRoot() . '/tests/fixtures/bound-data';
        $cases = Support::readJson($directory . '/cases.json');
        $bound = BoundMap::bind($cases['assign']);
        $first = new AstProgram(new FilesystemLoader($directory));
        $second = new AstProgram(new FilesystemLoader($directory));

        for ($round = 0; $round < 8; ++$round) {
            self::assertSame($cases['outputs']['page'], $first->render('page.tpl', $bound));
            self::assertSame($cases['outputs']['page'], $second->render('page.tpl', $bound));
        }
    }
}
