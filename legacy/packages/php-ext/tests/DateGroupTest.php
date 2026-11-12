<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Functions\Dates;
use Polyspec\Template\Functions\FunctionError;
use Polyspec\Template\Functions\FunctionGroup;

/**
 * The date group of the built-in functions as the extension registers it: the offsets, the civil calendar, the Unix
 * seconds of a value and the format of the library, and the date and now functions that read the environment.
 */
final class DateGroupTest extends TestCase
{
    public function testTheExtensionRegistersTheDateGroup(): void
    {
        $class = new \ReflectionClass(Dates::class);
        $this->assertTrue($class->isInternal(), 'Dates is not registered by the extension');
        $this->assertTrue($class->isFinal());
        $this->assertTrue($class->implementsInterface(FunctionGroup::class));
    }

    public function testTheCalendarOperationsGiveTheResultsOfTheLibrary(): void
    {
        $this->assertSame([0, 32400, -19800, null, null], [
            Dates::parseOffset('Z'),
            Dates::parseOffset('+09:00'),
            Dates::parseOffset('-05:30'),
            Dates::parseOffset('+24:00'),
            Dates::parseOffset('9'),
        ]);
        $this->assertSame([0, 20746, [2026, 10, 20], [1969, 12, 31]], [
            Dates::daysFromCivil(1970, 1, 1),
            Dates::daysFromCivil(2026, 10, 20),
            Dates::civilFromDays(20746),
            Dates::civilFromDays(-1),
        ]);
        $this->assertSame([1, -1, 1792454400, 1792467000, 1792454523], [
            Dates::toUnixSeconds(1.9, 0),
            Dates::toUnixSeconds(-1.9, 0),
            Dates::toUnixSeconds('2026-10-20', 0),
            Dates::toUnixSeconds('2026-10-20T12:30:00+09:00', 0),
            Dates::toUnixSeconds('2026-10-20 01:02:03', 3600),
        ]);
        $this->assertSame(['1970-01-01 00:00:00', 'Tue, 20 Oct 2026'], [
            Dates::format(0, 'Y-m-d H:i:s', 0),
            Dates::format(1792472400, 'D, d M Y', 32400),
        ]);
    }

    public function testTheDateFunctionsReadTheEnvironment(): void
    {
        $table = Dates::table();
        $env = ['timezone' => 'Z', 'now' => 5.0];

        $this->assertSame(['date' => [2, 2], 'now' => [0, 0]], array_map(
            static fn (array $entry): array => [$entry['min'], $entry['max']],
            $table,
        ));
        $this->assertSame(['1970', '', 5.0], [
            ($table['date']['call'])([0.0, 'Y'], $env),
            ($table['date']['call'])([null, 'Y'], $env),
            ($table['now']['call'])([], $env),
        ]);
    }

    public function testTheDateFunctionsFailWithTheFunctionErrorOfTheLibrary(): void
    {
        $date = Dates::table()['date']['call'];
        $cases = [
            [static fn () => Dates::toUnixSeconds('2026-13-01', 0), '"2026-13-01" is not a date'],
            [static fn () => Dates::toUnixSeconds(true, 0), 'date requires a number or a string'],
            [static fn () => $date([0.0, 'Y'], ['timezone' => 'x', 'now' => 0.0]), '"x" is not a time zone offset'],
        ];
        foreach ($cases as [$call, $message]) {
            try {
                $call();
                $this->fail('a FunctionError expected: ' . $message);
            } catch (FunctionError $error) {
                $this->assertSame(['E_RUNTIME_TYPE', $message], [$error->errorCode, $error->getMessage()]);
            }
        }
    }
}
