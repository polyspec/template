<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\BoundMap;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Tests\Support;
use Polyspec\Template\Value\MapValue;

/**
 * Bound data (VAL-22, ERR-14, RT-61) with the shared fixture of tests/fixtures/bound-data/cases.json.
 *
 * The same scenarios run against the PHP extension in `packages/template-php-ext/tests/BoundMapTest.php`,
 * which also checks that each implementation rejects the bound maps of the other.
 */
final class BoundMapTest extends TestCase
{
    private static function fixtureDirectory(): string
    {
        return Support::repoRoot() . '/tests/fixtures/bound-data';
    }

    /**
     * @return array<string, mixed>
     */
    private static function cases(): array
    {
        return json_decode((string) file_get_contents(self::fixtureDirectory() . '/cases.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    private static function program(mixed $result = null): AstProgram
    {
        $program = new AstProgram(new FilesystemLoader(self::fixtureDirectory()));
        $program->register('pick', static fn (): mixed => $result);

        return $program;
    }

    /**
     * @return array{define: array<string, array{template: string, data: mixed}>}
     */
    private static function definition(mixed $data): array
    {
        return ['define' => ['part' => ['template' => 'part.tpl', 'data' => $data]]];
    }

    private static function failure(\Closure $operation): TemplateError
    {
        try {
            $operation();
        } catch (TemplateError $error) {
            return $error;
        }
        self::fail('the operation did not fail');
    }

    private static function assertBindFailure(TemplateError $error, string $code): void
    {
        self::assertSame(
            [$code, '', 0, 0, 0, 0],
            [$error->errorCode, $error->template, $error->errorLine, $error->errorCol, $error->offset, $error->end],
            $error->getMessage(),
        );
    }

    /** @return list<string> */
    private static function keys(BoundMap $bound): array
    {
        $entries = (fn (): MapValue => $this->entries)->call($bound);

        return $entries->keys();
    }

    public function testBoundMapRendersTheBytesOfTheHostMap(): void
    {
        $cases = self::cases();
        self::assertSame($cases['outputs']['page'], self::program()->render('page.tpl', BoundMap::bind($cases['assign'])));
        self::assertSame($cases['outputs']['page'], self::program()->render('page.tpl', $cases['assign']));
        $prepared = self::program()->prepare('page.tpl', BoundMap::bind($cases['assign']));
        self::assertSame($cases['outputs']['page'], $prepared->render());
        self::assertSame($cases['outputs']['page'], $prepared->render());
    }

    public function testBoundMapKeepsTheValuesThatBindChecked(): void
    {
        $cases = self::cases();
        $inner = new \stdClass();
        $inner->k = 'v';
        $assign = ['a' => '1', 'b' => 'x', 'list' => [1, 2], 'm' => $inner];
        $bound = BoundMap::bind($assign);
        $inner->k = 'changed';
        self::assertSame($cases['outputs']['page'], self::program()->render('page.tpl', $bound));
    }

    public function testMergeFollowsThePrecedenceOfRt26(): void
    {
        $cases = self::cases();
        $merged = BoundMap::merge(BoundMap::bind($cases['assign']), BoundMap::bind($cases['second']));
        self::assertSame($cases['mergedKeys'], self::keys($merged));
        self::assertSame($cases['outputs']['merged'], self::program()->render('page.tpl', $merged));
        self::assertSame($cases['outputs']['merged'], self::program()->render('page.tpl', [...$cases['assign'], ...$cases['second']]));
    }

    public function testBoundMapIsDefinitionData(): void
    {
        $cases = self::cases();
        self::assertSame($cases['outputs']['define'], self::program()->render('define.tpl', $cases['assign'], self::definition(BoundMap::bind($cases['definitionData']))));
        self::assertSame($cases['outputs']['define'], self::program()->render('define.tpl', $cases['assign'], self::definition($cases['definitionData'])));
    }

    public function testNullAndTheEmptyArrayGiveTheEmptyBoundMap(): void
    {
        $cases = self::cases();
        foreach ([null, []] as $empty) {
            $bound = BoundMap::bind($empty);
            self::assertSame([], self::keys($bound));
            self::assertSame($cases['outputs']['empty'], self::program()->render('empty.tpl', $bound));
        }
    }

    public function testBindReturnsABoundMapUnchanged(): void
    {
        $bound = BoundMap::bind(['a' => 1]);
        self::assertSame($bound, BoundMap::bind($bound));
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function rejections(): iterable
    {
        foreach (array_keys(self::cases()['rejections']) as $name) {
            yield $name => [$name];
        }
    }

    #[DataProvider('rejections')]
    public function testBoundMapIsRejectedAtThePosition(string $name): void
    {
        $cases = self::cases();
        $bound = BoundMap::bind(['k' => 'v']);
        $error = match ($name) {
            'list' => self::failure(static fn () => self::program()->render('page.tpl', [...$cases['assign'], 'items' => [$bound]])),
            'map' => self::failure(static fn () => self::program()->render('page.tpl', [...$cases['assign'], 'inner' => ['k' => $bound]])),
            'bind' => self::failure(static fn () => BoundMap::bind(['k' => $bound])),
            'definitionData' => self::failure(static fn () => self::program()->render('define.tpl', $cases['assign'], self::definition(['k' => $bound]))),
            'result' => self::failure(static fn () => self::program($bound)->render('result.tpl', [])),
        };
        $position = $cases['rejections'][$name];
        self::assertSame(
            ['E_DATA_UNSUPPORTED_TYPE', $position['template'], $position['line'], $position['col']],
            [$error->errorCode, $error->template, $error->errorLine, $error->errorCol],
            $error->getMessage(),
        );
    }

    public function testBindFailsWithTheCodeOfTheFailedCheck(): void
    {
        foreach ([5, [1], '{"a":1}'] as $value) {
            self::assertBindFailure(self::failure(static fn () => BoundMap::bind($value)), 'E_DATA_UNSUPPORTED_TYPE');
        }
        self::assertBindFailure(self::failure(static fn () => BoundMap::bind(['n' => NAN])), 'E_DATA_NUMBER_NOT_FINITE');
        self::assertBindFailure(self::failure(static fn () => BoundMap::bind(['n' => 2 ** 53])), 'E_DATA_NUMBER_RANGE');
        self::assertBindFailure(self::failure(static fn () => BoundMap::bind(['s' => "\xff"])), 'E_DATA_INVALID_UTF8');
        $deep = 1;
        for ($level = 0; $level < 65; $level++) {
            $deep = [$deep];
        }
        self::assertBindFailure(self::failure(static fn () => BoundMap::bind(['deep' => $deep])), 'E_DATA_DEPTH');
        $failing = new class () implements \JsonSerializable {
            public function jsonSerialize(): mixed
            {
                throw new \RuntimeException('host failure');
            }
        };
        self::assertBindFailure(self::failure(static fn () => BoundMap::bind($failing)), 'E_RUNTIME_HOST_FUNCTION');
    }

    public function testMergeFailsWhenAnArgumentIsNotABoundMap(): void
    {
        $bound = BoundMap::bind(['a' => 1]);
        self::assertBindFailure(self::failure(static fn () => BoundMap::merge($bound, ['b' => 2])), 'E_DATA_UNSUPPORTED_TYPE');
        self::assertBindFailure(self::failure(static fn () => BoundMap::merge(['b' => 2], $bound)), 'E_DATA_UNSUPPORTED_TYPE');
    }

    public function testTheTypeCannotBeCreatedClonedOrUnserialized(): void
    {
        $type = new \ReflectionClass(BoundMap::class);
        self::assertTrue($type->isFinal());
        self::assertFalse($type->isInstantiable());
        self::assertFalse($type->isCloneable());
        // `__unserialize` is public because PHP calls it; it fails for every bound map.
        $public = array_map(static fn (\ReflectionMethod $method): string => $method->getName(), $type->getMethods(\ReflectionMethod::IS_PUBLIC));
        sort($public);
        self::assertSame(['__unserialize', 'bind', 'merge'], $public);
        $bound = BoundMap::bind(['a' => 1]);
        $this->expectException(\LogicException::class);
        unserialize(serialize($bound));
    }
}
