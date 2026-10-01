<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

/**
 * Filesystem loader (RT-10): reads root/name and reports modification time and size as the version.
 */
final class FilesystemLoader implements LoaderInterface
{
    public readonly string $root;

    /**
     * Creates a loader for a directory. Every template name resolves inside it.
     */
    public function __construct(string $root)
    {
        $resolved = realpath($root);
        $this->root = $resolved === false ? rtrim($root, DIRECTORY_SEPARATOR) : $resolved;
    }

    /**
     * Returns the file of a name, or null when no regular file exists for the name or the name
     * leaves the directory. A regular file that cannot be read is a failure (RT-10).
     *
     * @return array{source: string, version: string}|null
     */
    public function load(string $name): ?array
    {
        $path = $this->root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $name);
        if (!is_file($path)) {
            return null;
        }
        $real = realpath($path);
        if ($real === false || !str_starts_with($real, $this->root . DIRECTORY_SEPARATOR)) {
            return null;
        }
        $bytes = is_readable($path) ? file_get_contents($path) : false;
        if ($bytes === false) {
            throw new \RuntimeException("{$name} cannot be read");
        }
        $stats = stat($path);

        return ['source' => $bytes, 'version' => ($stats['mtime'] ?? 0) . ':' . ($stats['size'] ?? 0)];
    }
}
