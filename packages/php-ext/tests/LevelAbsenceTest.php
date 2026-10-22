<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;

/**
 * RT-55: the extension declares the extension level, which compiles in ast mode only, so it exposes no generated-program
 * class, function or source-compiler operation: an unsupported operation is absent, not an empty method.
 */
final class LevelAbsenceTest extends TestCase
{
    public function testTheExtensionExposesNoGeneratedProgramOperation(): void
    {
        $this->assertFalse(class_exists('Polyspec\Template\GeneratedProgram'));
        $this->assertFalse(function_exists('Polyspec\Template\emitArtifact'));
        $this->assertFalse(method_exists('Polyspec\Template\AstProgram', 'encodeArtifact'));
        $this->assertFalse(method_exists('Polyspec\Template\AstProgram', 'emitArtifact'));
    }
}
