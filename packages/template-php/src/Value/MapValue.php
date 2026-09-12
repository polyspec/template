<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * Insertion-ordered map with string keys (VAL-1, VAL-4, VAL-17).
 *
 * PHP arrays convert numeric string keys to integers; every key is cast back to a string on read.
 */
final class MapValue
{
    /** @var array<int|string, mixed> */
    private array $items = [];

    public function set(string $key, mixed $value): void
    {
        $this->items[$key] = $value;
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->items);
    }

    public function get(string $key): mixed
    {
        return $this->items[$key] ?? null;
    }

    public function remove(string $key): void
    {
        unset($this->items[$key]);
    }

    public function count(): int
    {
        return count($this->items);
    }

    /**
     * @return list<string>
     */
    public function keys(): array
    {
        return array_map(static fn ($key): string => (string) $key, array_keys($this->items));
    }

    /**
     * @return list<mixed>
     */
    public function values(): array
    {
        return array_values($this->items);
    }

    /**
     * @return \Generator<string, mixed>
     */
    public function entries(): \Generator
    {
        foreach ($this->items as $key => $value) {
            yield (string) $key => $value;
        }
    }

    public function copy(): self
    {
        $map = new self();
        $map->items = $this->items;

        return $map;
    }
}
