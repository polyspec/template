<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\Functions\FunctionError;

/**
 * The error code catalog and the function failure of the library as the extension registers them: ErrorCode holds
 * every code of docs/spec/errors.md in the order of the library, and a FunctionError holds its code and message.
 */
final class ErrorClassesTest extends TestCase
{
    public function testTheExtensionRegistersErrorCodeAndFunctionError(): void
    {
        foreach ([ErrorCode::class, FunctionError::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
        $this->assertTrue((new \ReflectionClass(FunctionError::class))->isSubclassOf(\RuntimeException::class));
    }

    public function testErrorCodeHoldsTheCodesOfTheLibraryInItsOrder(): void
    {
        $library = file_get_contents(__DIR__ . '/../../php/src/ErrorCode.php');
        $this->assertIsString($library);
        preg_match_all("/^    public const (E_[A-Z0-9_]+) = '(E_[A-Z0-9_]+)';$/m", $library, $matches);
        $this->assertNotSame([], $matches[1]);

        $this->assertSame(
            array_combine($matches[1], $matches[2]),
            (new \ReflectionClass(ErrorCode::class))->getConstants(),
        );
    }

    public function testAFunctionErrorHoldsItsCodeAndMessage(): void
    {
        $error = new FunctionError('E_RUNTIME_TYPE', 'upper requires a string');
        $this->assertSame(
            ['E_RUNTIME_TYPE', 'upper requires a string', 0, null],
            [$error->errorCode, $error->getMessage(), $error->getCode(), $error->getPrevious()],
        );

        $this->expectException(\Error::class);
        (static function (object $value): void {
            $value->errorCode = 'E_INTERNAL';
        })($error);
    }
}
