<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\TemplateError;

/**
 * The expression vectors of tests/fixtures/expr/cases.json in the extension (CNF-12 to CNF-14). The extension exposes
 * no expression lexer or evaluator of its own, so each vector runs as the echo tag `{=<expr>}`: an error vector fails
 * the parse with its code, the expression of the parsed echo is the AST of the vector with every span two bytes later,
 * after `{=`, and each evaluation renders `{:value = <expr>}{= json(value) | raw}` with its data to the JSON text of
 * its value: the assignment parses the expression at the depth of the other bindings, and only the read of `value` is
 * an argument of `json` (RT-34). The token vectors name the tokens of the expression lexer, which the extension does
 * not expose.
 */
final class ExprFixturesTest extends TestCase
{
    private static ?string $root = null;

    /**
     * @return iterable<string, array{0: array<string, mixed>}>
     */
    public static function cases(): iterable
    {
        $cases = Support::readJson(Support::repositoryRoot() . '/tests/fixtures/expr/cases.json');
        foreach ($cases as $case) {
            yield $case['name'] => [$case];
        }
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$root !== null) {
            array_map('unlink', glob(self::$root . '/*.tpl') ?: []);
            rmdir(self::$root);
            self::$root = null;
        }
    }

    /**
     * The expression of the vector with each span moved back by the two bytes of `{=`.
     */
    private static function withoutTag(mixed $node): mixed
    {
        if (!is_array($node)) {
            return $node;
        }
        foreach ($node as $key => $value) {
            $node[$key] = $key === 'span' ? [$value[0] - 2, $value[1] - 2] : self::withoutTag($value);
        }

        return $node;
    }

    /**
     * @param array<string, mixed> $case
     */
    #[DataProvider('cases')]
    public function testCase(array $case): void
    {
        $source = '{=' . $case['expr'] . '}';
        if (isset($case['error'])) {
            $code = null;
            try {
                Engine::parse($source, 'expression.tpl');
            } catch (TemplateError $error) {
                $code = $error->errorCode;
            }
            self::assertSame($case['error'], $code);

            return;
        }
        $ast = Support::json(Engine::parseToJson($source, 'expression.tpl'));
        self::assertSame('Echo', $ast['body'][0]['type']);
        self::assertSame(
            Support::json(json_encode($case['ast'], JSON_THROW_ON_ERROR)),
            self::withoutTag($ast['body'][0]['expr']),
        );
        if (($case['cases'] ?? []) === []) {
            return;
        }
        self::$root ??= sys_get_temp_dir() . '/template-ext-expressions-' . getmypid();
        if (!is_dir(self::$root)) {
            mkdir(self::$root, 0o700, true);
        }
        file_put_contents(self::$root . '/value.tpl', '{:value = ' . $case['expr'] . '}{= json(value) | raw}');
        $engine = new Engine(self::$root);
        foreach ($case['cases'] as $index => $evaluation) {
            self::assertSame(
                Support::json(json_encode($evaluation['value'], JSON_THROW_ON_ERROR)),
                Support::json($engine->render('value.tpl', $evaluation['data'])),
                "evaluation {$index}",
            );
        }
    }
}
