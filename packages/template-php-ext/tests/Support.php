<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

/**
 * Paths of the shared conformance assets.
 */
final class Support
{
    public static function repositoryRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    public static function casesDirectory(): string
    {
        return self::repositoryRoot() . '/tests/cases';
    }

    /**
     * @return list<array{0: string, 1: string}> case id and directory
     */
    public static function cases(): array
    {
        $cases = [];
        foreach (scandir(self::casesDirectory()) ?: [] as $group) {
            $groupPath = self::casesDirectory() . '/' . $group;
            if ($group === '.' || $group === '..' || !is_dir($groupPath)) {
                continue;
            }
            foreach (scandir($groupPath) ?: [] as $name) {
                $directory = $groupPath . '/' . $name;
                if ($name === '.' || $name === '..' || !is_dir($directory)) {
                    continue;
                }
                if (is_file($directory . '/input.tpl')) {
                    $cases[] = ["{$group}/{$name}", $directory];
                }
            }
        }
        usort($cases, static fn ($a, $b) => strcmp($a[0], $b[0]));

        return $cases;
    }

    public static function read(string $path): ?string
    {
        if (!is_file($path)) {
            return null;
        }
        $bytes = file_get_contents($path);

        return $bytes === false ? null : $bytes;
    }
}
