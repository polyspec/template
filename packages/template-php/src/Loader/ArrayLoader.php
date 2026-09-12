<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

/**
 * In-memory loader keyed by template name.
 */
final class ArrayLoader implements LoaderInterface
{
    /** @var array<string, array{source?: string, ast?: array<string, mixed>, version: string}> */
    private array $entries = [];

    /**
     * @param array<string, string|array<string, mixed>> $sources template sources or parsed templates
     */
    public function __construct(array $sources = [])
    {
        foreach ($sources as $name => $value) {
            $this->set((string) $name, $value);
        }
    }

    /**
     * @param string|array<string, mixed> $value
     */
    public function set(string $name, string|array $value): void
    {
        if (is_string($value)) {
            $this->entries[$name] = ['source' => $value, 'version' => hash('crc32b', $value)];
        } else {
            $this->entries[$name] = ['ast' => $value, 'version' => hash('crc32b', (string) json_encode($value))];
        }
    }

    /**
     * Returns the template for a name, or null when the name does not exist.
     *
     * @return array{source?: string, ast?: array<string, mixed>, version: string}|null
     */
    public function load(string $name): ?array
    {
        return $this->entries[$name] ?? null;
    }
}
