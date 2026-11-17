<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\ArtifactStaleException;

/**
 * RT-56 ArtifactStore.loadOrRefresh: "dev" builds on every call, "true" reuses an artifact that loads, and "false"
 * never builds. The PHP extension runs this file too (config/parity.json).
 */
final class ArtifactStoreTest extends TestCase
{
    /** @var list<string> the temporary directories of the test */
    private array $directories = [];

    /**
     * HR-87: the directory of a test does not outlive it; a directory that cannot be removed fails the test.
     */
    protected function tearDown(): void
    {
        foreach ($this->directories as $directory) {
            foreach (scandir($directory) ?: [] as $name) {
                if ($name !== '.' && $name !== '..' && !unlink($directory . '/' . $name)) {
                    self::fail("the file {$name} of {$directory} is not removed");
                }
            }
            if (!rmdir($directory)) {
                self::fail("the directory {$directory} is not removed");
            }
        }
        $this->directories = [];
    }

    private function temporaryDirectory(string $prefix): string
    {
        $directory = sys_get_temp_dir() . '/' . $prefix . getmypid();
        if (!is_dir($directory)) {
            mkdir($directory);
        }
        $this->directories[] = $directory;

        return $directory;
    }

    public function testTrueFailsOnABrokenManifestAndDoesNotBuild(): void
    {
        $directory = $this->temporaryDirectory('artifact-store-broken-');
        file_put_contents($directory . '/manifest.json', 'not json');
        $builds = 0;
        try {
            AstProgram::loadOrRefresh($directory, 'true', static function (string $path) use (&$builds): void {
                ++$builds;
            });
            self::fail('a broken manifest loaded');
        } catch (\JsonException) {
            self::assertSame(0, $builds);
        }
    }

    public function testTrueFailsOnAnUnreadableManifestAndDoesNotBuild(): void
    {
        $directory = $this->temporaryDirectory('artifact-store-unreadable-');
        file_put_contents($directory . '/manifest.json', '{}');
        chmod($directory . '/manifest.json', 0);
        $builds = 0;
        try {
            AstProgram::loadOrRefresh($directory, 'true', static function (string $path) use (&$builds): void {
                ++$builds;
            });
            self::fail('an unreadable manifest loaded');
        } catch (\RuntimeException $error) {
            self::assertNotInstanceOf(ArtifactStaleException::class, $error);
            self::assertSame(0, $builds);
        } finally {
            chmod($directory . '/manifest.json', 0644);
        }
    }

    public function testLoadOrRefreshFollowsItsPolicy(): void
    {
        $directory = Support::repoRoot() . '/legacy/tests/fixtures/artifact-runtime/artifact';
        $builds = 0;
        $build = static function (string $path) use (&$builds): void {
            ++$builds;
        };
        AstProgram::loadOrRefresh($directory, 'true', $build);
        self::assertSame(0, $builds);
        AstProgram::loadOrRefresh($directory, 'dev', $build);
        self::assertSame(1, $builds);
        $program = AstProgram::loadOrRefresh($directory, 'false', $build);
        self::assertSame('<p>b</p>', $program->render('page.tpl', ['x' => 'b']));
        self::assertSame(1, $builds);
        $this->expectException(\RuntimeException::class);
        AstProgram::loadOrRefresh(
            Support::repoRoot() . '/legacy/tests/fixtures/artifact-runtime/none',
            'false',
            $build,
        );
    }
}
