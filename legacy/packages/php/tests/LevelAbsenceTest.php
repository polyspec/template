<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;

/**
 * RT-55: the library declares the core level, and its generated programs come from the build compiler, so the library
 * exposes no generated-program class, function or source-compiler operation: that absence is the requirement.
 */
final class LevelAbsenceTest extends TestCase
{
    public function testTheLibraryExposesNoGeneratedProgramOperation(): void
    {
        $this->assertFalse(class_exists('Polyspec\Template\GeneratedProgram'));
        $this->assertFalse(function_exists('Polyspec\Template\emitArtifact'));
        $this->assertFalse(method_exists(AstProgram::class, 'encodeArtifact'));
        $this->assertFalse(method_exists(AstProgram::class, 'emitArtifact'));
    }
}
