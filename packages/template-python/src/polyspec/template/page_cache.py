"""Final HTML page cache. This cache stores rendered output, not template artifacts."""

from __future__ import annotations

import math
import time
from typing import Callable, Optional

PageCacheTTL = Optional[float]


class PageCache:
    """Stores final rendered HTML separately from compiled template artifacts."""

    def __init__(self, now: Callable[[], float] = lambda: time.time()):
        self._now = now
        self._entries: dict[str, tuple[str, Optional[float]]] = {}

    def get(self, key: str) -> Optional[str]:
        """Returns a page or None when absent or expired."""
        entry = self._entries.get(key)
        if entry is None:
            return None
        html, expires_at = entry
        if expires_at is not None and expires_at <= self._now():
            del self._entries[key]
            return None
        return html

    def set(self, key: str, html: str, ttl: PageCacheTTL) -> None:
        """Stores a page; None and zero TTL values never expire."""
        if ttl is not None and (not math.isfinite(ttl) or ttl < 0):
            raise ValueError('page cache ttl must be None or a non-negative number')
        expires = None if ttl is None or ttl == 0 else self._now() + ttl
        self._entries[key] = (html, expires)

    def get_or_set(self, key: str, ttl: PageCacheTTL, render: Callable[[], str]) -> str:
        """Returns a cached page or renders and stores it exactly once on a miss."""
        cached = self.get(key)
        if cached is not None:
            return cached
        html = render()
        self.set(key, html, ttl)
        return html

    def delete(self, key: str) -> None:
        del self._entries[key]

    def clear(self) -> None:
        self._entries.clear()
