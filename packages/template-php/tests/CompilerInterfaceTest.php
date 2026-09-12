<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Program;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\RuntimeServices;

/** Verifies public runtime declarations against the common compiler manifest. */
final class CompilerInterfaceTest extends TestCase
{
    /** Compares PHP declarations with the manifest through Reflection. */
    public function testRuntimeDeclarationsMatchManifest(): void
    {
        $manifestPath = getenv('TEMPLATE_INTERFACE_MANIFEST') ?: __DIR__.'/../../../tools/compiler/interface.json';
        $manifest = json_decode((string) file_get_contents($manifestPath), true, flags: JSON_THROW_ON_ERROR);
        $contract = $manifest['runtimeContract'];
        $program = new \ReflectionClass(Program::class);
        self::assertTrue($program->isInterface());
        self::assertSame(array_column($contract['Program']['operations'], 'name'), array_map(
            static fn (\ReflectionMethod $method): string => $method->getName(),
            $program->getMethods(\ReflectionMethod::IS_PUBLIC),
        ));
        foreach ($contract['Program']['operations'] as $operation) {
            self::assertSame(count($operation['parameters']), $program->getMethod($operation['name'])->getNumberOfParameters());
        }

        $engine = new \ReflectionClass(Engine::class);
        self::assertTrue($engine->implementsInterface(Program::class));
        self::assertSame($contract['Engine']['owns'], array_map(
            static fn (\ReflectionProperty $property): string => $property->getName(),
            $engine->getProperties(),
        ));
        self::assertSame($contract['Engine']['operations'], array_values(array_map(
            static fn (\ReflectionMethod $method): string => $method->getName(),
            array_filter($engine->getMethods(\ReflectionMethod::IS_PUBLIC), static fn (\ReflectionMethod $method): bool => $method->getName() !== '__construct'),
        )));

        $ast = new \ReflectionClass(AstProgram::class);
        self::assertFalse($ast->isAbstract());
        self::assertTrue($ast->implementsInterface(Program::class));

        $bindings = new \ReflectionClass(RuntimeBindings::class);
        self::assertFalse($bindings->isAbstract());
        self::assertSame(array_column($contract['RuntimeBindings']['operations'], 'name'), array_values(array_map(
            static fn (\ReflectionMethod $method): string => $method->getName(),
            array_filter($bindings->getMethods(\ReflectionMethod::IS_PUBLIC), static fn (\ReflectionMethod $method): bool => $method->getName() !== '__construct'),
        )));
        foreach ($contract['RuntimeBindings']['operations'] as $operation) {
            self::assertSame(count($operation['parameters']), $bindings->getMethod($operation['name'])->getNumberOfParameters());
        }

        $services = new \ReflectionClass(RuntimeServices::class);
        self::assertTrue($services->isInterface());
        self::assertSame(array_column($contract['RuntimeServices']['operations'], 'name'), array_map(
            static fn (\ReflectionMethod $method): string => $method->getName(),
            $services->getMethods(\ReflectionMethod::IS_PUBLIC),
        ));
        foreach ($contract['RuntimeServices']['operations'] as $operation) {
            self::assertSame(count($operation['parameters']), $services->getMethod($operation['name'])->getNumberOfParameters());
        }
    }
}
