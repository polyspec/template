<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstPreparedExecution;
use Polyspec\Template\AstProgram;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\PreparedExecution;
use Polyspec\Template\TemplateError;

/**
 * The extension renders an AST array and the result of a loader object only as they are given: a field that it cannot
 * read as the AST or the loader result holds it is a failure, never a value made up in its place.
 */
final class AstProgramTest extends TestCase
{
    public function testTheExtensionRegistersAstProgramAndItsExecution(): void
    {
        foreach ([AstProgram::class, PreparedExecution::class, AstPreparedExecution::class] as $name) {
            $registered = (new \ReflectionClass($name))->isInternal();
            $this->assertTrue($registered, $name . ' is not registered by the extension');
        }
    }

    public function testALiteralWhoseValueIsNotOfItsKindIsAnInternalFailure(): void
    {
        $ast = AstProgram::parse('{= 1}', 'x.tpl');
        $ast['body'][0]['expr']['value'] = '1';

        $this->assertFailure(ErrorCode::E_INTERNAL, 'x.tpl', static fn (): string => (new AstProgram())->render($ast));
    }

    public function testAnAstWithoutItsNameIsAnInternalFailure(): void
    {
        $ast = AstProgram::parse('a', 'x.tpl');
        unset($ast['name']);

        $this->assertFailure(ErrorCode::E_INTERNAL, '', static fn (): string => (new AstProgram())->render($ast));
    }

    public function testALoaderResultWithoutAVersionIsALoadFailure(): void
    {
        $program = new AstProgram($this->loader(['source' => 'a']));

        $this->assertFailure(ErrorCode::E_LOAD_FAILED, 'x.tpl', static fn (): string => $program->render('x.tpl'));
    }

    public function testALoaderResultWithoutASourceOrAnAstIsALoadFailure(): void
    {
        $program = new AstProgram($this->loader(['version' => '1']));

        $this->assertFailure(ErrorCode::E_LOAD_FAILED, 'x.tpl', static fn (): string => $program->render('x.tpl'));
    }

    public function testFunctionsThatAreNotAnArrayAreATypeError(): void
    {
        $this->expectException(\TypeError::class);
        new AstProgram(null, ['functions' => 'upper']);
    }

    /** @param array<string, mixed> $result */
    private function loader(array $result): LoaderInterface
    {
        return new class ($result) implements LoaderInterface {
            /** @param array<string, mixed> $result */
            public function __construct(private readonly array $result)
            {
            }

            public function load(string $name): ?array
            {
                return $this->result;
            }
        };
    }

    /** @param callable(): string $render */
    private function assertFailure(string $code, string $template, callable $render): void
    {
        try {
            $render();
            $this->fail($code . ' expected');
        } catch (TemplateError $error) {
            $this->assertSame([$code, $template], [$error->errorCode, $error->template], $error->getMessage());
        }
    }
}
