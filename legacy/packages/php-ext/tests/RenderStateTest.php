<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;

/**
 * The render state of the library as the extension registers it: a frame names a template and holds its context data,
 * a scope finds a name in its locals before the context of the frame, and a context writes the output and keeps the
 * chain of the templates within the limits of its services.
 */
final class RenderStateTest extends TestCase
{
    public function testTheExtensionRegistersTheRenderState(): void
    {
        foreach ([Frame::class, Scope::class, Context::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
    }

    public function testAFrameHoldsItsTemplateReadonly(): void
    {
        $context = self::map(['a' => 1.0]);
        $frame = new Frame('page.tpl', [0, 4], $context);
        $this->assertSame(['page.tpl', [0, 4], $context], [$frame->name, $frame->lines, $frame->context]);

        $this->expectException(\Error::class);
        (static function (object $value): void {
            $value->name = 'other.tpl';
        })($frame);
    }

    public function testAScopeFindsItsLocalsBeforeTheContextOfTheFrame(): void
    {
        $frame = new Frame('page.tpl', null, self::map(['a' => 'context', 'b' => 'context']));
        $scope = new Scope(self::map(['a' => 'local']));

        $this->assertSame(['local', 'context', null], [
            $scope->lookup($frame, 'a'),
            $scope->lookup($frame, 'b'),
            $scope->lookup($frame, 'c'),
        ]);
        $this->assertSame([], (new Scope())->locals->keys());
        $this->assertSame(0, count($scope->loops));
    }

    public function testTheLoopMetaOfAScopeIsTheInnermostLoopOfItsName(): void
    {
        $scope = new Scope();
        $scope->loops['item'] = [['index' => 0.0], ['index' => 1.0]];
        $scope->loops['empty'] = [];

        $this->assertSame(['index' => 1.0], $scope->loopMeta('item'));
        $this->assertNull($scope->loopMeta('empty'));
        $this->assertNull($scope->loopMeta('other'));
    }

    public function testAContextWritesItsOutputWithinTheOutputLimit(): void
    {
        $context = self::context(['outputBytes' => 5]);
        $context->write('abc');
        $context->write('');
        $context->write('de');
        $this->assertSame('abcde', $context->output());

        $context->at(new Frame('page.tpl', [0, 4], new MapValue()), [5, 7]);
        try {
            $context->write('f');
            $this->fail('E_RUNTIME_LIMIT expected');
        } catch (TemplateError $error) {
            $this->assertSame(
                ['E_RUNTIME_LIMIT', 'page.tpl', 2, 2, 5, 7, 'output exceeds 5 bytes'],
                self::fields($error),
            );
        }
        $this->assertSame('abcde', $context->output());
    }

    public function testAContextLocatesAFailureAtItsFrameOrAtItsEntry(): void
    {
        $context = self::context([]);
        $frame = new Frame('part.tpl', [0, 4], new MapValue());

        $this->assertSame(
            ['E_RUNTIME_TYPE', 'part.tpl', 2, 1, 4, 6, 'at'],
            self::fields($context->fail('E_RUNTIME_TYPE', $frame, [4, 6], 'at')),
        );
        $this->assertSame(
            ['E_RUNTIME_TYPE', 'part.tpl', 0, 0, 0, 0, 'no span'],
            self::fields($context->fail('E_RUNTIME_TYPE', $frame, null, 'no span')),
        );
        $this->assertSame(
            ['E_RUNTIME_TYPE', 'entry.tpl', 0, 0, 0, 0, 'no frame'],
            self::fields($context->fail('E_RUNTIME_TYPE', null, [4, 6], 'no frame')),
        );
    }

    public function testAContextKeepsTheChainWithoutCyclesAndWithinTheDepth(): void
    {
        $context = self::context(['depth' => 1]);
        $context->enter('a.tpl', null, null);
        $context->enter('b.tpl', null, null);
        $this->assertSame(['a.tpl', 'b.tpl'], $context->chain);

        $cases = [
            ['a.tpl', 'E_LOAD_CYCLE', 'a.tpl is already being rendered'],
            ['c.tpl', 'E_RUNTIME_DEPTH', 'nesting depth exceeds 1'],
        ];
        foreach ($cases as [$name, $code, $message]) {
            try {
                $context->enter($name, null, null);
                $this->fail($code . ' expected');
            } catch (TemplateError $error) {
                $this->assertSame([$code, $message], [$error->errorCode, $error->getMessage()]);
            }
        }
        $context->leave();
        $this->assertSame(['a.tpl'], $context->chain);
    }

    public function testAContextHoldsItsRenderState(): void
    {
        $services = new RuntimeEnvironment();
        $root = self::map(['a' => 1.0]);
        $env = ['timezone' => 'Z', 'now' => 0.0];
        $context = new Context($services, $root, $env, 'entry.tpl');

        $this->assertSame(
            [$services, $root, $env, 'entry.tpl', [], [], 0, ''],
            [
                $context->services,
                $context->rootData,
                $context->env,
                $context->entryName,
                $context->registry,
                $context->chain,
                $context->iterations,
                $context->output(),
            ],
        );
        $context->registry['x'] = ['html' => '<b>'];
        $context->iterations++;
        $this->assertSame([['x' => ['html' => '<b>']], 1], [$context->registry, $context->iterations]);
    }

    /** @param array<string, mixed> $entries */
    private static function map(array $entries): MapValue
    {
        $map = new MapValue();
        foreach ($entries as $key => $value) {
            $map->set($key, $value);
        }

        return $map;
    }

    /** @param array<string, int> $limits */
    private static function context(array $limits): Context
    {
        $env = ['timezone' => 'Z', 'now' => 0.0];

        return new Context(new RuntimeEnvironment($limits), new MapValue(), $env, 'entry.tpl');
    }

    /** @return list<int|string> */
    private static function fields(TemplateError $error): array
    {
        return [
            $error->errorCode,
            $error->template,
            $error->errorLine,
            $error->errorCol,
            $error->offset,
            $error->end,
            $error->getMessage(),
        ];
    }
}
