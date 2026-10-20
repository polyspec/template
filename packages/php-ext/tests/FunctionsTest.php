<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\TemplateError;

/**
 * The built-in functions of the extension, as the PHP package tests them (FUN-37 to FUN-40): `date` formats unix
 * seconds and date strings in the timezone of the environment.
 */
final class FunctionsTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/template-ext-functions-' . getmypid();
        mkdir($this->root, 0o700, true);
        file_put_contents($this->root . '/date.tpl', '{= date(t, f)}');
    }

    protected function tearDown(): void
    {
        unlink($this->root . '/date.tpl');
        rmdir($this->root);
    }

    /** FUN-39: the output is computed in the fixed offset of the time zone; FUN-40: the format tokens. */
    public function testDateFormatsUnixSecondsAndDateStringsInTheTimezoneOfTheEnvironment(): void
    {
        $engine = new Engine($this->root);
        $cases = [
            [1789084800, 'Y-m-d H:i:s D P', '+09:00', '2026-09-11 09:00:00 Fri +09:00'],
            [0, 'Y-m-d l N w', 'Z', '1970-01-01 Thursday 4 4'],
            [-86400, 'Y-m-d', 'Z', '1969-12-31'],
            ['1970-01-02', 'Y-m-d H:i', '+09:00', '1970-01-02 00:00'],
            ['1970-01-01T00:00:00+01:00', 'Y-m-d H:i P', 'Z', '1969-12-31 23:00 +00:00'],
        ];
        foreach ($cases as [$value, $format, $timezone, $expected]) {
            self::assertSame(
                $expected,
                $engine->render(
                    'date.tpl',
                    ['t' => $value, 'f' => $format],
                    ['env' => ['timezone' => $timezone, 'now' => 0]],
                ),
                "date({$value}, {$format}) in {$timezone}",
            );
        }
    }

    public function testDateStringWithAnOffsetOutOfRangeFailsWithTheTypeError(): void
    {
        $engine = new Engine($this->root);
        foreach (['2024-01-01T12:00:00+25:00', '2024-01-01T12:00:00+05:60'] as $text) {
            try {
                $engine->render('date.tpl', ['t' => $text, 'f' => 'Y'], ['env' => ['timezone' => 'Z', 'now' => 0]]);
                self::fail("{$text} is accepted");
            } catch (TemplateError $error) {
                self::assertSame('E_RUNTIME_TYPE', $error->errorCode, $text);
            }
        }
    }
}
