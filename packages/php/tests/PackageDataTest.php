<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstDecodeError;
use Polyspec\Template\AstProgram;

/**
 * RT-73: the schema that decodeTemplate reads is a resource of the Composer package (`resources/ast.schema.json`),
 * which the decoder finds from its own location, so a decode runs from a working directory that holds no file of the
 * repository.
 */
final class PackageDataTest extends TestCase
{
    public function testDecodeReadsTheResourceOfThePackageOutsideTheRepository(): void
    {
        $previous = getcwd();
        self::assertIsString($previous);
        $directory = sys_get_temp_dir() . '/polyspec-package-data-' . getmypid();
        mkdir($directory);
        chdir($directory);
        try {
            $decoded = AstProgram::decodeTemplate('{"type":"Template","name":"x.tpl","body":[],"comments":[]}');
            self::assertSame('x.tpl', $decoded['name']);
            try {
                AstProgram::decodeTemplate('{"type":"Template","name":"x.tpl","body":[],"comments":1}');
                self::fail('the invalid AST decoded');
            } catch (AstDecodeError $error) {
                self::assertSame('/comments', $error->path);
            }
        } finally {
            chdir($previous);
            rmdir($directory);
        }
    }
}
