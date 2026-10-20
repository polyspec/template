<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;

/**
 * Shared test helpers: repository paths, file and JSON reads that fail loudly, and value conversion.
 */
final class Support
{
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
     * The delimiters of the options.json of a case directory; a case without options.json has none, and an
     * options.json that is not JSON or names delimiters that are not a string fails the test.
     *
     * @return array{delimiters?: string}
     */
    public static function delimiterOptions(string $directory): array
    {
        if (!is_file("{$directory}/options.json")) {
            return [];
        }
        $options = self::readJson("{$directory}/options.json");
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

    public static function repoRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    public static function casesDir(): string
    {
        return self::repoRoot() . '/tests/cases';
    }

    public static function exprFixture(): string
    {
        return self::repoRoot() . '/tests/fixtures/expr/cases.json';
    }

    /**
     * Converts a template value into plain PHP data for comparison with JSON fixtures.
     */
    public static function plain(mixed $value): mixed
    {
        if ($value instanceof SafeString) {
            return $value->text;
        }
        if ($value instanceof MapValue) {
            $result = [];
            foreach ($value->entries() as [$key, $item]) {
                $result[$key] = self::plain($item);
            }

            return $result === [] ? new \stdClass() : $result;
        }
        if (is_array($value)) {
            return array_map([self::class, 'plain'], $value);
        }
        if (is_float($value)) {
            return $value == 0.0 ? 0.0 : $value;
        }

        return $value;
    }

    /**
     * Normalizes decoded JSON for comparison: objects become associative arrays, numbers become floats.
     */
    public static function normalize(mixed $value): mixed
    {
        if ($value instanceof \stdClass) {
            $value = (array) $value;
        }
        if (is_array($value)) {
            $result = [];
            foreach ($value as $key => $item) {
                $result[$key] = self::normalize($item);
            }

            return $result;
        }
        if (is_int($value)) {
            return (float) $value;
        }

        return $value;
    }
}
