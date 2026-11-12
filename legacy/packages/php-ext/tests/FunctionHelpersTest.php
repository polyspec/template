<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Functions\FunctionError;
use Polyspec\Template\Functions\FunctionGroup;
use Polyspec\Template\Functions\Helpers;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * The argument helpers of the function groups of the library as the extension registers them: each checks or converts
 * one argument as the built-in functions need it, and fails with the FunctionError of the library.
 */
final class FunctionHelpersTest extends TestCase
{
    public function testTheExtensionRegistersTheHelpersAndTheGroupInterface(): void
    {
        $helpers = new \ReflectionClass(Helpers::class);
        $this->assertTrue($helpers->isInternal(), 'Helpers is not registered by the extension');
        $this->assertTrue($helpers->isFinal());
        $group = new \ReflectionClass(FunctionGroup::class);
        $this->assertTrue($group->isInternal(), 'FunctionGroup is not registered by the extension');
        $this->assertTrue($group->isInterface());
    }

    public function testTheHelpersGiveTheArgumentInTheFormTheFunctionNeeds(): void
    {
        $this->assertSame(['a', '<b>', [1.0]], [
            Helpers::string('a', 'upper'),
            Helpers::string(new SafeString('<b>'), 'upper'),
            Helpers::list([1.0], 'join'),
        ]);
        $this->assertSame([0.0, 1.0, 0.0, 2.5, 12.0, -3.0], [
            Helpers::toNumber(null),
            Helpers::toNumber(true),
            Helpers::toNumber(false),
            Helpers::toNumber(2.5),
            Helpers::toNumber(' 12 '),
            Helpers::number('-3'),
        ]);
        $this->assertSame([2, -2, 0], [Helpers::integer(2.9), Helpers::integer(-2.9), Helpers::integer(null)]);
        $this->assertSame(['1.5', 'true', ''], [
            Helpers::stringify(1.5),
            Helpers::stringify(true),
            Helpers::stringify(null),
        ]);
        $safe = Helpers::safe('<i>');
        $this->assertInstanceOf(SafeString::class, $safe);
        $this->assertSame('<i>', $safe->text);
        $error = Helpers::typeError('x requires a y');
        $this->assertSame(['E_RUNTIME_TYPE', 'x requires a y'], [$error->errorCode, $error->getMessage()]);
    }

    public function testTheHelpersFailWithTheFunctionErrorOfTheLibrary(): void
    {
        $cases = [
            [static fn () => Helpers::string(1.0, 'upper'), 'E_RUNTIME_TYPE', 'upper requires a string, got number'],
            [static fn () => Helpers::list('a', 'join'), 'E_RUNTIME_TYPE', 'join requires a list, got string'],
            [static fn () => Helpers::toNumber('1x'), 'E_RUNTIME_TYPE', '"1x" is not a number'],
            [static fn () => Helpers::toNumber([1.0]), 'E_RUNTIME_TYPE', 'a list is not a number'],
            [static fn () => Helpers::toNumber(new MapValue()), 'E_RUNTIME_TYPE', 'a map is not a number'],
            [
                static fn () => Helpers::stringify([1.0]),
                'E_RUNTIME_STRINGIFY',
                'a list or map cannot be converted to text',
            ],
        ];
        foreach ($cases as [$call, $code, $message]) {
            try {
                $call();
                $this->fail($code . ' expected: ' . $message);
            } catch (FunctionError $error) {
                $this->assertSame([$code, $message], [$error->errorCode, $error->getMessage()]);
            }
        }
    }
}
