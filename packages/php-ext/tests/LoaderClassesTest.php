<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\Loader\LoaderInterface;
use ReflectionClass;

/**
 * The extension registers the loaders of the library under their names, as classes of the extension.
 */
final class LoaderClassesTest extends TestCase
{
    /** @return array<string, array{class-string}> */
    public static function loaders(): array
    {
        return [
            'LoaderInterface' => [LoaderInterface::class],
            'ArrayLoader' => [ArrayLoader::class],
            'FilesystemLoader' => [FilesystemLoader::class],
        ];
    }

    /** @param class-string $name */
    #[DataProvider('loaders')]
    public function testTheExtensionRegistersTheLoader(string $name): void
    {
        $this->assertTrue((new ReflectionClass($name))->isInternal(), $name . ' is not registered by the extension');
    }

    public function testTheArrayLoaderGivesSourcesAndParsedTemplatesWithTheCrc32bVersion(): void
    {
        $ast = ['type' => 'Template', 'name' => 'b.tpl', 'body' => [], 'comments' => []];
        $loader = new ArrayLoader(['a.tpl' => '{= x}', 7 => 'seven']);
        $loader->set('b.tpl', $ast);

        $this->assertSame(['source' => '{= x}', 'version' => hash('crc32b', '{= x}')], $loader->load('a.tpl'));
        $this->assertSame(['source' => 'seven', 'version' => hash('crc32b', 'seven')], $loader->load('7'));
        $this->assertSame(
            ['ast' => $ast, 'version' => hash('crc32b', (string) json_encode($ast))],
            $loader->load('b.tpl'),
        );
        $this->assertNull($loader->load('missing.tpl'));
    }

    public function testTheArrayLoaderRefusesAnotherType(): void
    {
        $this->expectException(\TypeError::class);
        (new ArrayLoader())->set('a.tpl', 1);
    }

    public function testTheFilesystemLoaderReadsAFileWithItsModificationTimeAndSize(): void
    {
        $root = sys_get_temp_dir() . '/polyspec-loader-' . bin2hex(random_bytes(4));
        mkdir($root);
        file_put_contents($root . '/a.tpl', 'hello');
        try {
            $loader = new FilesystemLoader($root . '/');
            $stats = stat($root . '/a.tpl');
            $this->assertSame(realpath($root), $loader->root);
            $this->assertSame(['source' => 'hello', 'version' => $stats['mtime'] . ':5'], $loader->load('a.tpl'));
            $this->assertNull($loader->load('missing.tpl'));
            $this->assertNull($loader->load('a.tpl/inside.tpl'));
        } finally {
            unlink($root . '/a.tpl');
            rmdir($root);
        }
    }

    public function testTheFilesystemLoaderRefusesASymbolicLinkAndASecondNameOfAFile(): void
    {
        $root = sys_get_temp_dir() . '/polyspec-loader-' . bin2hex(random_bytes(4));
        mkdir($root);
        file_put_contents($root . '/a.tpl', 'hello');
        symlink($root . '/a.tpl', $root . '/link.tpl');
        link($root . '/a.tpl', $root . '/same.tpl');
        try {
            $loader = new FilesystemLoader($root);
            $loader->load('a.tpl');
            try {
                $loader->load('link.tpl');
                $this->fail('a symbolic link loads');
            } catch (\RuntimeException $error) {
                $this->assertSame('link.tpl is a symbolic link', $error->getMessage());
            }
            try {
                $loader->load('same.tpl');
                $this->fail('a second name of a file loads');
            } catch (\RuntimeException $error) {
                $this->assertSame('same.tpl is the file of a.tpl', $error->getMessage());
            }
        } finally {
            unlink($root . '/link.tpl');
            unlink($root . '/same.tpl');
            unlink($root . '/a.tpl');
            rmdir($root);
        }
    }
}
