<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Loader;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\Loader\Path;
use Polyspec\Template\TemplateError;

/**
 * The loaders and the resolution of template paths: an array loader returns the source of a name that it holds with a
 * version (RT-10), a path resolves against the directory of the current template and leaves no root (RT-8), and the
 * filesystem loader keeps no file open after a load (T23.5).
 */
final class LoaderTest extends TestCase
{
    /** RT-9, RT-10, RT-40: native result payloads and versions follow content replacement. */
    public function testMapLoaderVersionsSourceAndAstContent(): void
    {
        $loader = new ArrayLoader();
        foreach ([false, true] as $ast) {
            $versions = [];
            foreach (['first', 'second', 'second'] as $text) {
                $value = $ast ? AstProgram::parse($text, 'a.tpl') : $text;
                $loader->set('a.tpl', $value);
                $result = $loader->load('a.tpl');
                self::assertNotNull($result);
                self::assertSame($value, $result[$ast ? 'ast' : 'source']);
                self::assertArrayNotHasKey($ast ? 'source' : 'ast', $result);
                self::assertNotSame('', $result['version']);
                $versions[] = $result['version'];
            }
            self::assertNotSame($versions[0], $versions[1]);
            self::assertSame($versions[1], $versions[2]);
        }
    }

    /**
     * RT-9, RT-10: a map loader returns a held source with its version, and nothing for another name.
     */
    public function testTheArrayLoaderReturnsAHeldSourceWithAVersionAndNothingForAnotherName(): void
    {
        $loader = new ArrayLoader(['a.tpl' => 'x']);
        $loaded = $loader->load('a.tpl');
        self::assertNotNull($loaded);
        self::assertSame('x', $loaded['source'] ?? null);
        self::assertNotSame('', $loaded['version']);
        self::assertNull($loader->load('b.tpl'));
    }

    /**
     * RT-8: a path resolves against the directory of the current template, a leading / against the root, and a path
     * that leaves the root fails with E_LOAD_OUTSIDE_ROOT.
     */
    public function testAPathResolvesAgainstTheCurrentDirectoryAndFailsOutsideTheRoot(): void
    {
        self::assertSame('a/c.tpl', Path::resolve('a/b.tpl', 'c.tpl'));
        self::assertSame('c.tpl', Path::resolve('a/b.tpl', '../c.tpl'));
        self::assertSame('x/y.tpl', Path::resolve('a/b.tpl', '/x/y.tpl'));
        self::assertSame('c.tpl', Path::resolve('b.tpl', './c.tpl'));
        self::assertNull(Path::resolve('a.tpl', '../x.tpl'));
        $engine = new Engine(new AstProgram(new ArrayLoader(['o.tpl' => '{+ ../z.tpl}'])));
        try {
            $engine->render('o.tpl');
            self::fail('an include outside the root should fail');
        } catch (TemplateError $error) {
            self::assertSame('E_LOAD_OUTSIDE_ROOT', $error->errorCode);
        }
    }

    /** RT-75: the filesystem loader closes each file that it reads before load returns, so no file stays open. */
    public function testTheFilesystemLoaderKeepsNoFileOpen(): void
    {
        $root = sys_get_temp_dir() . '/template-php-loader-' . getmypid();
        mkdir($root, 0o700, true);
        $templates = 64;
        try {
            for ($index = 0; $index < $templates; $index++) {
                file_put_contents("{$root}/t{$index}.tpl", 'x');
            }
            $loader = new FilesystemLoader($root);
            $before = self::descriptors();
            for ($index = 0; $index < $templates; $index++) {
                self::assertNotNull($loader->load("t{$index}.tpl"));
            }
            self::assertLessThanOrEqual($before, self::descriptors());
        } finally {
            array_map('unlink', glob("{$root}/*.tpl") ?: []);
            rmdir($root);
        }
    }

    /** The open descriptors of the process. */
    private static function descriptors(): int
    {
        $entries = scandir('/dev/fd');
        self::assertIsArray($entries, '/dev/fd cannot be listed');

        return count($entries);
    }
}
