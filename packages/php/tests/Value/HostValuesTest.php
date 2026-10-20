<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Tests\Support;
use Polyspec\Template\Value\Json;

/**
 * Host argument form (VAL-21) and native object equality (EXP-39) with the shared fixture of
 * tests/fixtures/native-object/host-values.json.
 *
 * The same scenarios run against the PHP extension (config/parity.json binds this file to it).
 */
final class HostValuesTest extends TestCase
{
    private static function fixtureDirectory(): string
    {
        return Support::repoRoot() . '/tests/fixtures/native-object';
    }

    /**
     * @return array{outputs: array<string, string>, errors: array<string, string>}
     */
    private static function expectations(): array
    {
        return Support::readJson(self::fixtureDirectory() . '/host-values.json');
    }

    /**
     * @return iterable<string, array{0: string, 1: string}>
     */
    public static function outputs(): iterable
    {
        foreach (self::expectations()['outputs'] as $target => $output) {
            yield $target => [$target, $output];
        }
    }

    private static function render(string $target): string
    {
        $order = new HostValueOrder();
        $program = new AstProgram(new FilesystemLoader(self::fixtureDirectory()));
        $program->register(
            'describe',
            static fn (array $args): string => HostValueOrder::describeArguments($args, $order),
        );
        $program->register('mutate', static function (array $args): mixed {
            $args[0][0] = 'changed';
            $args[0][] = 'added';
            $args[1]['k'] = 'changed';
            $args[1]['added'] = true;
            $args[2][] = 'added';

            return null;
        });
        $program->register('pick', static fn (array $args): mixed => $args[0]);
        $program->registerClass(
            'Order',
            'describe',
            static fn (array $args): string => HostValueOrder::describeArguments($args, $order),
        );

        return $program->render(
            $target,
            ['order' => $order, 'same' => $order, 'other' => new HostValueOrder(), 'items' => [1]],
        );
    }

    #[DataProvider('outputs')]
    public function testRendersTheSharedFixture(string $target, string $output): void
    {
        $this->assertSame($output, self::render($target));
    }

    public function testNativeObjectsHaveNoOrder(): void
    {
        foreach (self::expectations()['errors'] as $target => $code) {
            try {
                self::render($target);
                $this->fail("{$target} did not fail");
            } catch (TemplateError $error) {
                $this->assertSame($code, $error->errorCode, $target);
            }
        }
    }

    public function testAMapKeyThatIsADecimalIntegerArrivesAsAnIntegerKey(): void
    {
        // VAL-21: a map arrives as a PHP array, so the key conversion of PHP arrays applies.
        $program = new AstProgram(new ArrayLoader(['map-keys.tpl' => "{= describe(m) | raw}\n"]));
        $program->register('describe', static fn (array $args): string => json_encode(array_map(
            static fn (int|string $key): string => get_debug_type($key) . ':' . $key,
            array_keys($args[0]),
        ), JSON_THROW_ON_ERROR));
        $assign = Json::parse('{"m": {"b": 1, "2": 2, "-0": 3, "01": 4, "-3": 5}}');
        $this->assertSame(
            "[\"string:b\",\"int:2\",\"string:-0\",\"string:01\",\"int:-3\"]\n",
            $program->render('map-keys.tpl', $assign),
        );
    }
}
