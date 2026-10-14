"""Output builder with a byte size limit (RT-35)."""

from __future__ import annotations

from .escape import utf8_length


class Output:
    def __init__(self, limit: int, on_limit):
        # `on_limit` returns the template error that a write beyond `limit` raises (RT-35).
        self._limit = limit
        self._on_limit = on_limit
        self._chunks: list[str] = []
        self._bytes = 0

    def write(self, text: str) -> None:
        if not text:
            return
        self._bytes += utf8_length(text)
        if self._bytes > self._limit:
            raise self._on_limit()
        self._chunks.append(text)

    def text(self) -> str:
        return "".join(self._chunks)
