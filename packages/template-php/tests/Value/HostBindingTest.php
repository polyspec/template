<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\Json;

/**
 * Host binding of PHP values and native objects (VAL-2, VAL-14, VAL-17 to VAL-20, FUN-46, ERR-13).
 *
 * The same scenarios run against the PHP extension in `packages/template-php-ext/tests/HostBindingTest.php`.
 */
final class HostBindingTest extends TestCase
{
    private const TEMPLATES = [
        'echo.tpl' => "<p>{= title}</p>\n",
        'keys.tpl' => "{= json(m) | raw}\n",
        'host-function.tpl' => "{= twice(n)}\n",
        'date-multibyte.tpl' => "{= date('2024-01-01T12:34:5\u{e9}', 'Y')}\n",
        'object-secret.tpl' => "[{= o.secret}]\n",
        'object-hidden.tpl' => "{= o.hidden()}\n",
        'object-fail.tpl' => "{= o.fail()}\n",
        'object-magic.tpl' => "{= o.magic()}\n",
        'object-name.tpl' => "x{= o.name}\n",
        'object-index.tpl' => "x{= o['name']}\n",
        'object-same.tpl' => "{= same(o, [o])}|{= o.same(o)}|{= Order::same(o)}\n",
        'object-returned.tpl' => "{= make().name}\n",
        'object-result.tpl' => "x{= o.bad()}\n",
        'define-object.tpl' => "[{# content}]\n",
        'define-body.tpl' => "{= x.name}\n",
    ];

    private AstProgram $program;

    protected function setUp(): void
    {
        $this->program = new AstProgram(new ArrayLoader(self::TEMPLATES));
    }

    /**
     * @param array<string, mixed> $options
     */
    private function failure(string $template, mixed $assign, array $options = []): TemplateError
    {
        try {
            $this->program->render($template, $assign, $options);
        } catch (TemplateError $error) {
            return $error;
        }
        $this->fail("{$template} did not fail");
    }

    public function testDateWithAMultibyteTimeIsNotADate(): void
    {
        $error = $this->failure('date-multibyte.tpl', []);
        $this->assertSame(['E_RUNTIME_TYPE', 1, 4], [$error->errorCode, $error->errorLine, $error->errorCol]);
    }

    public function testALanguageRuntimeErrorIsReportedAsAnInternalError(): void
    {
        // ERR-13: a PHP Error raised inside the engine becomes E_INTERNAL; an exception of the host passes unchanged.
        $broken = new AstProgram(new class () implements LoaderInterface {
            public function load(string $name): ?array
            {
                return ['ast' => ['type' => 'Template', 'name' => $name, 'body' => 'not a node list'], 'version' => '1'];
            }
        });
        try {
            $broken->render('page.tpl');
            $this->fail('the broken template rendered');
        } catch (TemplateError $error) {
            $this->assertSame(['E_INTERNAL', 'page.tpl', 0], [$error->errorCode, $error->template, $error->errorLine]);
        }
        $failing = new AstProgram(new class () implements LoaderInterface {
            public function load(string $name): ?array
            {
                throw new \RuntimeException('loader failed');
            }
        });
        $this->expectExceptionMessage('loader failed');
        $failing->render('page.tpl');
    }

    public function testMapKeysThatAreNotUtf8AreRejected(): void
    {
        // VAL-14, VAL-17: array keys and property names are checked like strings.
        foreach ([['m' => ["\xff" => 1]], ['m' => [["\xff" => 1]]], ['m' => (object) ["\xff" => 1]]] as $assign) {
            $this->assertSame('E_DATA_INVALID_UTF8', $this->failure('keys.tpl', $assign)->errorCode);
        }
        $this->assertSame('E_DATA_INVALID_UTF8', $this->failure('keys.tpl', [], ['define' => ["\xff" => 'keys.tpl']])->errorCode);
    }

    public function testVisibilityDoesNotDependOnTheCallerScope(): void
    {
        // VAL-19: private members stay hidden when render is called inside the object's own class.
        $holder = new SecretHolder();
        $this->assertSame("[]\n", $holder->renderInside($this->program, 'object-secret.tpl'));
        try {
            $holder->renderInside($this->program, 'object-hidden.tpl');
            $this->fail('a private method was called');
        } catch (TemplateError $error) {
            $this->assertSame('E_RUNTIME_UNKNOWN_FUNCTION', $error->errorCode);
        }
    }

    public function testCallIsNotConsulted(): void
    {
        // VAL-19: a name that only __call handles and a private method of a class with __call are unknown.
        foreach (['object-magic.tpl', 'object-hidden.tpl'] as $template) {
            $this->assertSame('E_RUNTIME_UNKNOWN_FUNCTION', $this->failure($template, ['o' => new MagicHolder()])->errorCode, $template);
        }
    }

    public function testAPublicPropertyThatCannotBeBoundFailsAtTheLookup(): void
    {
        // VAL-19: the property value is bound; the error points at the lookup expression.
        $object = new InvalidName();
        foreach (['object-name.tpl', 'object-index.tpl', 'object-result.tpl'] as $template) {
            $error = $this->failure($template, ['o' => $object]);
            $this->assertSame(['E_DATA_INVALID_UTF8', 1, 5], [$error->errorCode, $error->errorLine, $error->errorCol], $template);
        }
    }

    public function testASubclassOfStdClassIsAMapOfItsPublicProperties(): void
    {
        // VAL-14: instanceof stdClass, not the class name; JsonSerializable is tried first.
        $bag = new Bag();
        $bag->d = 2;
        $this->assertSame("{\"a\":1,\"d\":2}\n", $this->program->render('keys.tpl', ['m' => $bag]));
        $this->assertSame("{\"j\":true}\n", $this->program->render('keys.tpl', ['m' => new SerializableBag()]));
    }

    public function testFunctionsAndResourcesHaveNoBinding(): void
    {
        // VAL-14, VAL-18: closures, first-class callables and open or closed resources are rejected.
        $closed = fopen('php://memory', 'r');
        fclose($closed);
        foreach ([static fn () => 1, strlen(...), fopen('php://memory', 'r'), $closed] as $value) {
            $this->assertSame('E_DATA_UNSUPPORTED_TYPE', $this->failure('keys.tpl', ['m' => $value])->errorCode);
        }
    }

    public function testHostExceptionsKeepTheirMessage(): void
    {
        // FUN-46, VAL-14: an exception of host code is reported with its message.
        $error = $this->failure('keys.tpl', ['m' => new FailingSerializable()]);
        $this->assertSame(['E_RUNTIME_HOST_FUNCTION', 0], [$error->errorCode, $error->errorLine]);
        $this->assertStringContainsString('serialize exploded', $error->getMessage());
        $error = $this->failure('object-fail.tpl', ['o' => new Exploding()]);
        $this->assertSame('E_RUNTIME_HOST_FUNCTION', $error->errorCode);
        $this->assertStringContainsString('method exploded', $error->getMessage());
        $this->program->register('twice', static function (array $args): int {
            throw new \RuntimeException('function exploded');
        });
        $this->assertStringContainsString('function exploded', $this->failure('host-function.tpl', ['n' => 1])->getMessage());
    }

    public function testNativeObjectArgumentsArriveAsTheOriginalObject(): void
    {
        // VAL-18: a host function, a method and a class function receive the same PHP object.
        $object = new Exploding();
        $this->program->register('same', static fn (array $args): bool => $args[0] === $object && $args[1][0] === $object);
        $this->program->registerClass('Order', 'same', static fn (array $args): bool => $args[0] === $object);
        $this->assertSame("true|true|true\n", $this->program->render('object-same.tpl', ['o' => $object]));
    }

    public function testReturnedObjectsAndDefinitionDataKeepTheirInstances(): void
    {
        // VAL-11, VAL-18: a returned object and an object in definition data stay native objects.
        $object = new SecretHolder();
        $this->program->register('make', static fn (array $args): object => $object);
        $this->assertSame("n\n", $this->program->render('object-returned.tpl', []));
        $define = ['content' => ['template' => 'define-body.tpl', 'data' => ['x' => $object]]];
        $this->assertSame("[n\n]\n", $this->program->render('define-object.tpl', [], ['define' => $define]));
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
            $this->assertSame('E_DATA_DEPTH', $this->failure('keys.tpl', ['m' => $value])->errorCode);
        }
        $this->assertSame(str_repeat('[', 63) . str_repeat(']', 63) . "\n", $this->program->render('keys.tpl', ['m' => self::nested(63)]));
        $this->assertSame('E_DATA_DEPTH', $this->failure('keys.tpl', ['m' => self::nested(64)])->errorCode);
        $define = static fn (int $levels): array => ['define' => ['content' => ['template' => 'define-body.tpl', 'data' => ['y' => self::nested($levels)]]]];
        $this->assertSame("[\n]\n", $this->program->render('define-object.tpl', [], $define(63)));
        $this->assertSame('E_DATA_DEPTH', $this->failure('define-object.tpl', [], $define(64))->errorCode);
    }

    public function testNumbersAreCheckedByValue(): void
    {
        // VAL-2: the magnitude limit applies to integers and floats alike.
        foreach ([1e19, 2 ** 53, 9007199254740992.0, -9007199254740992] as $value) {
            $this->assertSame('E_DATA_NUMBER_RANGE', $this->failure('echo.tpl', ['title' => $value])->errorCode);
        }
        $this->assertSame('E_DATA_NUMBER_NOT_FINITE', $this->failure('echo.tpl', ['title' => NAN])->errorCode);
        $this->assertSame("<p>-9007199254740991</p>\n", $this->program->render('echo.tpl', ['title' => -9007199254740991.0]));
    }

    public function testJsonTextFailsAtTheFirstViolationInDocumentOrder(): void
    {
        // VAL-12: numbers, unpaired surrogates and the depth limit are checked in document order.
        $cases = [
            '"\ud800"' => 'E_DATA_INVALID_UTF8',
            '{"\udc00": 1}' => 'E_DATA_INVALID_UTF8',
            '{"a": 1e19, "b": "\ud800"}' => 'E_DATA_NUMBER_RANGE',
            '{"b": "\ud800", "a": 1e19}' => 'E_DATA_INVALID_UTF8',
            str_repeat('[', 200000) => 'E_DATA_DEPTH',
            '1' . str_repeat('0', 400) => 'E_DATA_NUMBER_NOT_FINITE',
        ];
        foreach ($cases as $text => $code) {
            try {
                Json::parse((string) $text);
                $this->fail("{$code} expected");
            } catch (\Polyspec\Template\Value\BindError $error) {
                $this->assertSame($code, $error->errorCode, substr((string) $text, 0, 40));
            }
        }
        $this->assertSame("\u{1F600}", Json::parse('"😀"'));
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

    public function renderInside(AstProgram $program, string $template): string
    {
        return $program->render($template, ['o' => $this]) . ($this->secret === '' ? $this->hidden() : '');
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
