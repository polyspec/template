<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Value\HostArgument;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Number;
use Polyspec\Template\Value\SafeString;
use Polyspec\Template\Value\Value;

/**
 * The value helpers of the library as the extension registers them: Value and Number hold the semantics of template
 * values and numbers, and HostArgument gives the host form of a template value that a template passes to host code.
 */
final class ValueHelpersTest extends TestCase
{
    public function testTheExtensionRegistersTheValueHelpers(): void
    {
        foreach ([Value::class, Number::class, HostArgument::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
        $this->assertSame(9007199254740991, Number::MAX_SAFE);
    }

    public function testTheHostFormOfAValueIsPlainPhpData(): void
    {
        $object = new \stdClass();
        $inner = new MapValue();
        $inner->set('k', 2.0);
        $map = new MapValue();
        $map->set('b', new SafeString('<b>'));
        $map->set('10', [1, $inner]);
        $map->set('a', $object);

        $this->assertSame(
            ['b' => '<b>', 10 => [1.0, ['k' => 2.0]], 'a' => $object],
            HostArgument::of($map),
        );
        $this->assertSame([3.0, 'x', null, true], HostArgument::list([3, new SafeString('x'), null, true]));
        $this->assertSame($object, HostArgument::of($object));
        $this->assertSame([], HostArgument::of(new MapValue()));
    }

    public function testTheHostFormIsACopy(): void
    {
        $list = [1.0, 2.0];
        $map = new MapValue();
        $map->set('list', $list);

        $host = HostArgument::of($map);
        $host['list'][] = 3.0;

        $this->assertSame([1.0, 2.0], $map->get('list'));
    }
}
