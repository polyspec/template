<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\BoundMap;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * The host binding of the library as the extension registers it: the values it gives (a map is a MapValue with string
 * keys, a number is a float, a host object keeps its instance) and the BindError of each failed check.
 */
final class BindTest extends TestCase
{
    public function testTheExtensionRegistersBind(): void
    {
        $class = new \ReflectionClass(Bind::class);
        $this->assertTrue($class->isInternal(), 'Bind is not registered by the extension');
        $this->assertTrue($class->isFinal());
        $this->assertSame(64, Bind::MAX_DEPTH);
    }

    public function testValueGivesTheValuesOfTheLibrary(): void
    {
        $value = Bind::value([
            'n' => 1,
            '1' => 'one',
            'list' => [true, null, 2.5],
            'safe' => new SafeString('<b>'),
            'object' => (object) ['a' => 1],
        ]);

        $this->assertInstanceOf(MapValue::class, $value);
        $this->assertSame(['n', '1', 'list', 'safe', 'object'], $value->keys());
        $this->assertSame(1.0, $value->get('n'));
        $this->assertSame('one', $value->get('1'));
        $this->assertSame([true, null, 2.5], $value->get('list'));
        $this->assertSame('<b>', $value->get('safe'));
        $object = $value->get('object');
        $this->assertInstanceOf(MapValue::class, $object);
        $this->assertSame([['a', 1.0]], $object->entries());
    }

    public function testAHostObjectKeepsItsInstance(): void
    {
        $host = new class {
            public int $a = 1;
        };

        $this->assertSame($host, Bind::value($host));
    }

    public function testEveryFailedCheckIsABindError(): void
    {
        $cases = [
            [static fn () => Bind::checkFloat(INF), 'E_DATA_NUMBER_NOT_FINITE', 'number is not finite'],
            [
                static fn () => Bind::checkFloat(2.0 ** 53),
                'E_DATA_NUMBER_RANGE',
                'number 9.007199254741E+15 is outside the safe range',
            ],
            [
                static fn () => Bind::value(['n' => -9007199254740992.0]),
                'E_DATA_NUMBER_RANGE',
                'number -9.007199254741E+15 is outside the safe range',
            ],
            [
                static fn () => Bind::value(['n' => 2.5e300]),
                'E_DATA_NUMBER_RANGE',
                'number 2.5E+300 is outside the safe range',
            ],
            [
                static fn () => Bind::value(2 ** 53),
                'E_DATA_NUMBER_RANGE',
                'integer 9007199254740992 is outside the safe range',
            ],
            [static fn () => Bind::checkLevel(65), 'E_DATA_DEPTH', 'lists and maps nest deeper than 64 levels'],
            [static fn () => Bind::value("\xff"), 'E_DATA_INVALID_UTF8', 'string is not valid UTF-8'],
            [static fn () => Bind::value(["\xff" => 1]), 'E_DATA_INVALID_UTF8', 'a map key is not valid UTF-8'],
            [
                static fn () => Bind::value(static fn (): int => 1),
                'E_DATA_UNSUPPORTED_TYPE',
                'a closure has no binding',
            ],
            [static fn () => Bind::map('text'), 'E_DATA_UNSUPPORTED_TYPE', 'assign is not a map'],
            [
                static fn () => Bind::value(['m' => BoundMap::bind(['a' => 1])]),
                'E_DATA_UNSUPPORTED_TYPE',
                'a bound map is accepted only as assign and as definition data',
            ],
        ];
        foreach ($cases as [$call, $code, $message]) {
            try {
                $call();
                $this->fail($code . ' expected');
            } catch (BindError $error) {
                $this->assertSame([$code, $message], [$error->errorCode, $error->getMessage()]);
            }
        }
        $this->assertSame(1.5, Bind::checkFloat(1.5));
        Bind::checkLevel(64);
    }

    public function testDepthWithinStopsAtTheLimit(): void
    {
        $this->assertTrue(Bind::depthWithin([[1]], 2));
        $this->assertFalse(Bind::depthWithin([[1]], 1));
        $this->assertTrue(Bind::depthWithin('a', 0));
        $map = new MapValue();
        $map->set('a', [1]);
        $this->assertFalse(Bind::depthWithin($map, 1));
    }

    public function testPublicPropertiesLeaveOutTheOthers(): void
    {
        $object = new #[\AllowDynamicProperties] class {
            public int $a = 1;
            protected int $b = 2;
            private int $c = 3;

            public function c(): int
            {
                return $this->c;
            }
        };
        $object->d = 4;

        $this->assertSame(['a' => 1, 'd' => 4], Bind::publicProperties($object));
    }

    public function testMapAndDataGiveTheMapsOfTheLibrary(): void
    {
        $this->assertSame(0, Bind::map(null)->count());
        $this->assertSame(0, Bind::map([])->count());
        $this->assertSame(['a'], Bind::map(BoundMap::bind(['a' => 1]))->keys());
        $this->assertInstanceOf(MapValue::class, Bind::data([]));
        $this->assertSame('x', Bind::data('x'));
        $this->assertSame(['b'], Bind::data(BoundMap::bind(['b' => 2]))->keys());
    }
}
