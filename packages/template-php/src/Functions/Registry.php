<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

/**
 * Built-in function table (docs/spec/functions.md).
 */
final class Registry
{
    /** @var array<string, array{min: int, max: int, call: callable}>|null */
    private static ?array $builtins = null;

    /**
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function builtins(): array
    {
        if (self::$builtins === null) {
            self::$builtins = array_merge(
                Encoding::table(),
                Strings::table(),
                Collection::table(),
                Numbers::table(),
                Dates::table(),
            );
        }

        return self::$builtins;
    }

    public static function isBuiltin(string $name): bool
    {
        return isset(self::builtins()[$name]);
    }
}
