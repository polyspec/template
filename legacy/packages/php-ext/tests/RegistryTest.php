<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Functions\Collection;
use Polyspec\Template\Functions\Dates;
use Polyspec\Template\Functions\Encoding;
use Polyspec\Template\Functions\Numbers;
use Polyspec\Template\Functions\Registry;
use Polyspec\Template\Functions\Strings;

/**
 * The registry of the built-in functions as the extension registers it: the tables of the groups joined in the order
 * of the library, and the test that a name is a built-in function.
 */
final class RegistryTest extends TestCase
{
    public function testTheExtensionRegistersTheRegistry(): void
    {
        $class = new \ReflectionClass(Registry::class);
        $this->assertTrue($class->isInternal(), 'Registry is not registered by the extension');
        $this->assertTrue($class->isFinal());
    }

    public function testTheBuiltinsAreTheTablesOfTheGroupsInTheirOrder(): void
    {
        $expected = [];
        $tables = [Encoding::table(), Strings::table(), Collection::table(), Numbers::table(), Dates::table()];
        foreach ($tables as $table) {
            foreach ($table as $name => $entry) {
                $expected[$name] = [$entry['min'], $entry['max']];
            }
        }
        $builtins = Registry::builtins();

        $this->assertSame($expected, array_map(
            static fn (array $entry): array => [$entry['min'], $entry['max']],
            $builtins,
        ));
        $this->assertSame('AB', ($builtins['upper']['call'])(['ab']));
        $this->assertSame([true, true, false, false], [
            Registry::isBuiltin('upper'),
            Registry::isBuiltin('now'),
            Registry::isBuiltin('nope'),
            Registry::isBuiltin('Upper'),
        ]);
    }
}
