<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Engine;
use Polyspec\Template\Program;

/**
 * The engine of the library hands every request to the program that it holds, unchanged, and returns what the program
 * returns.
 */
final class ProgramEngineTest extends TestCase
{
    public function testTheExtensionRegistersEngine(): void
    {
        $engine = new \ReflectionClass(Engine::class);
        $this->assertTrue($engine->isInternal(), 'Engine is not registered by the extension');
        $this->assertTrue($engine->isFinal());
        $this->assertTrue($engine->implementsInterface(Program::class));
    }

    public function testPrepareAndRenderReachTheProgramUnchanged(): void
    {
        $program = new RecordingProgram();
        $engine = new Engine($program);

        $this->assertSame('prepared', $engine->prepare('page.tpl', ['a' => 1], ['env' => ['now' => 0]])->render());
        $this->assertSame('rendered', $engine->render(['type' => 'Template'], null, ['define' => []]));
        $this->assertSame('rendered', $engine->render('page.tpl'));
        $this->assertSame([
            ['prepare', 'page.tpl', ['a' => 1], ['env' => ['now' => 0]]],
            ['render', ['type' => 'Template'], null, ['define' => []]],
            ['render', 'page.tpl', [], []],
        ], $program->calls);
    }

    public function testAnExceptionOfTheProgramPassesUnchanged(): void
    {
        $failure = new \RuntimeException('program');
        $engine = new Engine(new RecordingProgram($failure));

        foreach ([static fn () => $engine->render('page.tpl'), static fn () => $engine->prepare('page.tpl')] as $call) {
            try {
                $call();
                $this->fail('the exception of the program expected');
            } catch (\RuntimeException $error) {
                $this->assertSame($failure, $error);
            }
        }
    }
}
