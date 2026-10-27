<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Value\MapValue;

/** RT-74, RT-22, RT-35, ERR-2: public render state works without a program. */
final class ContextSdkTest extends TestCase
{
    public function testIsolatedStatePositionedErrorsAndBoundedOutput(): void
    {
        $services = new RuntimeEnvironment(['outputBytes' => 2]);
        $root = new MapValue();
        $env = ['timezone' => 'Z', 'now' => 123.0];
        $context = new Context($services, $root, $env, 'entry.tpl');
        $other = new Context($services, $root, $env, 'other.tpl');
        self::assertSame($services, $context->services);
        self::assertSame($root, $context->rootData);
        self::assertSame($env, $context->env);
        self::assertSame('entry.tpl', $context->entryName);
        self::assertSame(0, $context->iterations);
        $context->iterations++;
        $context->registry['layout'] = ['html' => 'ready'];
        self::assertSame(['html' => 'ready'], $context->registry['layout']);
        self::assertSame([], $other->registry);
        self::assertSame(0, $other->iterations);
        $frame = new Frame('part.tpl', [0, 2], $root);
        $error = $context->fail(ErrorCode::E_RUNTIME_TYPE, null, null, 'unpositioned')->toArray();
        self::assertSame(
            ['entry.tpl', 0, 0, 0, 0],
            [$error['template'], $error['line'], $error['col'], $error['offset'], $error['end']],
        );
        $error = $context->fail(ErrorCode::E_RUNTIME_TYPE, $frame, [2, 3], 'positioned')->toArray();
        self::assertSame(
            ['part.tpl', 2, 1, 2, 3],
            [$error['template'], $error['line'], $error['col'], $error['offset'], $error['end']],
        );
        $context->enter('entry.tpl', null, null);
        self::assertSame(['entry.tpl'], $context->chain);
        try {
            $context->enter('entry.tpl', $frame, [2, 3]);
            self::fail('cycle must fail');
        } catch (TemplateError $error) {
            self::assertSame(ErrorCode::E_LOAD_CYCLE, $error->errorCode);
        }
        self::assertSame(['entry.tpl'], $context->chain);
        $context->leave();
        self::assertSame([], $context->chain);
        $context->at($frame, [2, 3]);
        $context->write('é');
        self::assertSame('é', $context->output());
        self::assertSame('', $other->output());
        try {
            $context->write('x');
            self::fail('output limit must fail');
        } catch (TemplateError $error) {
            $data = $error->toArray();
            self::assertSame(
                [ErrorCode::E_RUNTIME_LIMIT, 'part.tpl', 2, 1, 2, 3],
                [$data['code'], $data['template'], $data['line'], $data['col'], $data['offset'], $data['end']],
            );
        }
    }
}
