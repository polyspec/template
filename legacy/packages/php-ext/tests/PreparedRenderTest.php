<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\PreparedExecution;
use Polyspec\Template\PreparedRender;
use Polyspec\Template\Program;
use Polyspec\Template\TemplateError;

/**
 * An error of the PHP Error hierarchy during a prepared render is E_INTERNAL of the entry template.
 */
final class PreparedRenderTest extends TestCase
{
    public function testTheExtensionRegistersProgramAndPreparedRender(): void
    {
        $this->assertTrue((new \ReflectionClass(Program::class))->isInternal());
        $this->assertTrue((new \ReflectionClass(PreparedRender::class))->isInternal());
    }

    public function testRenderReturnsTheOutputOfTheExecution(): void
    {
        $prepared = new PreparedRender('page.tpl', new class () implements PreparedExecution {
            public function render(): string
            {
                return 'output';
            }
        });

        $this->assertSame('output', $prepared->render());
    }

    public function testAnErrorOfThePhpErrorHierarchyIsEInternal(): void
    {
        $prepared = new PreparedRender('page.tpl', new class () implements PreparedExecution {
            public function render(): string
            {
                throw new \TypeError('bad type');
            }
        });

        try {
            $prepared->render();
            $this->fail('E_INTERNAL expected');
        } catch (TemplateError $error) {
            $this->assertSame(
                [ErrorCode::E_INTERNAL, 'page.tpl', 0, 0, 'internal failure: bad type'],
                [$error->errorCode, $error->template, $error->errorLine, $error->errorCol, $error->getMessage()],
            );
        }
    }

    public function testAnExceptionPassesUnchanged(): void
    {
        $failure = new \RuntimeException('host');
        $prepared = new PreparedRender('page.tpl', new class ($failure) implements PreparedExecution {
            public function __construct(private readonly \Throwable $failure)
            {
            }

            public function render(): string
            {
                throw $this->failure;
            }
        });

        try {
            $prepared->render();
            $this->fail('the exception expected');
        } catch (\RuntimeException $error) {
            $this->assertSame($failure, $error);
        }
    }
}
