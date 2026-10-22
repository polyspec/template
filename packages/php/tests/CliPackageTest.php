<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;

/**
 * The command line is an application package of its own (K433): it lives in packages/php-cli, a Composer project
 * that requires polyspec/template, and the library holds no command line of its own.
 */
final class CliPackageTest extends TestCase
{
    public function testTheCommandLineIsAComposerProjectThatRequiresTheLibrary(): void
    {
        $root = dirname(__DIR__, 3);
        $manifest = $root . '/packages/php-cli/composer.json';
        $this->assertFileExists($manifest);
        $composer = json_decode((string) file_get_contents($manifest), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('project', $composer['type']);
        $this->assertArrayHasKey('polyspec/template', $composer['require']);
        $this->assertArrayHasKey('symfony/console', $composer['require']);
    }

    public function testTheLibraryHoldsNoCommandLine(): void
    {
        $root = dirname(__DIR__, 3);
        $this->assertDirectoryDoesNotExist($root . '/packages/php/src/Cli');
        $this->assertFileDoesNotExist($root . '/packages/php/bin/template.php');
    }
}
