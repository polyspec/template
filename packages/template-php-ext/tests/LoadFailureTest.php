<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

/**
 * Loader failures (RT-10, ERR-6) and JSON text that is not one document (VAL-12).
 *
 * The same scenarios run against the PHP AST runtime in `packages/template-php/tests/LoadFailureTest.php`.
 */
final class LoadFailureTest extends TestCase
{
    private static function code(callable $render): string
    {
        try {
            $render();
        } catch (TemplateError $error) {
            return $error->getErrorCode();
        }

        return 'OK';
    }

    public function testTheFilesystemLoaderSeparatesMissingAndUnreadableFiles(): void
    {
        $root = sys_get_temp_dir() . '/template-ext-loader-' . getmypid();
        mkdir($root . '/folder.tpl', 0o700, true);
        file_put_contents($root . '/locked.tpl', 'x');
        chmod($root . '/locked.tpl', 0o000);
        try {
            $engine = new Engine($root);
            $codes = array_map(static fn (string $name): string => self::code(static fn () => $engine->render($name, [])), ['locked.tpl', 'folder.tpl', 'missing.tpl']);
        } finally {
            chmod($root . '/locked.tpl', 0o600);
            unlink($root . '/locked.tpl');
            rmdir($root . '/folder.tpl');
            rmdir($root);
        }
        $this->assertSame(['E_LOAD_FAILED', 'E_LOAD_NOT_FOUND', 'E_LOAD_NOT_FOUND'], $codes);
    }

    public function testJsonTextThatIsNotOneDocumentIsInvalidJson(): void
    {
        $engine = new Engine(__DIR__ . '/templates');
        $this->assertSame('E_DATA_INVALID_JSON', self::code(static fn () => $engine->renderJson('echo.tpl', '{"title": }')));
        $this->assertSame('E_DATA_INVALID_JSON', self::code(static fn () => $engine->renderJson('echo.tpl', '{}', '{"a": ')));
        $this->assertSame('E_DATA_INVALID_JSON', self::code(static fn () => $engine->renderJson('echo.tpl', '{}', null, '{"now": 1} x')));
        $this->assertSame('E_DATA_INVALID_JSON', self::code(static fn () => $engine->renderJson('echo.tpl', '{"a": , "b": 1e19}')));
        $this->assertSame('E_DATA_NUMBER_RANGE', self::code(static fn () => $engine->renderJson('echo.tpl', '{"a": 1e19, "b": }')));
    }
}
