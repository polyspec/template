<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\BoundMap as PhpBoundMap;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\Native\BoundMap;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;
use Polyspec\Template\TemplateError as PhpTemplateError;

/**
 * Bound data (VAL-22, ERR-14, RT-61) with the shared fixture of tests/fixtures/bound-data/cases.json.
 *
 * The same scenarios run against the PHP AST runtime in `packages/template-php/tests/Value/BoundMapTest.php`.
 * The PHP package is loaded here too, so the test checks that each implementation rejects the bound
 * maps of the other. The key order of a bound map of the extension is not observable through its
 * interface; the PHP and Rust tests check the precedence and position of `merge`.
 */
final class BoundMapTest extends TestCase
{
    private static function fixtureDirectory(): string
    {
        return Support::repositoryRoot() . '/tests/fixtures/bound-data';
    }

    /**
     * @return array<string, mixed>
     */
    private static function cases(): array
    {
        return json_decode((string) file_get_contents(self::fixtureDirectory() . '/cases.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    private static function engine(mixed $result = null): Engine
    {
        $engine = new Engine(self::fixtureDirectory());
        $engine->register('pick', static fn (): mixed => $result);

        return $engine;
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
            [$error->getErrorCode(), $error->getTemplate(), $error->getErrorLine(), $error->getErrorCol(), $error->getOffset(), $error->getEnd()],
            $error->getMessage(),
        );
    }

    public function testBoundMapRendersTheBytesOfTheHostMap(): void
    {
        $cases = self::cases();
        self::assertSame($cases['outputs']['page'], self::engine()->render('page.tpl', BoundMap::bind($cases['assign'])));
        self::assertSame($cases['outputs']['page'], self::engine()->render('page.tpl', $cases['assign']));
    }

    public function testMergeFollowsThePrecedenceOfRt26(): void
    {
        $cases = self::cases();
        $merged = BoundMap::merge(BoundMap::bind($cases['assign']), BoundMap::bind($cases['second']));
        self::assertSame($cases['outputs']['merged'], self::engine()->render('page.tpl', $merged));
    }

    public function testBoundMapIsDefinitionData(): void
    {
        $cases = self::cases();
        self::assertSame($cases['outputs']['define'], self::engine()->render('define.tpl', $cases['assign'], self::definition(BoundMap::bind($cases['definitionData']))));
    }

    public function testNullAndTheEmptyArrayGiveTheEmptyBoundMap(): void
    {
        foreach ([null, []] as $empty) {
            self::assertSame(self::cases()['outputs']['empty'], self::engine()->render('empty.tpl', BoundMap::bind($empty)));
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
            'list' => self::failure(static fn () => self::engine()->render('page.tpl', [...$cases['assign'], 'items' => [$bound]])),
            'map' => self::failure(static fn () => self::engine()->render('page.tpl', [...$cases['assign'], 'inner' => ['k' => $bound]])),
            'bind' => self::failure(static fn () => BoundMap::bind(['k' => $bound])),
            'definitionData' => self::failure(static fn () => self::engine()->render('define.tpl', $cases['assign'], self::definition(['k' => $bound]))),
            'result' => self::failure(static fn () => self::engine($bound)->render('result.tpl', [])),
        };
        $position = $cases['rejections'][$name];
        self::assertSame(
            ['E_DATA_UNSUPPORTED_TYPE', $position['template'], $position['line'], $position['col']],
            [$error->getErrorCode(), $error->getTemplate(), $error->getErrorLine(), $error->getErrorCol()],
            $error->getMessage(),
        );
    }

    public function testEachImplementationRejectsTheBoundMapsOfTheOther(): void
    {
        $cases = self::cases();
        $native = BoundMap::bind($cases['assign']);
        $php = PhpBoundMap::bind($cases['assign']);
        self::assertSame('E_DATA_UNSUPPORTED_TYPE', self::failure(static fn () => self::engine()->render('page.tpl', $php))->getErrorCode());
        self::assertSame('E_DATA_UNSUPPORTED_TYPE', self::failure(static fn () => BoundMap::bind($php))->getErrorCode());
        self::assertBindFailure(self::failure(static fn () => BoundMap::merge($native, $php)), 'E_DATA_UNSUPPORTED_TYPE');
        $program = new AstProgram(new FilesystemLoader(self::fixtureDirectory()));
        foreach ([
            static fn () => $program->render('page.tpl', $native),
            static fn () => PhpBoundMap::bind($native),
            static fn () => PhpBoundMap::merge($php, $native),
        ] as $operation) {
            try {
                $operation();
                self::fail('the PHP implementation accepted a bound map of the extension');
            } catch (PhpTemplateError $error) {
                self::assertSame('E_DATA_UNSUPPORTED_TYPE', $error->errorCode);
            }
        }
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
        $failing = new class implements \JsonSerializable {
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
        // VAL-22: the class has exactly the operations of the manifest; its constructor is the hook
        // through which `new` fails.
        $mapping = json_decode((string) file_get_contents(Support::repositoryRoot() . '/tools/compiler/interface.json'), true, flags: JSON_THROW_ON_ERROR)['languages']['php-extension']['boundMap'];
        $type = new \ReflectionClass($mapping['type']);
        self::assertSame(BoundMap::class, $type->getName());
        self::assertTrue($type->isFinal());
        $public = array_map(static fn (\ReflectionMethod $method): string => $method->getName(), $type->getMethods(\ReflectionMethod::IS_PUBLIC));
        $expected = array_values($mapping['operations']);
        sort($public);
        sort($expected);
        self::assertSame($expected, array_values(array_diff($public, ['__construct'])));
        $bound = BoundMap::bind(['a' => 1]);
        foreach ([
            static fn () => new BoundMap(),
            static fn () => clone $bound,
            static fn () => serialize($bound),
            static fn () => unserialize('O:' . strlen(BoundMap::class) . ':"' . BoundMap::class . '":0:{}'),
        ] as $operation) {
            try {
                $operation();
                self::fail('the operation succeeded');
            } catch (\Throwable $error) {
                self::assertNotInstanceOf(\PHPUnit\Framework\AssertionFailedError::class, $error);
            }
        }
    }
}
