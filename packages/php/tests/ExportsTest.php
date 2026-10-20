<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\BoundMap;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Value\Bind;

/**
 * RT-72: the public entry points of the API are the classes and interfaces of the Composer package, which its autoload
 * resolves.
 */
final class ExportsTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function entryPoints(): array
    {
        $names = [
            'Polyspec\Template\Engine',
            'Polyspec\Template\Program',
            'Polyspec\Template\AstProgram',
            'Polyspec\Template\PreparedRender',
            'Polyspec\Template\BoundMap',
            'Polyspec\Template\TemplateError',
            'Polyspec\Template\PageCache',
            'Polyspec\Template\Loader\LoaderInterface',
            'Polyspec\Template\Value\Json',
            'Polyspec\Template\Value\Bind',
            'Polyspec\Template\Render\RuntimeServices',
            'Polyspec\Template\Render\RuntimeEnvironment',
            'Polyspec\Template\Render\RuntimeBindings',
            'Polyspec\Template\Render\Frame',
            'Polyspec\Template\Render\Scope',
            'Polyspec\Template\Render\Context',
        ];

        return array_combine($names, array_map(static fn (string $name): array => [$name], $names));
    }

    #[DataProvider('entryPoints')]
    public function testTheEntryPointResolvesThroughTheAutoload(string $name): void
    {
        $this->assertTrue(
            class_exists($name) || interface_exists($name),
            $name . ' is neither a class nor an interface',
        );
    }

    public function testTheStaticEntryPointsExist(): void
    {
        $this->assertTrue(method_exists('Polyspec\Template\AstProgram', 'parse'));
        $this->assertTrue(method_exists('Polyspec\Template\AstProgram', 'decodeTemplate'));
        $this->assertTrue(method_exists('Polyspec\Template\BoundMap', 'bind'));
        $this->assertTrue(method_exists('Polyspec\Template\BoundMap', 'merge'));
        $this->assertTrue(method_exists('Polyspec\Template\Value\Json', 'parse'));
        $this->assertTrue(method_exists('Polyspec\Template\Value\Bind', 'map'));
        $this->assertTrue(method_exists('Polyspec\Template\Value\Bind', 'data'));
    }

    /**
     * RT-74: the classes of the package share one runtime. A bound map that BoundMap creates is read by Bind without
     * being bound again (VAL-22), and a program renders it.
     */
    public function testTheEntryPointsShareOneRuntime(): void
    {
        $engine = new Engine(new AstProgram(new ArrayLoader(['page.tpl' => '{= a}{@ x = list}{= x}{/}'])));
        $fromBoundMap = BoundMap::bind(['a' => 'x', 'list' => [1, 2]]);
        $second = BoundMap::bind(['b' => 1]);
        self::assertSame(['a', 'list'], Bind::map($fromBoundMap)->keys());
        self::assertSame('x12', $engine->render('page.tpl', $fromBoundMap));
        self::assertSame('x12', $engine->render('page.tpl', BoundMap::merge($fromBoundMap, $second)));
        self::assertSame('x12', $engine->render('page.tpl', BoundMap::merge($second, $fromBoundMap)));
    }
}
