<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli\Tests;

/**
 * The helpers of the command line tests: the repository paths of the conformance cases and the JSON reads that fail
 * loudly. The package carries its own copy, since its tests run as a package of its own (K433).
 */
final class Support
{
    public static function repoRoot(): string
    {
        return dirname(__DIR__, 4);
    }

    public static function casesDir(): string
    {
        return self::repoRoot() . '/tests/cases';
    }

    public static function read(string $path): string
    {
        $bytes = file_get_contents($path);
        if ($bytes === false) {
            throw new \RuntimeException("cannot read {$path}");
        }

        return $bytes;
    }

    public static function json(string $text): mixed
    {
        return json_decode($text, true, 512, JSON_THROW_ON_ERROR);
    }

    public static function readJson(string $path): mixed
    {
        return self::json(self::read($path));
    }
}
