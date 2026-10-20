<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Functions\Collection;
use Polyspec\Template\Functions\Encoding;
use Polyspec\Template\Functions\FunctionError;
use Polyspec\Template\Functions\FunctionGroup;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * The encoding and collection groups of the built-in functions as the extension registers them: their tables, the
 * results of their callables, and the JSON text and the percent-encoding that Encoding gives to other code.
 */
final class EncodingCollectionGroupsTest extends TestCase
{
    public function testTheExtensionRegistersTheGroups(): void
    {
        foreach ([Encoding::class, Collection::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
            $this->assertTrue($class->implementsInterface(FunctionGroup::class));
        }
        $this->assertSame(1000000, Collection::RANGE_LIMIT);
    }

    public function testTheTablesNameTheFunctionsWithTheirArgumentCounts(): void
    {
        $this->assertSame(
            ['escape' => [1, 1], 'raw' => [1, 1], 'json' => [1, 1], 'url' => [1, 1], 'nl2br' => [1, 1],
                'str' => [1, 1], 'type' => [1, 1]],
            self::counts(Encoding::table()),
        );
        $this->assertSame(
            ['keys' => [1, 1], 'values' => [1, 1], 'first' => [1, 1], 'last' => [1, 1], 'reverse' => [1, 1],
                'slice' => [2, 3], 'sort' => [1, 2], 'join' => [1, 2], 'range' => [2, 3], 'default' => [2, 2]],
            self::counts(Collection::table()),
        );
    }

    public function testEncodingGivesTheJsonTextAndThePercentEncodingOfTheLibrary(): void
    {
        $map = new MapValue();
        $map->set('a', [1.0, true, null, new SafeString('<b>')]);
        $map->set('é', 'x"y');

        $this->assertSame('{"a":[1,true,null,"\u003cb\u003e"],"é":"x\"y"}', Encoding::toJson($map));
        $this->assertSame('a%20b%2F%C3%A9~', Encoding::percentEncode('a b/é~'));
        try {
            Encoding::toJson(new \stdClass());
            $this->fail('a FunctionError expected');
        } catch (FunctionError $error) {
            $this->assertSame(
                ['E_RUNTIME_TYPE', 'json does not accept a native object'],
                [$error->errorCode, $error->getMessage()],
            );
        }
    }

    public function testTheCallablesGiveTheResultsOfTheLibrary(): void
    {
        $encoding = Encoding::table();
        $collection = Collection::table();
        $map = new MapValue();
        $map->set('b', 2.0);
        $map->set('a', 1.0);

        $escaped = ($encoding['escape']['call'])(['<a>']);
        $raw = ($encoding['raw']['call'])(['<a>']);
        $this->assertInstanceOf(SafeString::class, $raw);
        $this->assertSame(
            ['&lt;a&gt;', '<a>', '[1,"x"]', 'a%26b', '1.5', 'list'],
            [
                $escaped instanceof SafeString ? $escaped->text : $escaped,
                $raw->text,
                ($encoding['json']['call'])([[1.0, 'x']]),
                ($encoding['url']['call'])(['a&b']),
                ($encoding['str']['call'])([1.5]),
                ($encoding['type']['call'])([[]]),
            ],
        );
        $this->assertSame(
            [
                ['b', 'a'], [2.0, 1.0], 1.0, 3.0, [3.0, 2.0, 1.0], [2.0, 3.0], [1.0, 2.0, 3.0], 'a-b',
                [1.0, 3.0, 5.0], 'd',
            ],
            [
                ($collection['keys']['call'])([$map]),
                ($collection['values']['call'])([$map]),
                ($collection['first']['call'])([[1.0, 2.0, 3.0]]),
                ($collection['last']['call'])([[1.0, 2.0, 3.0]]),
                ($collection['reverse']['call'])([[1.0, 2.0, 3.0]]),
                ($collection['slice']['call'])([[1.0, 2.0, 3.0], 1.0]),
                ($collection['sort']['call'])([[3.0, 1.0, 2.0]]),
                ($collection['join']['call'])([['a', 'b'], '-']),
                ($collection['range']['call'])([1.0, 6.0, 2.0]),
                ($collection['default']['call'])([null, 'd']),
            ],
        );
    }

    public function testTheCallablesFailWithTheFunctionErrorOfTheLibrary(): void
    {
        $collection = Collection::table();
        try {
            ($collection['range']['call'])([0.0, 2000000.0]);
            $this->fail('a FunctionError expected');
        } catch (FunctionError $error) {
            $this->assertSame('E_RUNTIME_LIMIT', $error->errorCode);
        }
        try {
            ($collection['keys']['call'])(['a']);
            $this->fail('a FunctionError expected');
        } catch (FunctionError $error) {
            $this->assertSame('E_RUNTIME_TYPE', $error->errorCode);
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
