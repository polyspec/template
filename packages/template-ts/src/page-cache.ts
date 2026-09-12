// Final HTML page cache. This cache stores rendered output, not template artifacts.
export type PageCacheTTL = number | null;

type Entry = { html: string; expiresAt: number | null };

/** Stores final rendered HTML separately from compiled template artifacts. */
export class PageCache {
  private readonly entries = new Map<string, Entry>();

  /** Creates a cache with an optional Unix-clock provider for deterministic tests. */
  constructor(private readonly now: () => number = () => Date.now() / 1000) {}

  /** Returns a page or null when absent or expired. */
  get(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.html;
  }

  /** Stores a page; null and zero TTL values never expire. */
  set(key: string, html: string, ttl: PageCacheTTL): void {
    if (ttl !== null && (!Number.isFinite(ttl) || ttl < 0)) throw new Error('page cache ttl must be null or a non-negative number');
    this.entries.set(key, { html, expiresAt: ttl === null || ttl === 0 ? null : this.now() + ttl });
  }

  /** Removes one page. */
  delete(key: string): void { this.entries.delete(key); }

  /** Removes every page. */
  clear(): void { this.entries.clear(); }
}
