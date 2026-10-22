<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;

/**
 * RT-1: the extension exposes the operations of the support levels that it declares, under the names of PHP: the same
 * static entry points as the library of the Composer package, which the other PHP tests check for the library.
 */
final class EntryPointsTest extends TestCase
{
    public function testTheStaticEntryPointsExistInTheExtension(): void
    {
        $this->assertTrue(method_exists('Polyspec\Template\AstProgram', 'parse'));
        $this->assertTrue(method_exists('Polyspec\Template\AstProgram', 'decodeTemplate'));
        $this->assertTrue(method_exists('Polyspec\Template\BoundMap', 'bind'));
        $this->assertTrue(method_exists('Polyspec\Template\BoundMap', 'merge'));
        $this->assertTrue(method_exists('Polyspec\Template\Value\Json', 'parse'));
        $this->assertTrue(method_exists('Polyspec\Template\Value\Bind', 'map'));
        $this->assertTrue(method_exists('Polyspec\Template\Value\Bind', 'data'));
    }
}
