<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

/**
 * Template name resolution (RT-7, RT-8).
 */
final class Path
{
    /**
     * Resolves a path written in a tag against the directory of the current template.
     * Returns null when the path leaves the loader root.
     */
    public static function resolve(string $current, string $path): ?string
    {
        if (str_starts_with($path, '/')) {
            $segments = [];
        } else {
            $segments = explode('/', $current);
            array_pop($segments);
            $segments = array_values(array_filter($segments, static fn (string $s): bool => $s !== ''));
        }
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                if ($segments === []) {
                    return null;
                }
                array_pop($segments);
                continue;
            }
            $segments[] = $segment;
        }

        return implode('/', $segments);
    }
}
