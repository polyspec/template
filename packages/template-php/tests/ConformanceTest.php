<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
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
        foreach (scandir($root) ?: [] as $group) {
            if ($group[0] === '.' || !is_dir("{$root}/{$group}")) {
                continue;
            }
            foreach (scandir("{$root}/{$group}") ?: [] as $name) {
                if ($name[0] === '.' || !is_dir("{$root}/{$group}/{$name}")) {
                    continue;
                }
                yield "{$group}/{$name}" => ["{$root}/{$group}/{$name}"];
            }
        }
    }

    /**
     * @return array{delimiters?: string}
     */
    private static function options(string $dir): array
    {
        if (!is_file("{$dir}/options.json")) {
            return [];
        }
        $options = Support::plain(Json::parse((string) file_get_contents("{$dir}/options.json")));

        return is_array($options) && isset($options['delimiters']) ? ['delimiters' => $options['delimiters']] : [];
    }

    #[DataProvider('cases')]
    public function testAst(string $dir): void
    {
        if (!is_file("{$dir}/expected.ast.json")) {
            $this->expectNotToPerformAssertions();

            return;
        }
        $ast = AstProgram::parse((string) file_get_contents("{$dir}/input.tpl"), 'input.tpl', self::options($dir));
        $expected = json_decode((string) file_get_contents("{$dir}/expected.ast.json"), true);
        self::assertSame(Support::normalize($expected), Support::normalize(json_decode(\Polyspec\Template\Ast::toJson($ast), true)));
    }

    #[DataProvider('cases')]
    public function testRender(string $dir): void
    {
        $expectedError = is_file("{$dir}/expected.error.json") ? json_decode((string) file_get_contents("{$dir}/expected.error.json"), true) : null;
        $result = self::render($dir);
        if ($expectedError !== null) {
            self::assertInstanceOf(TemplateError::class, $result, is_string($result) ? $result : '');
            self::assertSame($expectedError, ['code' => $result->errorCode, 'template' => $result->template, 'line' => $result->errorLine, 'col' => $result->errorCol]);
        } else {
            if ($result instanceof TemplateError) {
                self::fail(json_encode($result->toArray()) ?: '');
            }
            self::assertSame((string) file_get_contents("{$dir}/expected.html"), $result);
        }
    }

    private static function render(string $dir): string|TemplateError
    {
        try {
            $engine = new Engine(new AstProgram(new FilesystemLoader($dir), self::options($dir)));
            $assign = is_file("{$dir}/data.json") ? Json::parse((string) file_get_contents("{$dir}/data.json")) : [];
            $options = [];
            if (is_file("{$dir}/define.json")) {
                $options['define'] = Support::plain(Json::parse((string) file_get_contents("{$dir}/define.json")));
            }
            if (is_file("{$dir}/env.json")) {
                $options['env'] = Support::plain(Json::parse((string) file_get_contents("{$dir}/env.json")));
            }

            return $engine->render('input.tpl', $assign, $options);
        } catch (TemplateError $error) {
            return $error;
        } catch (BindError $error) {
            return TemplateError::withoutPosition($error->errorCode, 'input.tpl', $error->getMessage());
        }
    }
}
