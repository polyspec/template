<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\Json;

/**
 * Loader failures (RT-9, RT-10, ERR-6, ERR-9) and JSON text that is not one document (VAL-12).
 */
final class LoadFailureTest extends TestCase
{
    private static function throwing(string $failing): LoaderInterface
    {
        return new class ($failing) implements LoaderInterface {
            public function __construct(private readonly string $failing)
            {
            }

            public function load(string $name): ?array
            {
                if ($name === $this->failing) {
                    throw new \RuntimeException("cannot read {$name}");
                }

                return ['source' => $name === 'page.tpl' ? "a\n{+ part.tpl}" : 'part', 'version' => '1'];
            }
        };
    }

    private static function failure(LoaderInterface $loader, string $target): TemplateError
    {
        try {
            (new AstProgram($loader))->render($target, []);
        } catch (TemplateError $error) {
            return $error;
        }
        throw new \LogicException("{$target} did not fail");
    }

    public function testALoaderExceptionIsALoadFailureAtTheEntryTemplate(): void
    {
        $error = self::failure(self::throwing('page.tpl'), 'page.tpl');
        $this->assertSame(['E_LOAD_FAILED', 'page.tpl', 0, 0], [$error->errorCode, $error->template, $error->errorLine, $error->errorCol]);
        $this->assertStringContainsString('cannot read page.tpl', $error->getMessage());
    }

    public function testALoaderExceptionIsALoadFailureAtTheIncludeTag(): void
    {
        $error = self::failure(self::throwing('part.tpl'), 'page.tpl');
        $this->assertSame(['E_LOAD_FAILED', 'page.tpl', 2, 1], [$error->errorCode, $error->template, $error->errorLine, $error->errorCol]);
        $this->assertStringContainsString('cannot read part.tpl', $error->getMessage());
    }

    public function testTheFilesystemLoaderSeparatesMissingAndUnreadableFiles(): void
    {
        $root = sys_get_temp_dir() . '/template-loader-' . getmypid();
        mkdir($root . '/folder.tpl', 0o700, true);
        file_put_contents($root . '/locked.tpl', 'x');
        chmod($root . '/locked.tpl', 0o000);
        try {
            // Root reads a file of mode 0o000, every other user cannot (T19.11): the file fails to load exactly when the
            // process cannot read it, and the process cannot read it exactly when it does not run as root.
            $readable = @file_get_contents($root . '/locked.tpl') !== false;
            $asRoot = posix_geteuid() === 0;
            try {
                $locked = (new AstProgram(new FilesystemLoader($root)))->render('locked.tpl', []);
            } catch (TemplateError $error) {
                $locked = $error->errorCode;
            }
            $codes = [];
            foreach (['folder.tpl', 'missing.tpl'] as $name) {
                $codes[] = self::failure(new FilesystemLoader($root), $name)->errorCode;
            }
        } finally {
            chmod($root . '/locked.tpl', 0o600);
            unlink($root . '/locked.tpl');
            rmdir($root . '/folder.tpl');
            rmdir($root);
        }
        $this->assertSame($asRoot, $readable, 'locked.tpl is readable exactly when the test runs as root');
        $this->assertSame($readable ? 'x' : 'E_LOAD_FAILED', $locked);
        $this->assertSame(['E_LOAD_NOT_FOUND', 'E_LOAD_NOT_FOUND'], $codes);
    }

    public function testTextThatIsNotOneJsonDocumentIsInvalidJson(): void
    {
        $cases = [
            '' => 'E_DATA_INVALID_JSON', ' ' => 'E_DATA_INVALID_JSON', '{' => 'E_DATA_INVALID_JSON', '{"a": }' => 'E_DATA_INVALID_JSON',
            '[1,]' => 'E_DATA_INVALID_JSON', '{"a": 1} x' => 'E_DATA_INVALID_JSON', 'nul' => 'E_DATA_INVALID_JSON', '"a' => 'E_DATA_INVALID_JSON',
            '01' => 'E_DATA_INVALID_JSON', '{"a": , "b": 1e19}' => 'E_DATA_INVALID_JSON', '{"a": 1e19, "b": }' => 'E_DATA_NUMBER_RANGE',
            '[' . str_repeat('[', 64) . 'x' => 'E_DATA_DEPTH', '[x, ' . str_repeat('[', 65) => 'E_DATA_INVALID_JSON',
        ];
        foreach ($cases as $text => $code) {
            try {
                Json::parse((string) $text);
                $this->fail("{$text} was accepted");
            } catch (BindError $error) {
                $this->assertSame($code, $error->errorCode, (string) $text);
            }
        }
    }
}
