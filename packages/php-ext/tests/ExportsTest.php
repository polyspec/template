<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;

/**
 * RT-72: the public entry points of the API are the classes that the PHP extension registers.
 */
final class ExportsTest extends TestCase
{
    public function testTheExtensionRegistersItsEntryPoints(): void
    {
        foreach (['Polyspec\Template\Native\Engine', 'Polyspec\Template\BoundMap'] as $class) {
            $this->assertTrue(class_exists($class), $class . ' is not registered by the extension');
        }
        $this->assertTrue(class_exists('Polyspec\Template\TemplateError'));
        $this->assertTrue(method_exists('Polyspec\Template\Native\Engine', 'parse'));
        $this->assertTrue(method_exists('Polyspec\Template\BoundMap', 'bind'));
        $this->assertTrue(method_exists('Polyspec\Template\BoundMap', 'merge'));
    }
}
