<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\SafeString;

/**
 * The safe string and the binding failure of the library, as the extension registers them: a safe string given as data
 * binds as its text, which the echo tag escapes.
 */
final class ValueClassesTest extends TestCase
{
    public function testTheExtensionRegistersSafeStringAndBindError(): void
    {
        foreach ([SafeString::class, BindError::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
        $this->assertTrue((new \ReflectionClass(BindError::class))->isSubclassOf(\RuntimeException::class));
    }

    public function testASafeStringHoldsItsTextReadonly(): void
    {
        $safe = new SafeString('<b>');
        $this->assertSame('<b>', $safe->text);

        $this->expectException(\Error::class);
        (static function (object $value): void {
            $value->text = 'changed';
        })($safe);
    }

    public function testABindErrorHoldsItsCodeAndMessage(): void
    {
        $error = new BindError('E_DATA_DEPTH', 'lists and maps nest too deep');
        $this->assertSame(
            ['E_DATA_DEPTH', 'lists and maps nest too deep', 0, null],
            [$error->errorCode, $error->getMessage(), $error->getCode(), $error->getPrevious()],
        );
    }

    public function testASafeStringGivenAsDataBindsAsItsText(): void
    {
        $program = new AstProgram(new ArrayLoader(['x.tpl' => '{= a}|{= a == "<b>"}|{= items[0]}']));

        $this->assertSame(
            '&lt;b&gt;|true|&lt;i&gt;',
            $program->render('x.tpl', ['a' => new SafeString('<b>'), 'items' => [new SafeString('<i>')]]),
        );
    }
}
