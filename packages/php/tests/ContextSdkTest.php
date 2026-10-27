<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;

/** RT-74, RT-22, RT-35, ERR-2: public render state works without a program. */
final class ContextSdkTest extends TestCase
{
    /** VAL-1, VAL-4, VAL-6: native carrier snapshots keep insertion order and shared payloads. */
    public function testOrderedValueSdkCarriers(): void
    {
        $safe = new \Polyspec\Template\Value\SafeString('<i>');
        $values = new MapValue();
        $values->set('first', $safe);
        $values->set('second', false);
        $values->set('first', $safe);
        $copy = $values->copy();
        $copy->set('third', null);
        $keys = $values->keys();
        $keys[0] = 'changed';
        self::assertSame(['first', 'second'], $values->keys());
        self::assertSame(2, $values->count());
        self::assertTrue($values->has('first'));
        self::assertNull($values->get('missing'));
        self::assertSame($safe, $copy->get('first'));
        self::assertSame('<i>', $safe->text);
        $copy->remove('second');
        self::assertSame([$safe, null], $copy->values());
        self::assertSame([['first', $safe], ['third', null]], $copy->entries());
    }

    /** RT-1, RT-5, RT-6, RT-74: concrete operations implement the same public runtime/program protocols. */
    public function testAstProgramProtocols(): void
    {
        $loader = new ArrayLoader(['a.tpl' => '{= hello()}|{= Box::value()}']);
        $program = new AstProgram($loader);
        $hello = static fn (): string => 'host';
        $value = static fn (): string => 'box';
        $program->register('hello', $hello);
        $program->registerClass('Box', 'value', $value);
        self::assertInstanceOf(\Polyspec\Template\Program::class, $program);
        self::assertInstanceOf(\Polyspec\Template\Render\RuntimeServices::class, $program);
        self::assertSame($loader, $program->loader);
        self::assertSame($hello, $program->hostFunction('hello'));
        self::assertSame($value, $program->classFunction('Box', 'value'));
        self::assertSame($program->runtime->limits(), $program->limits());
        self::assertSame('true', $program->artifactRefresh);
        self::assertSame(['{', '}'], $program->delimiters);
        self::assertSame('host|box', $program->prepare('a.tpl', [])->render());
        self::assertSame('host|box', $program->render('a.tpl', []));
    }

    /** RT-9, RT-40: source input has a line index; AST input has none. */
    public function testPublicParsedTemplateData(): void
    {
        $source = "x\nz";
        $tree = AstProgram::parse($source, 'a.tpl');
        foreach ([$source, $tree] as $value) {
            $program = new AstProgram(new ArrayLoader(['a.tpl' => $value]));
            $artifact = $program->loadTemplate('a.tpl', null, null);
            self::assertSame($tree, $artifact['ast']);
            self::assertSame(is_string($value) ? [0, 2] : null, $artifact['lines']);
            self::assertSame($artifact, $program->loadTemplate('a.tpl', null, null));
        }
    }

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
