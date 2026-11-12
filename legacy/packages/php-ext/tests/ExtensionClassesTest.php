<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;

/**
 * The classes of the extension are classes of the library (S10): the extension registers no class of its own, such as
 * the former native engine Polyspec\Template\Native\Engine, and every class it registers has a class of the library
 * under the same name.
 */
final class ExtensionClassesTest extends TestCase
{
    public function testTheExtensionRegistersNoNativeClass(): void
    {
        $native = array_values(array_filter(
            self::extensionClasses(),
            static fn (string $name): bool => str_starts_with($name, 'Polyspec\\Template\\Native\\'),
        ));

        $this->assertSame([], $native);
    }

    public function testEveryClassOfTheExtensionIsAClassOfTheLibrary(): void
    {
        $source = __DIR__ . '/../../php/src/';
        $missing = [];
        foreach (self::extensionClasses() as $name) {
            $file = $source . str_replace('\\', '/', substr($name, strlen('Polyspec\\Template\\'))) . '.php';
            if (!is_file($file)) {
                $missing[] = $name;
            }
        }

        $this->assertSame([], $missing);
    }

    /** @return list<string> the classes and interfaces that the extension polyspec_template registers */
    private static function extensionClasses(): array
    {
        $names = array_merge(get_declared_classes(), get_declared_interfaces());
        $classes = array_values(array_filter(
            $names,
            static fn (string $name): bool => (new \ReflectionClass($name))->getExtensionName() === 'polyspec_template',
        ));
        sort($classes);
        self::assertNotSame([], $classes, 'the extension polyspec_template is not loaded');

        return $classes;
    }
}
