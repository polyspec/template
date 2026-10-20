<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * The runtime bindings of the library as the extension registers them: the value, member, call and limit semantics
 * that AST and generated programs share, each failure located at the frame and span of the node.
 */
final class RuntimeBindingsTest extends TestCase
{
    public function testTheExtensionRegistersTheRuntimeBindings(): void
    {
        $class = new \ReflectionClass(RuntimeBindings::class);
        $this->assertTrue($class->isInternal(), 'RuntimeBindings is not registered by the extension');
        $this->assertTrue($class->isFinal());
    }

    public function testTheOperatorsFollowTheValueSemantics(): void
    {
        [$bindings, $frame] = self::bindings([]);
        $span = [0, 1];

        $this->assertSame(
            [true, -2.0, 'a1', 3.0, 1.0, true, false, true, true, true, 'x&lt;', '<b>', 1, '1.5'],
            [
                $bindings->unary('!', null, $frame, $span),
                $bindings->unary('-', '2', $frame, $span),
                $bindings->binary('+', 'a', 1.0, $frame, $span),
                $bindings->binary('+', 1.0, 2.0, $frame, $span),
                $bindings->binary('%', 7.0, 3.0, $frame, $span),
                $bindings->binary('==', 1.0, '1', $frame, $span),
                $bindings->binary('===', 1.0, '1', $frame, $span),
                $bindings->binary('<', 'a', 'b', $frame, $span),
                $bindings->binary('in', 2.0, [1.0, 2.0], $frame, $span),
                $bindings->binary('in', 'b', 'abc', $frame, $span),
                $bindings->escape('x<', $frame, $span),
                $bindings->escape(new SafeString('<b>'), $frame, $span),
                $bindings->compare(2.0, 1.0, $frame, $span),
                $bindings->stringify(1.5, $frame, $span),
            ],
        );
    }

    public function testTheMembersAndEntriesOfAValue(): void
    {
        [$bindings, $frame] = self::bindings([]);
        $span = [0, 1];
        $map = new MapValue();
        $map->set('1', 'one');
        $object = new \stdClass();
        $object->name = 'n';

        $this->assertSame(
            ['one', 'b', null, 'n', [[0.0, 'a'], [1.0, 'b']], [['1', 'one']], []],
            [
                $bindings->index($map, 1.0, $frame, $span),
                $bindings->index(['a', 'b'], '1', $frame, $span),
                $bindings->index(['a'], 1.0, $frame, $span),
                $bindings->member($object, 'name', $frame, $span),
                $bindings->entries(['a', 'b'], $frame, $span),
                $bindings->entries($map, $frame, $span),
                $bindings->entries(null, $frame, $span),
            ],
        );
    }

    public function testTheCallsOfBuiltInAndHostFunctions(): void
    {
        [$bindings, $frame] = self::bindings(['functions' => ['twice' => static fn (array $a): float => $a[0] * 2]]);
        $span = [0, 1];

        $this->assertSame(['AB', 6.0], [
            $bindings->call('upper', ['ab'], $frame, $span),
            $bindings->call('twice', [3.0], $frame, $span),
        ]);
    }

    public function testEachFailureIsATemplateErrorAtTheNode(): void
    {
        [$bindings, $frame] = self::bindings(['limits' => ['iterations' => 2]]);
        $span = [4, 6];
        $cases = [
            [static fn () => $bindings->binary('/', 1.0, 0.0, $frame, $span), 'E_RUNTIME_DIV_ZERO', 'division by zero'],
            [
                static fn () => $bindings->binary('+', [1.0], 'a', $frame, $span),
                'E_RUNTIME_STRINGIFY',
                'a list or map cannot be converted to text',
            ],
            [
                static fn () => $bindings->compare([], 1.0, $frame, $span),
                'E_RUNTIME_COMPARE',
                'list and number have no order',
            ],
            [
                static fn () => $bindings->call('upper', [], $frame, $span),
                'E_RUNTIME_ARITY',
                'upper accepts 1 arguments, got 0',
            ],
            [
                static fn () => $bindings->call('upper', [1.0], $frame, $span),
                'E_RUNTIME_TYPE',
                'upper requires a string, got number',
            ],
            [
                static fn () => $bindings->call('nope', [], $frame, $span),
                'E_RUNTIME_UNKNOWN_FUNCTION',
                'nope is not a function',
            ],
            [static fn () => $bindings->limit('loop', 3, $frame, $span), 'E_RUNTIME_LIMIT', 'loop iterations exceed 2'],
            [
                static fn () => $bindings->entries('a', $frame, $span),
                'E_RUNTIME_TYPE',
                'loop requires a list, a map or null',
            ],
        ];
        foreach ($cases as [$call, $code, $message]) {
            try {
                $call();
                $this->fail($code . ' expected: ' . $message);
            } catch (TemplateError $error) {
                $this->assertSame(
                    [$code, 'page.tpl', 2, 1, 4, 6, $message],
                    [
                        $error->errorCode,
                        $error->template,
                        $error->errorLine,
                        $error->errorCol,
                        $error->offset,
                        $error->end,
                        $error->getMessage(),
                    ],
                );
            }
        }
    }

    /**
     * @param array<string, mixed> $options
     * @return array{0: RuntimeBindings, 1: Frame}
     */
    private static function bindings(array $options): array
    {
        $runtime = new RuntimeEnvironment($options['limits'] ?? [], $options['functions'] ?? []);
        $context = new Context($runtime, new MapValue(), ['timezone' => 'Z', 'now' => 0.0], 'page.tpl');

        return [new RuntimeBindings($context), new Frame('page.tpl', [0, 4], new MapValue())];
    }
}
