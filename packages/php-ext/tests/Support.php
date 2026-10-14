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
        foreach (self::entries(self::casesDirectory()) as $group) {
            $groupPath = self::casesDirectory() . '/' . $group;
            if ($group === '.' || $group === '..' || !is_dir($groupPath)) {
                continue;
            }
            foreach (self::entries($groupPath) as $name) {
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

    /**
     * The delimiters of the options.json of a case directory; a case without options.json has none, and an
     * options.json that is not JSON or names delimiters that are not a string fails the test.
     *
     * @return array{delimiters?: string}
     */
    public static function delimiterOptions(string $directory): array
    {
        $json = self::readOptional($directory . '/options.json');
        if ($json === null) {
            return [];
        }
        $options = self::json($json);
        if (!is_array($options)) {
            throw new \RuntimeException("{$directory}/options.json is not an object");
        }
        if (!array_key_exists('delimiters', $options)) {
            return [];
        }
        if (!is_string($options['delimiters'])) {
            throw new \RuntimeException("{$directory}/options.json names delimiters that are not a string");
        }

        return ['delimiters' => $options['delimiters']];
    }

    /**
     * The bytes of a file; a file that cannot be read fails the test.
     */
    public static function read(string $path): string
    {
        $bytes = file_get_contents($path);
        if ($bytes === false) {
            throw new \RuntimeException("cannot read {$path}");
        }

        return $bytes;
    }

    /**
     * The bytes of a file that a case may leave out: null when no such file exists.
     */
    public static function readOptional(string $path): ?string
    {
        return is_file($path) ? self::read($path) : null;
    }

    /**
     * The decoded JSON text, with objects as associative arrays; invalid JSON throws.
     */
    public static function json(string $text): mixed
    {
        return json_decode($text, true, 512, JSON_THROW_ON_ERROR);
    }

    public static function readJson(string $path): mixed
    {
        return self::json(self::read($path));
    }

    /**
     * The names in a directory without . and ..; a directory that cannot be listed fails the test.
     *
     * @return list<string>
     */
    public static function entries(string $directory): array
    {
        $names = scandir($directory);
        if ($names === false) {
            throw new \RuntimeException("cannot list {$directory}");
        }

        return array_values(array_diff($names, ['.', '..']));
    }
}
