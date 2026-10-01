<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

/**
 * Host binding of PHP values and native objects (VAL-2, VAL-14, VAL-17 to VAL-20, FUN-46, ERR-13).
 *
 * The same scenarios run against the PHP AST runtime in `packages/template-php/tests/Value/HostBindingTest.php`.
 */
final class HostBindingTest extends TestCase
{
    private Engine $engine;

    protected function setUp(): void
    {
        $this->engine = new Engine(__DIR__ . '/templates');
    }

    /**
     * @param array<string, mixed> $options
     */
    private function failure(string $template, mixed $assign, array $options = []): TemplateError
    {
        try {
            $this->engine->render($template, $assign, $options);
        } catch (TemplateError $error) {
            return $error;
        }
        $this->fail("{$template} did not fail");
    }

    public function testDateWithAMultibyteTimeFailsWithoutAbortingThePhpProcess(): void
    {
        $error = $this->failure('date-multibyte.tpl', []);
        $this->assertSame(['E_RUNTIME_TYPE', 1, 4], [$error->getErrorCode(), $error->getErrorLine(), $error->getErrorCol()]);
    }

    public function testEveryMethodOfTheExtensionRunsInsideThePanicBoundary(): void
    {
        // ERR-13: a method handler cannot unwind into PHP, so every PHP method of the extension calls boundary().
        foreach (glob(dirname(__DIR__) . '/src/*.rs') ?: [] as $file) {
            $source = (string) file_get_contents($file);
            preg_match_all('/#\[php_impl\]\nimpl \w+ \{\n(.*?)\n\}\n/s', $source, $blocks);
            foreach ($blocks[1] as $block) {
                preg_match_all('/pub fn (\w+)\([^{]*\{\n\s*([^\n]*)/', $block, $methods, PREG_SET_ORDER);
                $this->assertNotSame([], $methods, $file);
                foreach ($methods as [, $name, $firstLine]) {
                    $this->assertStringStartsWith('boundary(', $firstLine, "{$file}: {$name}");
                }
            }
        }
    }

    public function testMapKeysThatAreNotUtf8AreRejected(): void
    {
        // VAL-14, VAL-17: array keys and property names are checked like strings.
        foreach ([['m' => ["\xff" => 1]], ['m' => [["\xff" => 1]]], ['m' => (object) ["\xff" => 1]]] as $assign) {
            $this->assertSame('E_DATA_INVALID_UTF8', $this->failure('keys.tpl', $assign)->getErrorCode());
        }
        $error = $this->failure('keys.tpl', [], ['define' => ["\xff" => 'keys.tpl']]);
        $this->assertSame('E_DATA_INVALID_UTF8', $error->getErrorCode());
    }

    public function testVisibilityDoesNotDependOnTheCallerScope(): void
    {
        // VAL-19: private members stay hidden when render is called inside the object's own class.
        $holder = new SecretHolder();
        $this->assertSame("[]\n", $holder->renderInside($this->engine, 'object-secret.tpl'));
        try {
            $holder->renderInside($this->engine, 'object-hidden.tpl');
            $this->fail('a private method was called');
        } catch (TemplateError $error) {
            $this->assertSame('E_RUNTIME_UNKNOWN_FUNCTION', $error->getErrorCode());
        }
    }

    public function testCallIsNotConsulted(): void
    {
        // VAL-19: a name that only __call handles and a private method of a class with __call are unknown.
        foreach (['object-magic.tpl', 'object-hidden.tpl'] as $template) {
            $this->assertSame('E_RUNTIME_UNKNOWN_FUNCTION', $this->failure($template, ['o' => new MagicHolder()])->getErrorCode(), $template);
        }
    }

    public function testAPublicPropertyThatCannotBeBoundFailsAtTheLookup(): void
    {
        // VAL-19: the property value is bound; the error points at the lookup expression.
        $object = new InvalidName();
        foreach (['object-name.tpl', 'object-index.tpl'] as $template) {
            $error = $this->failure($template, ['o' => $object]);
            $this->assertSame(['E_DATA_INVALID_UTF8', 1, 5], [$error->getErrorCode(), $error->getErrorLine(), $error->getErrorCol()], $template);
        }
        $error = $this->failure('object-result.tpl', ['o' => $object]);
        $this->assertSame(['E_DATA_INVALID_UTF8', 1, 5], [$error->getErrorCode(), $error->getErrorLine(), $error->getErrorCol()]);
    }

    public function testASubclassOfStdClassIsAMapOfItsPublicProperties(): void
    {
        // VAL-14: instanceof stdClass, not the class name; JsonSerializable is tried first.
        $bag = new Bag();
        $bag->d = 2;
        $this->assertSame("{\"a\":1,\"d\":2}\n", $this->engine->render('keys.tpl', ['m' => $bag]));
        $this->assertSame("{\"j\":true}\n", $this->engine->render('keys.tpl', ['m' => new SerializableBag()]));
    }

    public function testFunctionsAndResourcesHaveNoBinding(): void
    {
        // VAL-14, VAL-18: closures, first-class callables and open or closed resources are rejected.
        $closed = fopen('php://memory', 'r');
        fclose($closed);
        foreach ([static fn () => 1, strlen(...), fopen('php://memory', 'r'), $closed] as $value) {
            $this->assertSame('E_DATA_UNSUPPORTED_TYPE', $this->failure('keys.tpl', ['m' => $value])->getErrorCode());
        }
    }

    public function testHostExceptionsKeepTheirMessage(): void
    {
        // FUN-46, VAL-14: the pending PHP exception is taken and its message is reported.
        $error = $this->failure('keys.tpl', ['m' => new FailingSerializable()]);
        $this->assertSame(['E_RUNTIME_HOST_FUNCTION', 0], [$error->getErrorCode(), $error->getErrorLine()]);
        $this->assertStringContainsString('serialize exploded', $error->getMessage());
        $error = $this->failure('object-fail.tpl', ['o' => new Exploding()]);
        $this->assertSame('E_RUNTIME_HOST_FUNCTION', $error->getErrorCode());
        $this->assertStringContainsString('method exploded', $error->getMessage());
        $this->engine->register('twice', static function (array $args): int {
            throw new \RuntimeException('function exploded');
        });
        $error = $this->failure('host-function.tpl', ['n' => 1]);
        $this->assertStringContainsString('function exploded', $error->getMessage());
    }

    public function testNativeObjectArgumentsArriveAsTheOriginalObject(): void
    {
        // VAL-18: a host function, a method and a class function receive the same PHP object.
        $object = new Exploding();
        $this->engine->register('same', static fn (array $args): bool => $args[0] === $object && $args[1][0] === $object);
        $this->engine->registerClass('Order', 'same', static fn (array $args): bool => $args[0] === $object);
        $this->assertSame("true|true|true\n", $this->engine->render('object-same.tpl', ['o' => $object]));
    }

    public function testReturnedObjectsAndDefinitionDataKeepTheirInstances(): void
    {
        // VAL-11, VAL-18: a returned object and an object in definition data stay native objects.
        $object = new SecretHolder();
        $this->engine->register('make', static fn (array $args): object => $object);
        $this->assertSame("n\n", $this->engine->render('object-returned.tpl', []));
        $define = ['content' => ['template' => 'define-body.tpl', 'data' => ['x' => $object]]];
        $this->assertSame("[n\n]\n", $this->engine->render('define-object.tpl', [], ['define' => $define]));
    }

    public function testCyclicAndDeepValuesFailWithTheDepthError(): void
    {
        // VAL-20: the depth limit stops cycles of objects, arrays and jsonSerialize() without a crash.
        $cycle = new \stdClass();
        $cycle->self = $cycle;
        $deep = [];
        // PHP itself cannot destroy an array nested about 100000 levels deep, so the test stays below that.
        for ($i = 0; $i < 50000; $i++) {
            $deep = [$deep];
        }
        $reference = [];
        $reference['x'] = &$reference;
        foreach ([$cycle, $deep, $reference, new SelfSerializing()] as $value) {
            $this->assertSame('E_DATA_DEPTH', $this->failure('keys.tpl', ['m' => $value])->getErrorCode());
        }
        $this->assertSame(str_repeat('[', 63) . str_repeat(']', 63) . "\n", $this->engine->render('keys.tpl', ['m' => self::nested(63)]));
        $this->assertSame('E_DATA_DEPTH', $this->failure('keys.tpl', ['m' => self::nested(64)])->getErrorCode());
        $define = static fn (int $levels): array => ['define' => ['content' => ['template' => 'define-body.tpl', 'data' => ['y' => self::nested($levels)]]]];
        $this->assertSame("[\n]\n", $this->engine->render('define-object.tpl', [], $define(63)));
        $this->assertSame('E_DATA_DEPTH', $this->failure('define-object.tpl', [], $define(64))->getErrorCode());
    }

    public function testNumbersAreCheckedByValue(): void
    {
        // VAL-2: the magnitude limit applies to integers and floats alike.
        foreach ([1e19, 2 ** 53, 9007199254740992.0, -9007199254740992] as $value) {
            $this->assertSame('E_DATA_NUMBER_RANGE', $this->failure('echo.tpl', ['title' => $value])->getErrorCode());
        }
        $this->assertSame('E_DATA_NUMBER_NOT_FINITE', $this->failure('echo.tpl', ['title' => NAN])->getErrorCode());
        $this->assertSame("<p>-9007199254740991</p>\n", $this->engine->render('echo.tpl', ['title' => -9007199254740991.0]));
    }

    /**
     * A list whose depth is `$levels`; the empty innermost list has depth 1.
     *
     * @return list<mixed>
     */
    private static function nested(int $levels): array
    {
        $value = [];
        for ($i = 1; $i < $levels; $i++) {
            $value = [$value];
        }

        return $value;
    }
}

final class SecretHolder
{
    public string $name = 'n';
    private string $secret = 's';

    public function renderInside(Engine $engine, string $template): string
    {
        return $engine->render($template, ['o' => $this]) . ($this->secret === '' ? $this->hidden() : '');
    }

    private function hidden(): string
    {
        return 'h';
    }
}

final class MagicHolder
{
    /**
     * @param list<mixed> $arguments
     */
    public function __call(string $name, array $arguments): string
    {
        return 'magic:' . $name;
    }

    public function visible(): string
    {
        return $this->hidden();
    }

    private function hidden(): string
    {
        return 'h';
    }
}

final class InvalidName
{
    public string $name = "\xff";

    public function bad(): string
    {
        return "\xff";
    }
}

class Bag extends \stdClass
{
    public int $a = 1;
    private int $p = 3;

    public function hiddenValue(): int
    {
        return $this->p;
    }
}

final class SerializableBag extends \stdClass implements \JsonSerializable
{
    public int $a = 1;

    public function jsonSerialize(): mixed
    {
        return ['j' => true];
    }
}

final class FailingSerializable implements \JsonSerializable
{
    public function jsonSerialize(): mixed
    {
        throw new \RuntimeException('serialize exploded');
    }
}

final class SelfSerializing implements \JsonSerializable
{
    public function jsonSerialize(): mixed
    {
        return $this;
    }
}

final class Exploding
{
    public function fail(): string
    {
        throw new \RuntimeException('method exploded');
    }

    public function same(object $other): bool
    {
        return $other === $this;
    }
}
