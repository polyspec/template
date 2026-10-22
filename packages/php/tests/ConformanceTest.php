<?php

// EDT-8 and EDT-9: the tokens and the tags of the template are the parts that the editors paint.

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Format\Formatter;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\Json;

/**
 * Conformance cases rendered in-process (CNF-6 to CNF-9).
 */
final class ConformanceTest extends TestCase
{
    /**
     * @return iterable<string, array{0: string}>
     */
    public static function cases(): iterable
    {
        $root = Support::casesDir();
        foreach (Support::entries($root) as $group) {
            if ($group[0] === '.' || !is_dir("{$root}/{$group}")) {
                continue;
            }
            foreach (Support::entries("{$root}/{$group}") as $name) {
                if ($name[0] === '.' || !is_dir("{$root}/{$group}/{$name}")) {
                    continue;
                }
                yield "{$group}/{$name}" => ["{$root}/{$group}/{$name}"];
            }
        }
    }

    #[DataProvider('cases')]
    public function testTokens(string $dir): void
    {
        if (!is_file("{$dir}/expected.ast.json")) {
            $this->expectNotToPerformAssertions();

            return;
        }
        $analysis = AstProgram::analyze(
            Support::read("{$dir}/input.tpl"),
            'input.tpl',
            Support::delimiterOptions($dir),
        );
        $tokens = array_map(
            static fn (array $token): array => [$token['start'], $token['end'], $token['kind']],
            $analysis['tokens'],
        );
        self::assertSame(Support::readJson("{$dir}/expected.tokens.json"), $tokens);
    }

    #[DataProvider('cases')]
    public function testFormat(string $dir): void
    {
        if (!is_file("{$dir}/expected.ast.json")) {
            $this->expectNotToPerformAssertions();

            return;
        }
        $source = Support::read("{$dir}/input.tpl");
        $actual = [];
        foreach (['indent' => [], 'keep' => ['indent' => null]] as $mode => $options) {
            $result = Formatter::format($source, ['name' => 'input.tpl'] + $options + Support::delimiterOptions($dir));
            $actual[$mode] = $result->error === null
                ? ['text' => $result->text]
                : [
                    'error' => [
                        'reason' => $result->error->reason,
                        'code' => $result->error->code,
                        'line' => $result->error->line,
                        'col' => $result->error->col,
                    ],
                ];
        }
        self::assertSame(Support::readJson("{$dir}/expected.format.json"), $actual);
    }

    /**
     * A case of the suite unit conformance of config/parity.json: the AST of a case with expected.ast.json, then the
     * output or the error of its render.
     */
    #[DataProvider('cases')]
    public function testCase(string $dir): void
    {
        if (is_file("{$dir}/expected.ast.json")) {
            $ast = AstProgram::parse(Support::read("{$dir}/input.tpl"), 'input.tpl', Support::delimiterOptions($dir));
            self::assertSame(
                Support::normalize(Support::readJson("{$dir}/expected.ast.json")),
                Support::normalize(Support::json(\Polyspec\Template\Ast::toJson($ast))),
            );
        }
        $expectedError = is_file("{$dir}/expected.error.json") ? Support::readJson("{$dir}/expected.error.json") : null;
        $result = self::render($dir);
        if ($expectedError !== null) {
            self::assertInstanceOf(TemplateError::class, $result, is_string($result) ? $result : '');
            self::assertSame(
                $expectedError,
                [
                    'code' => $result->errorCode,
                    'template' => $result->template,
                    'line' => $result->errorLine,
                    'col' => $result->errorCol,
                ],
            );
        } else {
            if ($result instanceof TemplateError) {
                self::fail(json_encode($result->toArray(), JSON_THROW_ON_ERROR));
            }
            self::assertSame(Support::read("{$dir}/expected.html"), $result);
        }
    }

    private static function render(string $dir): string|TemplateError
    {
        try {
            $engine = new Engine(new AstProgram(new FilesystemLoader($dir), Support::delimiterOptions($dir)));
            $assign = is_file("{$dir}/data.json") ? Json::parse(Support::read("{$dir}/data.json")) : [];
            $options = [];
            if (is_file("{$dir}/define.json")) {
                $options['define'] = Support::plain(Json::parse(Support::read("{$dir}/define.json")));
            }
            if (is_file("{$dir}/env.json")) {
                $options['env'] = Support::plain(Json::parse(Support::read("{$dir}/env.json")));
            }

            return $engine->render('input.tpl', $assign, $options);
        } catch (TemplateError $error) {
            return $error;
        } catch (BindError $error) {
            return TemplateError::withoutPosition($error->errorCode, 'input.tpl', $error->getMessage());
        }
    }
}
