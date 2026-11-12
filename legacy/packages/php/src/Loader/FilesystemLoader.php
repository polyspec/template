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
     * The name of each file that the loader read, by device and inode number.
     *
     * @var array<string, string>
     */
    private array $files = [];

    /**
     * Returns the file of a name, or null when no regular file exists for the name. A symbolic link
     * at any component of the name, a regular file that cannot be read and a file that the loader
     * read under another name are failures (RT-10).
     *
     * @return array{source: string, version: string}|null
     */
    public function load(string $name): ?array
    {
        $segments = explode('/', $name);
        $path = $this->root;
        $stats = false;
        foreach ($segments as $index => $segment) {
            $path .= DIRECTORY_SEPARATOR . $segment;
            if (!is_link($path) && !file_exists($path)) {
                return null;
            }
            $stats = lstat($path);
            if ($stats === false) {
                throw new \RuntimeException("{$name} cannot be examined");
            }
            $type = $stats['mode'] & 0o170000;
            if ($type === 0o120000) {
                $link = implode('/', array_slice($segments, 0, $index + 1));
                throw new \RuntimeException($link . ' is a symbolic link');
            }
            if ($index < count($segments) - 1 && $type !== 0o040000) {
                return null;
            }
        }
        if ($stats === false || ($stats['mode'] & 0o170000) !== 0o100000) {
            return null;
        }
        $identity = $stats['dev'] . ':' . $stats['ino'];
        $owner = $this->files[$identity] ??= $name;
        if ($owner !== $name) {
            throw new \RuntimeException("{$name} is the file of {$owner}");
        }
        $bytes = is_readable($path) ? file_get_contents($path) : false;
        if ($bytes === false) {
            throw new \RuntimeException("{$name} cannot be read");
        }

        return ['source' => $bytes, 'version' => $stats['mtime'] . ':' . $stats['size']];
    }
}
