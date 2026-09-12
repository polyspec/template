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
     * Returns the file of a name, or null when the name does not exist or leaves the directory.
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
        $bytes = file_get_contents($path);
        if ($bytes === false) {
            return null;
        }
        $stats = stat($path);

        return ['source' => $bytes, 'version' => ($stats['mtime'] ?? 0) . ':' . ($stats['size'] ?? 0)];
    }
}
