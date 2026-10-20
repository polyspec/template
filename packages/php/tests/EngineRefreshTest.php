<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\TemplateError;

final class EngineRefreshTest extends TestCase
{
    /**
     * RT-76: under dev a program renders the changed source of a template, and under false it keeps its first parse.
     */
    public function testDevelopmentRefreshesOnEveryRender(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '1']);
        $engine = new Engine(new AstProgram($loader, ['artifact_refresh' => 'dev']));

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->set('a.tpl', '2');
        self::assertSame('2', $engine->render('a.tpl'));
    }

    /**
     * RT-40: under the default artifact refresh policy `true` (RT-76) an engine parses a template once per
     * name@version and reuses the parse while the loader reports the same version.
     */
    public function testTheParseIsReusedWhileTheVersionStaysTheSame(): void
    {
        $loader = new class () implements LoaderInterface {
            public string $source = '1';
            public string $version = 'v1';

            public function load(string $name): ?array
            {
                return $name === 'a.tpl' ? ['source' => $this->source, 'version' => $this->version] : null;
            }
        };
        $engine = new Engine(new AstProgram($loader));

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->source = '2';
        self::assertSame('1', $engine->render('a.tpl'));
        $loader->version = 'v2';
        self::assertSame('2', $engine->render('a.tpl'));
    }

    public function testFalseKeepsTheFirstArtifact(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '1']);
        $engine = new Engine(new AstProgram($loader, ['artifact_refresh' => 'false']));

        self::assertSame('1', $engine->render('a.tpl'));
        $loader->set('a.tpl', '2');
        self::assertSame('1', $engine->render('a.tpl'));
    }

    public function testConfiguredExpressionDepthLimitIsApplied(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '{= !true}']);
        $engine = new Engine(new AstProgram($loader, ['limits' => ['expressionDepth' => 1]]));

        try {
            $engine->render('a.tpl');
            self::fail('render should exceed the configured expression depth');
        } catch (TemplateError $error) {
            self::assertSame('E_RUNTIME_LIMIT', $error->errorCode);
            self::assertSame('expression nesting exceeds 1', $error->getMessage());
        }
    }

    /** RT-20: exceeding the iteration limit fails with E_RUNTIME_LIMIT. */
    public function testTheIterationLimitIsApplied(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '{@ i = range(1, 10)}{= i}{/}']);
        $engine = new Engine(new AstProgram($loader, ['limits' => ['iterations' => 5]]));

        try {
            $engine->render('a.tpl');
            self::fail('render should exceed the configured iteration limit');
        } catch (TemplateError $error) {
            self::assertSame('E_RUNTIME_LIMIT', $error->errorCode);
        }
    }

    /**
     * RT-33: the default limits; RT-35: the output size is checked as the output is written, and exceeding it fails;
     * RT-36: a failed render aborts and returns no partial output.
     */
    public function testRenderLimitsDefaultsOutputAndAbort(): void
    {
        self::assertSame(
            ['iterations' => 1000000, 'depth' => 32, 'outputBytes' => 16777216, 'expressionDepth' => 64],
            (new RuntimeEnvironment([], []))->limits(),
        );

        $loader = new ArrayLoader(['a.tpl' => "ab{= 'cd'}"]);
        $engine = new Engine(new AstProgram($loader, ['limits' => ['outputBytes' => 4]]));
        self::assertSame('abcd', $engine->render('a.tpl'));

        $engine = new Engine(new AstProgram($loader, ['limits' => ['outputBytes' => 3]]));
        $result = null;
        try {
            $result = $engine->render('a.tpl');
            self::fail('render should exceed the configured output size');
        } catch (TemplateError $error) {
            self::assertSame('E_RUNTIME_LIMIT', $error->errorCode);
            self::assertSame(1, $error->errorLine);
            self::assertSame(3, $error->errorCol);
        }
        self::assertNull($result);
    }

    /** A program renders the AST that its loader holds without parsing a source (RT-40). */
    public function testRendersAParsedAst(): void
    {
        $ast = AstProgram::parse('{= a + 1}', 'x.tpl');
        $engine = new Engine(new AstProgram(new ArrayLoader(['x.tpl' => $ast])));
        self::assertSame('3', $engine->render('x.tpl', ['a' => 2]));
    }

    /** RT-5, RT-6: the limits and the functions of a program are checked when the program is created. */
    public function testTheLimitsAndFunctionsOfAProgramAreChecked(): void
    {
        $loader = new ArrayLoader();
        $cases = [
            [['limits' => 5], 'limits is not an object'],
            [['limits' => [1]], 'limits is not an object'],
            [['limits' => ['loops' => 1]], 'limits.loops is not a limit'],
            [['limits' => ['iterations' => 1.5]], 'limits.iterations is not an integer'],
            [['limits' => ['depth' => '3']], 'limits.depth is not an integer'],
            [['functions' => 5], 'functions is not an object'],
            [['functions' => ['f' => 1]], 'functions.f is not a function'],
        ];
        foreach ($cases as [$options, $message]) {
            try {
                new AstProgram($loader, $options);
                self::fail("options should fail with: {$message}");
            } catch (\InvalidArgumentException $error) {
                self::assertSame($message, $error->getMessage());
            }
        }

        $program = new AstProgram($loader, ['limits' => ['iterations' => 10], 'functions' => ['f' => fn () => 1]]);
        self::assertSame(10, $program->limits()['iterations']);
    }

    /** RT-5, RT-6: a RuntimeEnvironment checks the limits and the functions that it is created with. */
    public function testTheRuntimeEnvironmentChecksItsLimitsAndFunctions(): void
    {
        $cases = [
            [['loops' => 1], [], 'limits.loops is not a limit'],
            [['iterations' => 1.5], [], 'limits.iterations is not an integer'],
            [[], ['f' => 1], 'functions.f is not a function'],
        ];
        foreach ($cases as [$limits, $functions, $message]) {
            try {
                new RuntimeEnvironment($limits, $functions);
                self::fail("the environment should fail with: {$message}");
            } catch (\InvalidArgumentException $error) {
                self::assertSame($message, $error->getMessage());
            }
        }
    }

    /** RT-4: a define or an env that is not a map fails the render with E_DATA_UNSUPPORTED_TYPE. */
    public function testADefineOrAnEnvThatIsNotAMapIsUnsupported(): void
    {
        $engine = new Engine(new AstProgram(new ArrayLoader(['a.tpl' => 'x', 'b.tpl' => 'y'])));
        $cases = [
            [['define' => 'b.tpl'], 'define is not an object'],
            [['define' => [1]], 'define is not an object'],
            [['env' => 0], 'env is not an object'],
            [['env' => ['Z']], 'env is not an object'],
        ];
        foreach ($cases as [$options, $message]) {
            try {
                $engine->render('a.tpl', [], $options);
                self::fail("render should fail with: {$message}");
            } catch (TemplateError $error) {
                self::assertSame('E_DATA_UNSUPPORTED_TYPE', $error->errorCode);
                self::assertSame($message, $error->getMessage());
            }
        }
    }
}
