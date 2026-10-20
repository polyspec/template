<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Value\MapValue;

/**
 * The insertion-ordered map of the library with string keys, as the extension registers it.
 */
final class MapValueTest extends TestCase
{
    public function testTheExtensionRegistersMapValue(): void
    {
        $class = new \ReflectionClass(MapValue::class);
        $this->assertTrue($class->isInternal(), 'MapValue is not registered by the extension');
        $this->assertTrue($class->isFinal());
    }

    public function testTheMapKeepsItsKeysAsStringsInTheirOrder(): void
    {
        $map = new MapValue();
        $map->set('b', 1);
        $map->set('10', 'ten');
        $map->set('a', null);

        $this->assertSame(3, $map->count());
        $this->assertSame(['b', '10', 'a'], $map->keys());
        $this->assertSame([1, 'ten', null], $map->values());
        $this->assertSame([['b', 1], ['10', 'ten'], ['a', null]], $map->entries());
        $this->assertTrue($map->has('a'));
        $this->assertTrue($map->has('10'));
        $this->assertFalse($map->has('c'));
        $this->assertSame('ten', $map->get('10'));
        $this->assertNull($map->get('c'));
    }

    public function testSetReplacesInPlaceAndRemoveDrops(): void
    {
        $map = new MapValue();
        $map->set('a', 1);
        $map->set('b', 2);
        $map->set('a', 3);
        $map->remove('b');
        $map->remove('missing');

        $this->assertSame([['a', 3]], $map->entries());
    }

    public function testACopyIsIndependent(): void
    {
        $map = new MapValue();
        $map->set('a', [1]);
        $copy = $map->copy();
        $copy->set('b', 2);
        $map->set('a', [2]);

        $this->assertInstanceOf(MapValue::class, $copy);
        $this->assertSame([['a', [1]], ['b', 2]], $copy->entries());
        $this->assertSame([['a', [2]]], $map->entries());
    }
}
