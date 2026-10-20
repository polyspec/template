<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstDecodeError;

/**
 * The failure of AstProgram::decodeTemplate as the extension registers it: an argument error that names the JSON
 * Pointer of the invalid node, or the root, and the rule that the node breaks.
 */
final class DecodeErrorTest extends TestCase
{
    public function testTheExtensionRegistersAstDecodeError(): void
    {
        $class = new \ReflectionClass(AstDecodeError::class);
        $this->assertTrue($class->isInternal(), 'AstDecodeError is not registered by the extension');
        $this->assertTrue($class->isFinal());
        $this->assertTrue($class->isSubclassOf(\InvalidArgumentException::class));
    }

    public function testADecodeErrorNamesThePointerOfTheNodeOrTheRoot(): void
    {
        $node = new AstDecodeError('/body/0/expr', 'the property kind is required');
        $root = new AstDecodeError('', 'the value is not an object');

        $this->assertSame(
            ['/body/0/expr', 'invalid template AST at /body/0/expr: the property kind is required', 0, null],
            [$node->path, $node->getMessage(), $node->getCode(), $node->getPrevious()],
        );
        $this->assertSame(['', 'invalid template AST at the root: the value is not an object'], [
            $root->path,
            $root->getMessage(),
        ]);

        $this->expectException(\Error::class);
        (static function (object $value): void {
            $value->path = '/other';
        })($node);
    }
}
