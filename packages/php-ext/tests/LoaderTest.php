<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\TemplateError;

/**
 * The filesystem loader of the extension, which has no loader or path API of its own: an include path resolves against
 * the directory of the current template and fails when it leaves the root (RT-8), and the loader keeps no file open
 * after a load (T23.5).
 */
final class LoaderTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/template-ext-loader-files-' . getmypid();
        mkdir($this->root . '/a', 0o700, true);
        mkdir($this->root . '/x', 0o700, true);
    }

    protected function tearDown(): void
    {
        foreach (['a', 'x', '.'] as $directory) {
            array_map('unlink', glob("{$this->root}/{$directory}/*.tpl") ?: []);
        }
        rmdir($this->root . '/a');
        rmdir($this->root . '/x');
        rmdir($this->root);
    }

    public function testAnIncludePathResolvesAgainstTheCurrentTemplateAndFailsOutsideTheRoot(): void
    {
        file_put_contents($this->root . '/a/b.tpl', '{+ c.tpl}|{+ ../d.tpl}|{+ /x/y.tpl}|{+ ./c.tpl}');
        file_put_contents($this->root . '/a/c.tpl', 'C');
        file_put_contents($this->root . '/d.tpl', 'D');
        file_put_contents($this->root . '/x/y.tpl', 'Y');
        file_put_contents($this->root . '/o.tpl', '{+ ../z.tpl}');
        $engine = new Engine($this->root);
        self::assertSame('C|D|Y|C', $engine->render('a/b.tpl'));
        $code = null;
        try {
            $engine->render('o.tpl');
        } catch (TemplateError $error) {
            $code = $error->errorCode;
        }
        self::assertSame('E_LOAD_OUTSIDE_ROOT', $code);
    }

    public function testTheFilesystemLoaderKeepsNoFileOpen(): void
    {
        $templates = 64;
        $includes = '';
        for ($index = 0; $index < $templates; $index++) {
            file_put_contents("{$this->root}/t{$index}.tpl", 'x');
            $includes .= "{+ t{$index}.tpl}";
        }
        file_put_contents("{$this->root}/all.tpl", $includes);
        $engine = new Engine($this->root);
        $before = self::descriptors();
        self::assertSame(str_repeat('x', $templates), $engine->render('all.tpl'));
        self::assertLessThanOrEqual($before, self::descriptors());
    }

    /** The open descriptors of the process. */
    private static function descriptors(): int
    {
        $entries = scandir('/dev/fd');
        self::assertIsArray($entries, '/dev/fd cannot be listed');

        return count($entries);
    }
}
