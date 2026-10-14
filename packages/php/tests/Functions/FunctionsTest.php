<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Functions;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Functions\Dates;
use Polyspec\Template\Functions\Encoding;
use Polyspec\Template\Functions\Registry;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * Built-in functions that need checks beyond the fixture cases.
 */
final class FunctionsTest extends TestCase
{
    public function testDateOffsetsAndFormatting(): void
    {
        self::assertSame(32400, Dates::parseOffset('+09:00'));
        self::assertSame(-19800, Dates::parseOffset('-05:30'));
        self::assertNull(Dates::parseOffset('+24:00'));
        self::assertSame('2026-09-11 09:00:00 Fri +09:00', Dates::format(1789084800, 'Y-m-d H:i:s D P', 32400));
        self::assertSame('1970-01-01 Thursday 4 4', Dates::format(0, 'Y-m-d l N w', 0));
        self::assertSame('1969-12-31', Dates::format(-86400, 'Y-m-d', 0));
    }

    public function testDateStrings(): void
    {
        self::assertSame(86400, Dates::toUnixSeconds('1970-01-02', 0));
        self::assertSame(-3600, Dates::toUnixSeconds('1970-01-01T00:00:00+01:00', 0));
        self::assertSame(-3600, Dates::toUnixSeconds('1970-01-01 00:00:00', 3600));
    }

    public function testJsonAndUrl(): void
    {
        $map = new MapValue();
        $map->set('a', "<&>\u{2028}");
        self::assertSame('{"a":"\\u003c\\u0026\\u003e\\u2028"}', Encoding::toJson($map));
        self::assertSame('[1e+21,0.1,null,true,"x"]', Encoding::toJson([1e21, 0.1, null, true, new SafeString('x')]));
        self::assertSame('a%20b%2F%C3%A9~%21%2A%27%28%29', Encoding::percentEncode("a b/é~!*'()"));
    }

    public function testArityTable(): void
    {
        foreach (Registry::builtins() as $name => $fn) {
            self::assertLessThanOrEqual($fn['max'], $fn['min'], $name);
        }
        self::assertSame(0.0, (Registry::builtins()['now']['call'])([], ['timezone' => 'Z', 'now' => 0.0]));
    }
}
