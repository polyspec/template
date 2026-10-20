<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;

/**
 * The JSON parser of the library as the extension registers it: a document gives the values of the library in its
 * order (an object is a MapValue, a number a float), and every text that is not one document is a BindError.
 */
final class JsonTest extends TestCase
{
    public function testTheExtensionRegistersJson(): void
    {
        $class = new \ReflectionClass(Json::class);
        $this->assertTrue($class->isInternal(), 'Json is not registered by the extension');
        $this->assertTrue($class->isFinal());
    }

    public function testParseKeepsTheDocumentOrderAndTheNumberRules(): void
    {
        $value = Json::parse('{"b":1,"a":[true,null,"x"],"10":{"k":1.5},"e":"é"}');

        $this->assertInstanceOf(MapValue::class, $value);
        $this->assertSame(['b', 'a', '10', 'e'], $value->keys());
        $this->assertSame(1.0, $value->get('b'));
        $this->assertSame([true, null, 'x'], $value->get('a'));
        $inner = $value->get('10');
        $this->assertInstanceOf(MapValue::class, $inner);
        $this->assertSame([['k', 1.5]], $inner->entries());
        $this->assertSame("\u{e9}", $value->get('e'));
        $this->assertSame([1.0, 'x'], Json::parse(' [1, "x"] '));
    }

    public function testADuplicateKeyKeepsTheLastValueInTheFirstPlace(): void
    {
        $value = Json::parse('{"a":1,"b":2,"a":3}');

        $this->assertInstanceOf(MapValue::class, $value);
        $this->assertSame([['a', 3.0], ['b', 2.0]], $value->entries());
    }

    public function testEveryTextThatIsNotOneDocumentIsABindError(): void
    {
        $deep = str_repeat('[', 65) . '1' . str_repeat(']', 65);
        $cases = [
            ['{"a":}', 'E_DATA_INVALID_JSON', 'unexpected character at offset 5'],
            ['[1,2', 'E_DATA_INVALID_JSON', 'expected "," or "]" at offset 4'],
            ['1 2', 'E_DATA_INVALID_JSON', 'unexpected character after the JSON value at offset 2'],
            ['"\ud800"', 'E_DATA_INVALID_UTF8', 'a \u escape leaves a surrogate unpaired'],
            ["\xff", 'E_DATA_INVALID_UTF8', 'invalid UTF-8 at byte 0'],
            ['12345678901234567890', 'E_DATA_NUMBER_RANGE', 'number 1.2345678901235E+19 is outside the safe range'],
            ['1e400', 'E_DATA_NUMBER_NOT_FINITE', 'number is not finite'],
            [$deep, 'E_DATA_DEPTH', 'lists and maps nest deeper than 64 levels'],
        ];
        foreach ($cases as [$text, $code, $message]) {
            try {
                Json::parse($text);
                $this->fail($code . ' expected for ' . $text);
            } catch (BindError $error) {
                $this->assertSame([$code, $message], [$error->errorCode, $error->getMessage()], $text);
            }
        }
    }
}
