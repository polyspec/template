<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Expr\Parser as ExpressionParser;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Evaluator;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\Renderer;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\MapValue;

/**
 * The evaluator and the renderer of the library as the extension registers them: an expression evaluates on the
 * scope and the frame it is given, and the statements of a template write to the output of their context, with
 * the includes, blocks and loops of the program and each failure at the node where it happens.
 */
final class RenderClassesTest extends TestCase
{
    public function testTheExtensionRegistersTheEvaluatorAndTheRenderer(): void
    {
        foreach ([Evaluator::class, Renderer::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
    }

    public function testAnExpressionEvaluatesOnItsScopeAndFrame(): void
    {
        $root = Bind::map(['a' => 'A', 'list' => [1, 2], 'm' => ['k' => 1]]);
        $evaluator = new Evaluator(self::context(new AstProgram(), $root, 'page.tpl'));
        $frame = new Frame('page.tpl', null, $root);

        $this->assertInstanceOf(RuntimeBindings::class, $evaluator->runtime);
        $this->assertTrue($evaluator->evaluate(self::expression("a == 'A'"), $frame, new Scope()));
        $this->assertSame(7.0, $evaluator->evaluate(self::expression('1 + 2 * 3'), $frame));
        $this->assertSame([0.0, 1.0, 2.0, 1.0], $evaluator->evaluate(self::expression('[0, ...list, m.k]'), $frame));
        $map = $evaluator->evaluate(self::expression("[...m, 'z' => list[1], 'q' => a ?? 1]"), $frame);
        $this->assertInstanceOf(MapValue::class, $map);
        $this->assertSame([['k', 1.0], ['z', 2.0], ['q', 'A']], $map->entries());
        $this->assertSame(1.0, $evaluator->evaluate(
            self::expression('n ? 1 : 2'),
            $frame,
            new Scope(Bind::map(['n' => true])),
        ));
        $this->assertNull($evaluator->evaluate(self::expression('missing'), $frame));

        $failures = [
            'x.index_' => ['E_RUNTIME_UNKNOWN_LOOP', 'x is not an active loop variable', 0],
            'upper(1)' => ['E_RUNTIME_TYPE', 'upper requires a string, got number', 0],
        ];
        foreach ($failures as $text => $expected) {
            try {
                $evaluator->evaluate(self::expression($text), $frame);
                $this->fail($expected[0] . ' expected for ' . $text);
            } catch (TemplateError $error) {
                $this->assertSame($expected, [$error->errorCode, $error->getMessage(), $error->offset], $text);
            }
        }
    }

    public function testTheStatementsOfATemplateWriteToTheOutputOfTheirContext(): void
    {
        $program = new AstProgram(new ArrayLoader([
            'page.tpl' => '{= a}{@ x = list}[{= x}{? x.last_}.{/}]{/}{: n = upper(a)}{= n}{+ part.tpl}'
                . '{# box.tpl t:n}{# main side.tpl}{# main}{?# main}y{/}',
            'part.tpl' => '<{= n}>',
            'box.tpl' => '({= t}|{= a})',
            'side.tpl' => 'S',
        ]));
        $root = Bind::map(['a' => 'A', 'list' => [1, 2]]);
        $context = self::context($program, $root, 'page.tpl');
        $template = $program->loadTemplate('page.tpl', null, null);

        (new Renderer($context, $program))->renderNodes(
            $template['ast']['body'],
            new Frame('page.tpl', $template['lines'], $root),
            new Scope(),
        );

        $this->assertSame('A[1][2.]A<A>(A|A)SSy', $context->output());
        $this->assertSame([2, ['main'], []], [$context->iterations, array_keys($context->registry), $context->chain]);
    }

    public function testALoopRestoresTheLocalsOfItsScope(): void
    {
        $this->assertSame(['emptyroot', [], 0], self::render('{@ x = []}full{:}empty{/}{= x}'));
        $this->assertSame(['21', [['x', 1.0]], 1], self::render('{: x = 1}{@ x = [2]}{= x}{/}{= x}'));
    }

    public function testAStatementFailsAtItsNode(): void
    {
        $failures = [
            '{# other}' => ['E_RUNTIME_BLOCK_UNDEFINED', 'define other is not registered', 'a/page.tpl', 0, 1, 1, 9],
            '{+ ../../x.tpl}' => [
                'E_LOAD_OUTSIDE_ROOT',
                '"..\/..\/x.tpl" leaves the loader root',
                'a/page.tpl',
                0,
                1,
                1,
                15,
            ],
        ];
        foreach ($failures as $text => $expected) {
            try {
                self::render($text);
                $this->fail($expected[0] . ' expected for ' . $text);
            } catch (TemplateError $error) {
                $this->assertSame($expected, [
                    $error->errorCode,
                    $error->getMessage(),
                    $error->template,
                    $error->offset,
                    $error->errorLine,
                    $error->errorCol,
                    $error->end,
                ], $text);
            }
        }
    }

    /** @return array<string, mixed> */
    private static function expression(string $text): array
    {
        return (new ExpressionParser(Source::fromBytes('e', $text), 0, null, 0, null, 'e'))->parseExpression();
    }

    private static function context(AstProgram $program, MapValue $root, string $entry): Context
    {
        return new Context($program, $root, ['timezone' => 'Z', 'now' => 0.0], $entry);
    }

    /**
     * Renders a template of a/page.tpl with the root data x = 'root' and gives the output, the locals of its scope
     * and the number of loop names of its scope.
     *
     * @return array{0: string, 1: list<array{0: string, 1: mixed}>, 2: int}
     */
    private static function render(string $text): array
    {
        $program = new AstProgram(new ArrayLoader(['a/page.tpl' => '']));
        $root = Bind::map(['x' => 'root']);
        $context = self::context($program, $root, 'a/page.tpl');
        $source = Source::fromBytes('a/page.tpl', $text);
        $scope = new Scope();
        (new Renderer($context, $program))->renderNodes(
            Parser::parse($source)['body'],
            new Frame('a/page.tpl', $source->lines, $root),
            $scope,
        );

        return [$context->output(), $scope->locals->entries(), count($scope->loops)];
    }
}
