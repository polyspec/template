<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Value\Number;

/**
 * Number formatting (VAL-9, FUN-20 to FUN-25).
 */
final class NumberTest extends TestCase
{
    public function testToTextFollowsTheEcmascriptLayout(): void
    {
        self::assertSame('1', Number::toText(1.0));
        self::assertSame('0', Number::toText(-0.0));
        self::assertSame('0.30000000000000004', Number::toText(0.1 + 0.2));
        self::assertSame('1e+21', Number::toText(1e21));
        self::assertSame('1e-7', Number::toText(1e-7));
        self::assertSame('1.5e-7', Number::toText(1.5e-7));
        self::assertSame('0.000001', Number::toText(0.000001));
        self::assertSame('123456789012345680000', Number::toText(123456789012345680000.0));
        self::assertSame('9007199254740991', Number::toText(9007199254740991.0));
        self::assertSame('-1234.5', Number::toText(-1234.5));
    }

    public function testShortestDigits(): void
    {
        self::assertSame([false, '12345', 4], Number::shortestDigits(1234.5));
        self::assertSame([false, '1', -2], Number::shortestDigits(0.001));
        self::assertSame([true, '5', 0], Number::shortestDigits(-0.5));
    }

    public function testFormatRoundsHalfAwayFromZero(): void
    {
        self::assertSame('2.68', Number::format(2.675, 2, '.', ','));
        self::assertSame('1.01', Number::format(1.005, 2, '.', ','));
        self::assertSame('-3', Number::format(-2.5, 0, '.', ','));
        self::assertSame('0.00', Number::format(-0.001, 2, '.', ','));
        self::assertSame('12,346', Number::format(12345.5, 0, '.', ','));
        self::assertSame('1.234.567,89', Number::format(1234567.891, 2, ',', '.'));
        self::assertSame('1,000.00', Number::format(999.999, 2, '.', ','));
    }

    public function testRound(): void
    {
        self::assertSame(2.68, Number::round(2.675, 2));
        self::assertSame(-3.0, Number::round(-2.5, 0));
        self::assertSame(1.0, Number::round(0.5, 0));
    }
}
