<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

/**
 * The public API of the native engine (RT-1 to RT-6, FUN-43 to FUN-46).
 *
 * The templates of this suite are in `tests/templates`.
 */
final class EngineTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = __DIR__ . '/templates';
    }

    public function testExtensionIsLoaded(): void
    {
        $this->assertTrue(extension_loaded('polyspec_template'));
        $this->assertTrue(class_exists(Engine::class));
        $this->assertTrue(class_exists(TemplateError::class));
    }

    public function testParseReturnsNestedArrays(): void
    {
        $ast = Engine::parse('<b>{= a}</b>', 'x.tpl');
        $this->assertSame('Template', $ast['type']);
        $this->assertSame('x.tpl', $ast['name']);
        $this->assertSame('Text', $ast['body'][0]['type']);
        $this->assertSame('Echo', $ast['body'][1]['type']);
        $this->assertSame('a', $ast['body'][1]['expr']['name']);
        $this->assertSame([3, 8], $ast['body'][1]['span']);
    }

    public function testParseToJsonWritesIntegerLiteralsAsIntegers(): void
    {
        $json = Engine::parseToJson('{= 1e3}{= 1.50}', 'x.tpl');
        $this->assertStringContainsString('"value":1000', $json);
        $this->assertStringContainsString('"value":1.5', $json);
        $this->assertStringNotContainsString('1000.0', $json);
    }

    public function testParseCountsSpansInBytes(): void
    {
        $ast = Engine::parse("é{= a}", 'x.tpl');
        $this->assertSame([2, 7], $ast['body'][1]['span']);
    }

    public function testParseReportsAnErrorWithAPosition(): void
    {
        try {
            Engine::parse("a\n{? x}", 'x.tpl');
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_PARSE_UNCLOSED_BLOCK', $error->getErrorCode());
            $this->assertSame('x.tpl', $error->getTemplate());
            $this->assertSame(2, $error->getErrorLine());
            $this->assertSame(1, $error->getErrorCol());
            $this->assertNotSame('', $error->getMessage());
            $this->assertSame(
                ['code', 'template', 'line', 'col', 'offset', 'end', 'message'],
                array_keys($error->toArray()),
            );
            $this->assertInstanceOf(\Exception::class, $error);
        }
    }

    public function testRenderEscapesAndReadsPhpData(): void
    {
        $engine = new Engine($this->root);
        $this->assertSame("<p>a&lt;b&gt;</p>\n", $engine->render('echo.tpl', ['title' => 'a<b>']));
    }

    public function testRenderAcceptsAnEmptyArrayAsData(): void
    {
        $engine = new Engine($this->root);
        $this->assertSame("<p></p>\n", $engine->render('echo.tpl', []));
    }

    public function testRenderRejectsAnIntegerOutsideTheSafeRange(): void
    {
        $engine = new Engine($this->root);
        try {
            $engine->render('echo.tpl', ['title' => 9007199254740992]);
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_DATA_NUMBER_RANGE', $error->getErrorCode());
            $this->assertSame(0, $error->getErrorLine());
        }
    }

    public function testRenderAcceptsAFloatOutsideTheSafeIntegerRange(): void
    {
        $engine = new Engine($this->root);
        $this->assertSame("<p>1e+21</p>\n", $engine->render('echo.tpl', ['title' => 1e21]));
    }

    public function testRenderRejectsAStringThatIsNotUtf8(): void
    {
        $engine = new Engine($this->root);
        try {
            $engine->render('echo.tpl', ['title' => "\xff"]);
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_DATA_INVALID_UTF8', $error->getErrorCode());
        }
    }

    public function testRenderBindsAPhpArrayWithStringKeysAsAMap(): void
    {
        $engine = new Engine($this->root);
        $this->assertSame(
            "{\"2\":1,\"1\":2,\"x\":3}\n",
            $engine->render('keys.tpl', ['m' => ['2' => 1, '1' => 2, 'x' => 3]]),
        );
    }

    public function testRenderBindsStdClassAsAMap(): void
    {
        // VAL-14: a stdClass is a map of its properties, also when it is empty or its keys look like a list.
        $engine = new Engine($this->root);
        $this->assertSame("{\"0\":\"a\",\"x\":1}\n", $engine->render('keys.tpl', ['m' => (object) ['0' => 'a', 'x' => 1]]));
        $this->assertSame("{}\n", $engine->render('keys.tpl', ['m' => new \stdClass()]));
        $this->assertSame("{}\n", $engine->render('keys.tpl', (object) ['m' => new \stdClass()]));
    }

    public function testRenderBindsJsonSerializableAsItsValue(): void
    {
        // VAL-14: an object implementing JsonSerializable binds the value of jsonSerialize().
        $engine = new Engine($this->root);
        $value = new class () implements \JsonSerializable {
            public function jsonSerialize(): mixed
            {
                return ['b' => 2, 'c' => (object) []];
            }
        };
        $this->assertSame("{\"b\":2,\"c\":{}}\n", $engine->render('keys.tpl', ['m' => $value]));
    }

    public function testRenderRetainsAnObjectWithItsPublicMembers(): void
    {
        // VAL-14, VAL-18, VAL-19: other objects keep the instance; only public properties and methods are visible.
        $engine = new Engine($this->root);
        $this->assertSame("1|||x:1|y\n", $engine->render('object.tpl', ['o' => self::object()]));
        foreach (['object-hidden.tpl' => 'E_RUNTIME_UNKNOWN_FUNCTION', 'object-fail.tpl' => 'E_RUNTIME_HOST_FUNCTION', 'object-echo.tpl' => 'E_RUNTIME_STRINGIFY'] as $template => $code) {
            try {
                $engine->render($template, ['o' => self::object()]);
                $this->fail("expected {$code} for {$template}");
            } catch (TemplateError $error) {
                $this->assertSame($code, $error->getErrorCode(), $template);
            }
        }
    }

    public function testRegisterClassMakesAClassFunctionCallable(): void
    {
        // FUN-43, VAL-19: a logical class function is registered by class name and function name.
        $engine = new Engine($this->root);
        $engine->registerClass('Order', 'status_label', static fn (array $args): string => $args[0] . ':ok');
        $this->assertSame("ready:ok\n", $engine->render('class-call.tpl', []));
    }

    private static function object(): object
    {
        return new class () {
            public int $a = 1;
            private int $secret = 2;

            public function label(string $prefix): string
            {
                return $prefix . ':' . $this->a . ($this->secret > 2 ? '' : '');
            }

            public function fail(): string
            {
                throw new \RuntimeException('failed');
            }

            private function hidden(): string
            {
                return 'hidden';
            }
        };
    }

    public function testRenderJsonKeepsTheDocumentOrderOfIntegerLikeKeys(): void
    {
        $engine = new Engine($this->root);
        $this->assertSame(
            "{\"2\":1,\"1\":2,\"x\":3}\n",
            $engine->renderJson('keys.tpl', '{"m": {"2": 1, "1": 2, "x": 3}}'),
        );
    }

    public function testRenderJsonRejectsAnIntegerLiteralOutsideTheSafeRange(): void
    {
        $engine = new Engine($this->root);
        try {
            $engine->renderJson('echo.tpl', '{"title": 9007199254740992}');
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_DATA_NUMBER_RANGE', $error->getErrorCode());
        }
    }

    public function testRegisterCallsAPhpFunction(): void
    {
        $engine = new Engine($this->root);
        $engine->register('twice', static fn (array $args, array $env) => $args[0] * 2);
        $this->assertSame("8\n", $engine->render('host-function.tpl', ['n' => 4]));
    }

    public function testRegisterPassesTheEnvironment(): void
    {
        $engine = new Engine($this->root);
        $engine->register('twice', static fn (array $args, array $env) => $env['timezone']);
        $this->assertSame("+09:00\n", $engine->render('host-function.tpl', ['n' => 1], ['env' => ['timezone' => '+09:00', 'now' => 0]]));
    }

    public function testRegisterReportsAFailingFunction(): void
    {
        $engine = new Engine($this->root);
        $engine->register('twice', static function (array $args, array $env) {
            throw new \RuntimeException('no');
        });
        try {
            $engine->render('host-function.tpl', ['n' => 1]);
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_RUNTIME_HOST_FUNCTION', $error->getErrorCode());
        }
    }

    public function testRegisterRejectsABuiltInName(): void
    {
        $engine = new Engine($this->root);
        $this->expectException(\Exception::class);
        $engine->register('upper', static fn (array $args, array $env) => '');
    }

    public function testUnknownFunctionIsReported(): void
    {
        $engine = new Engine($this->root);
        try {
            $engine->render('host-function.tpl', ['n' => 1]);
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_RUNTIME_UNKNOWN_FUNCTION', $error->getErrorCode());
        }
    }

    public function testLimitsAreApplied(): void
    {
        $engine = new Engine($this->root, ['limits' => ['iterations' => 1]]);
        try {
            $engine->renderJson('loop.tpl', '{"items": [1, 2, 3]}');
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_RUNTIME_LIMIT', $error->getErrorCode());
        }
    }

    public function testDelimitersOptionIsUsed(): void
    {
        $ast = Engine::parse(';= a;', 'x.tpl', ['delimiters' => ';;']);
        $this->assertSame('Echo', $ast['body'][0]['type']);
    }

    public function testMissingTemplateIsReported(): void
    {
        $engine = new Engine($this->root);
        try {
            $engine->render('absent.tpl', []);
            $this->fail('expected an error');
        } catch (TemplateError $error) {
            $this->assertSame('E_LOAD_NOT_FOUND', $error->getErrorCode());
        }
    }
}
