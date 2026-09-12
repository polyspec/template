<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Closure;

/** Stores final HTML pages independently from compiled template artifacts. */
final class PageCache
{
    /** @var array<string, array{html: string, expires_at: float|null}> */
    private array $entries = [];

    public function __construct(private readonly ?Closure $clock = null)
    {
    }

    public function get(string $key): ?string
    {
        $entry = $this->entries[$key] ?? null;
        if ($entry === null) {
            return null;
        }
        if ($entry['expires_at'] !== null && $entry['expires_at'] <= $this->now()) {
            unset($this->entries[$key]);
            return null;
        }
        return $entry['html'];
    }

    public function set(string $key, string $html, ?float $ttl): void
    {
        if ($ttl !== null && (!is_finite($ttl) || $ttl < 0)) {
            throw new \InvalidArgumentException('page cache ttl must be null or non-negative');
        }
        $this->entries[$key] = [
            'html' => $html,
            'expires_at' => $ttl === null || $ttl === 0.0 ? null : $this->now() + $ttl,
        ];
    }

    /** Returns a cached page or renders and stores it on a miss. */
    public function getOrSet(string $key, ?float $ttl, Closure $render): string
    {
        $cached = $this->get($key);
        if ($cached !== null) {
            return $cached;
        }
        $html = $render();
        $this->set($key, $html, $ttl);
        return $html;
    }

    public function delete(string $key): void
    {
        unset($this->entries[$key]);
    }
    public function clear(): void
    {
        $this->entries = [];
    }

    private function now(): float
    {
        return $this->clock === null ? microtime(true) : (float) ($this->clock)();
    }
}
