<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;
use Polyspec\Template\Value\Value;

/**
 * Truthiness, equality, ordering and binding (EXP-33 to EXP-38, VAL-12, VAL-14).
 */
final class ValueTest extends TestCase
{
    public function testTruthiness(): void
    {
        self::assertFalse(Value::isTruthy(null));
        self::assertFalse(Value::isTruthy(false));
        self::assertFalse(Value::isTruthy(0.0));
        self::assertFalse(Value::isTruthy(''));
        self::assertFalse(Value::isTruthy([]));
        self::assertFalse(Value::isTruthy(new MapValue()));
        self::assertTrue(Value::isTruthy('0'));
        self::assertTrue(Value::isTruthy(' '));
        self::assertFalse(Value::isTruthy(new SafeString('')));
    }

    public function testEquality(): void
    {
        self::assertTrue(Value::looseEquals('3', 3.0));
        self::assertFalse(Value::strictEquals('3', 3.0));
        self::assertFalse(Value::looseEquals('x', 3.0));
        self::assertFalse(Value::looseEquals(null, ''));
        self::assertTrue(Value::looseEquals([1.0, '2'], [1.0, 2.0]));
        $a = new MapValue();
        $a->set('a', 1.0);
        $a->set('b', 2.0);
        $b = new MapValue();
        $b->set('b', 2.0);
        $b->set('a', 1.0);
        self::assertTrue(Value::looseEquals($a, $b));
    }

    public function testOrdering(): void
    {
        self::assertSame(-1, Value::compare(1.0, 2.0));
        self::assertSame(-1, Value::compare('10', '9'));
        self::assertSame(-1, Value::compare('Ａ', '😀'));
        self::assertNull(Value::compare(1.0, '2'));
    }

    public function testBind(): void
    {
        $this->expectException(BindError::class);
        Bind::value(NAN);
    }

    public function testBindKeepsNumericStringKeys(): void
    {
        $map = Bind::value(['2' => 'b', '1' => 'a']);
        self::assertInstanceOf(MapValue::class, $map);
        self::assertSame(['2', '1'], $map->keys());
        self::assertSame([1.0, 'b'], Bind::value([1, 'b']));
    }

    public function testJsonPreservesOrderAndChecksIntegerLiterals(): void
    {
        $value = Json::parse('{"2": 1, "1": 2, "x": 1e21}');
        self::assertInstanceOf(MapValue::class, $value);
        self::assertSame(['2', '1', 'x'], $value->keys());
        self::assertSame(1e21, $value->get('x'));
        $this->expectException(BindError::class);
        Json::parse('9007199254740992');
    }

    public function testJsonRejectsInvalidUtf8(): void
    {
        $this->expectException(BindError::class);
        Json::parse("\"\xFF\"");
    }
}
