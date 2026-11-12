<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Render\RuntimeServices;

/**
 * The runtime services of the library as the extension registers them: a runtime environment holds the limits and the
 * functions of a program, and the program holds its environment as `runtime` and hands it its functions.
 */
final class RuntimeEnvironmentTest extends TestCase
{
    public function testTheExtensionRegistersTheRuntimeServices(): void
    {
        foreach ([RuntimeServices::class, RuntimeEnvironment::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
        }
        $environment = new \ReflectionClass(RuntimeEnvironment::class);
        $this->assertTrue($environment->isFinal());
        $this->assertTrue($environment->implementsInterface(RuntimeServices::class));
        $this->assertTrue((new \ReflectionClass(AstProgram::class))->implementsInterface(RuntimeServices::class));
        $this->assertSame(
            ['iterations' => 1000000, 'depth' => 32, 'outputBytes' => 16 * 1024 * 1024, 'expressionDepth' => 64],
            RuntimeEnvironment::DEFAULT_LIMITS,
        );
    }

    public function testAnEnvironmentHoldsItsLimitsAndItsFunctions(): void
    {
        $upper = static fn (string $text): string => strtoupper($text);
        $method = static fn (): string => 'm';
        $runtime = new RuntimeEnvironment(['depth' => 5], ['shout' => $upper]);
        $runtime->registerClass('Money', 'format', $method);

        $this->assertSame(
            ['iterations' => 1000000, 'depth' => 5, 'outputBytes' => 16 * 1024 * 1024, 'expressionDepth' => 64],
            $runtime->limits(),
        );
        $this->assertSame($upper, $runtime->hostFunction('shout'));
        $this->assertNull($runtime->hostFunction('whisper'));
        $this->assertSame($method, $runtime->classFunction('Money', 'format'));
        $this->assertNull($runtime->classFunction('Money', 'parse'));
    }

    public function testAnEnvironmentRefusesANameThatIsNoIdentifierOrABuiltIn(): void
    {
        $runtime = new RuntimeEnvironment();
        $cases = ['1x' => '"1x" is not an identifier', 'upper' => 'upper is a built-in function'];
        foreach ($cases as $name => $message) {
            try {
                $runtime->register($name, static fn (): string => '');
                $this->fail('an argument error expected for ' . $name);
            } catch (\InvalidArgumentException $error) {
                $this->assertSame($message, $error->getMessage());
            }
        }
    }

    public function testAProgramHoldsItsEnvironmentAsRuntime(): void
    {
        $greet = static fn (): string => 'a';
        $wave = static fn (): string => 'b';
        $program = new AstProgram(null, ['functions' => ['greet' => $greet], 'limits' => ['depth' => 5]]);
        $program->register('wave', $wave);

        $this->assertInstanceOf(RuntimeEnvironment::class, $program->runtime);
        $this->assertSame($greet, $program->runtime->hostFunction('greet'));
        $this->assertSame($wave, $program->runtime->hostFunction('wave'));
        $this->assertSame($program->runtime->limits(), $program->limits());
        $this->assertSame(5, $program->limits()['depth']);
    }
}
