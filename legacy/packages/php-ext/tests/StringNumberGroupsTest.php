<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Functions\FunctionError;
use Polyspec\Template\Functions\FunctionGroup;
use Polyspec\Template\Functions\Numbers;
use Polyspec\Template\Functions\Strings;
use Polyspec\Template\Value\SafeString;

/**
 * The string and number groups of the built-in functions as the extension registers them: each table names its
 * functions in the order of the library, with their argument counts and a callable that gives the result of the
 * library or fails with its FunctionError.
 */
final class StringNumberGroupsTest extends TestCase
{
    public function testTheExtensionRegistersTheGroups(): void
    {
        foreach ([Strings::class, Numbers::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
            $this->assertTrue($class->implementsInterface(FunctionGroup::class));
        }
    }

    public function testTheTablesNameTheFunctionsWithTheirArgumentCounts(): void
    {
        $this->assertSame(
            [
                'upper' => [1, 1], 'lower' => [1, 1], 'trim' => [1, 2], 'replace' => [3, 3], 'split' => [2, 2],
                'truncate' => [2, 3], 'contains' => [2, 2], 'starts_with' => [2, 2], 'ends_with' => [2, 2],
                'length' => [1, 1],
            ],
            self::counts(Strings::table()),
        );
        $this->assertSame(
            [
                'number' => [1, 4], 'round' => [1, 2], 'floor' => [1, 1], 'ceil' => [1, 1], 'abs' => [1, 1],
                'min' => [1, PHP_INT_MAX], 'max' => [1, PHP_INT_MAX], 'num' => [1, 1],
            ],
            self::counts(Numbers::table()),
        );
    }

    public function testTheCallablesGiveTheResultsOfTheLibrary(): void
    {
        $strings = Strings::table();
        $numbers = Numbers::table();
        $this->assertSame(
            ['AB', 'É', 'a', 'xbx', ['a', 'b'], 'ab...', true, true, false, 3.0],
            [
                ($strings['upper']['call'])(['ab']),
                ($strings['lower']['call'])([new SafeString('É')]),
                ($strings['trim']['call'])(['  a  ']),
                ($strings['replace']['call'])(['aba', 'a', 'x']),
                ($strings['split']['call'])(['a,b', ',']),
                ($strings['truncate']['call'])(['abcdef', 2]),
                ($strings['contains']['call'])(['abc', 'b']),
                ($strings['starts_with']['call'])(['abc', 'a']),
                ($strings['ends_with']['call'])(['abc', 'b']),
                ($strings['length']['call'])(['aéb']),
            ],
        );
        $this->assertSame(
            ['1,234.5', '1 234,50', 2.35, 2.0, -1.0, 2.0, 1.0, 3.0, 4.5],
            [
                ($numbers['number']['call'])([1234.5, 1.0]),
                ($numbers['number']['call'])([1234.5, 2.0, ',', ' ']),
                ($numbers['round']['call'])([2.345, 2.0]),
                ($numbers['floor']['call'])([2.7]),
                ($numbers['ceil']['call'])([-1.5]),
                ($numbers['abs']['call'])([-2.0]),
                ($numbers['min']['call'])([3.0, 1.0, 2.0]),
                ($numbers['max']['call'])([3.0, 1.0, 2.0]),
                ($numbers['num']['call'])(['4.5']),
            ],
        );
    }

    public function testTheCallablesFailWithTheFunctionErrorOfTheLibrary(): void
    {
        $strings = Strings::table();
        $numbers = Numbers::table();
        $cases = [
            [$strings['upper']['call'], [1.0], 'E_RUNTIME_TYPE', 'upper requires a string, got number'],
            [$strings['split']['call'], ['a', ''], 'E_RUNTIME_TYPE', 'split requires a non-empty separator'],
            [$numbers['round']['call'], [1.0, -1.0], 'E_RUNTIME_TYPE', 'round requires a non-negative decimal count'],
            [$numbers['num']['call'], ['x'], 'E_RUNTIME_TYPE', '"x" is not a number'],
        ];
        foreach ($cases as [$call, $args, $code, $message]) {
            try {
                $call($args);
                $this->fail($code . ' expected: ' . $message);
            } catch (FunctionError $error) {
                $this->assertSame([$code, $message], [$error->errorCode, $error->getMessage()]);
            }
        }
    }

    /**
     * @param array<string, array{min: int, max: int, call: callable}> $table
     * @return array<string, array{0: int, 1: int}>
     */
    private static function counts(array $table): array
    {
        $counts = [];
        foreach ($table as $name => $entry) {
            self::assertIsCallable($entry['call']);
            $counts[$name] = [$entry['min'], $entry['max']];
        }

        return $counts;
    }
}
