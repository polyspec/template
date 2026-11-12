<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstPreparedExecution;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Value\MapValue;

/**
 * The prepared execution of the library as the extension registers it: built from a program, the bound root
 * data, the definitions, the environment, the target name and the loaded template, it renders that template.
 */
final class PreparedExecutionTest extends TestCase
{
    public function testTheExtensionImplementsTheConstructor(): void
    {
        $constructor = (new \ReflectionClass(AstPreparedExecution::class))->getConstructor();
        $this->assertNotNull($constructor, 'AstPreparedExecution has no constructor');
        $this->assertTrue($constructor->isInternal(), 'the constructor is not a method of the extension');
        $names = array_map(
            static fn (\ReflectionParameter $parameter): string => $parameter->name,
            $constructor->getParameters(),
        );
        $this->assertSame(['engine', 'rootData', 'registry', 'env', 'targetName', 'template'], $names);
    }

    public function testAnExecutionRendersItsTemplateWithItsData(): void
    {
        $program = new AstProgram(new ArrayLoader([
            'a.tpl' => '<{= a}>{# part.tpl}',
            'part.tpl' => '[{= a}]',
        ]));
        $root = new MapValue();
        $root->set('a', 'x&');
        $execution = new AstPreparedExecution(
            $program,
            $root,
            [],
            ['timezone' => 'Z', 'now' => 0.0],
            'a.tpl',
            $program->loadTemplate('a.tpl', null, null),
        );

        $this->assertSame('<x&amp;>[x&amp;]', $execution->render());
        $this->assertSame($execution->render(), $execution->render());
    }
}
