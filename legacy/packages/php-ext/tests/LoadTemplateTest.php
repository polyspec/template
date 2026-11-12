<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;

/**
 * AstProgram::loadTemplate of the library as the extension registers it: the AST and the line index of a
 * template that the loader gives, cached by its version, and each failure of the loader located at the frame that
 * loads it or at the name.
 */
final class LoadTemplateTest extends TestCase
{
    public function testTheExtensionImplementsLoadTemplate(): void
    {
        $method = new \ReflectionMethod(AstProgram::class, 'loadTemplate');
        $this->assertTrue($method->isInternal(), 'AstProgram::loadTemplate is not a method of the extension');
    }

    public function testATemplateIsItsAstAndItsLineIndex(): void
    {
        $program = new AstProgram(self::loader(['a.tpl' => ['source' => "x{= y}\nz", 'version' => '1']]));

        $this->assertSame(
            ['ast' => AstProgram::parse("x{= y}\nz", 'a.tpl'), 'lines' => [0, 7]],
            $program->loadTemplate('a.tpl', null, null),
        );
    }

    public function testATemplateIsCachedByItsVersion(): void
    {
        $sources = ['a.tpl' => ['source' => 'one', 'version' => '1']];
        $loader = self::loader($sources);
        $program = new AstProgram($loader, ['artifact_refresh' => 'true']);
        $first = $program->loadTemplate('a.tpl', null, null);

        $loader->sources['a.tpl'] = ['source' => 'two', 'version' => '1'];
        $this->assertSame($first, $program->loadTemplate('a.tpl', null, null));
        $loader->sources['a.tpl'] = ['source' => 'two', 'version' => '2'];
        $this->assertSame(AstProgram::parse('two', 'a.tpl'), $program->loadTemplate('a.tpl', null, null)['ast']);
    }

    public function testALoaderFailureIsLocatedAtTheFrameOrAtTheName(): void
    {
        $program = new AstProgram(self::loader(['empty.tpl' => ['source' => 'x', 'version' => '']]));
        $frame = new Frame('page.tpl', [0, 4], new MapValue());
        $cases = [
            ['nope.tpl', null, null, ['E_LOAD_NOT_FOUND', 'nope.tpl', 0, 0, 'template nope.tpl does not exist']],
            ['nope.tpl', $frame, [5, 7], ['E_LOAD_NOT_FOUND', 'page.tpl', 2, 2, 'template nope.tpl does not exist']],
            [
                'empty.tpl',
                null,
                null,
                [
                    'E_LOAD_FAILED',
                    'empty.tpl',
                    0,
                    0,
                    'template empty.tpl cannot be loaded: the loader returned no version',
                ],
            ],
        ];
        foreach ($cases as [$name, $from, $span, $expected]) {
            try {
                $program->loadTemplate($name, $from, $span);
                $this->fail('a TemplateError expected for ' . $name);
            } catch (TemplateError $error) {
                $this->assertSame(
                    $expected,
                    [$error->errorCode, $error->template, $error->errorLine, $error->errorCol, $error->getMessage()],
                );
            }
        }
    }

    /** @param array<string, array{source: string, version: string}> $sources */
    private static function loader(array $sources): object
    {
        return new class ($sources) implements LoaderInterface {
            /** @param array<string, array{source: string, version: string}> $sources */
            public function __construct(public array $sources)
            {
            }

            public function load(string $name): ?array
            {
                return $this->sources[$name] ?? null;
            }
        };
    }
}
