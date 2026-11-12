"""Template source: UTF-8 validation, BOM removal and the mapping from string
indexes to byte offsets (LEX-1, LEX-2, LEX-16)."""

from __future__ import annotations

from .errors import Span, TemplateError, error_at, line_index_of
from .escape import first_invalid_utf8


class Source:
    """One template source.

    It validates the UTF-8, removes a byte order mark and maps the code point
    indexes that the lexer uses to the byte offsets that spans and error
    positions report (LEX-1, LEX-2, LEX-16).
    """

    def __init__(self, name: str, data: bytes):
        data = bytes(data)
        invalid = first_invalid_utf8(data)
        if invalid >= 0:
            raise error_at(
                "E_LEX_INVALID_UTF8",
                name,
                line_index_of(data),
                (invalid, invalid + 1),
                f"invalid UTF-8 byte at offset {invalid}",
            )
        data = data[3:] if data.startswith(b"\xef\xbb\xbf") else data
        self.name = name
        self.bytes = data
        self.text = data.decode("utf-8")
        self.lines = line_index_of(data)
        # byte_offset[i] is the byte offset of the code point i; the entry at
        # len(text) is the byte length.
        offsets = [0] * (len(self.text) + 1)
        offset = 0
        for index, char in enumerate(self.text):
            offsets[index] = offset
            offset += len(char.encode("utf-8"))
        offsets[len(self.text)] = offset
        self._byte_offset = offsets

    @staticmethod
    def from_bytes(name: str, data: bytes) -> "Source":
        """Reads a source from bytes.

        Invalid UTF-8 raises E_LEX_INVALID_UTF8 at the first invalid byte.
        """
        return Source(name, data)

    @staticmethod
    def from_text(name: str, text: str) -> "Source":
        """Reads a source from a string, which is already valid UTF-8."""
        try:
            data = text.encode("utf-8")
        except UnicodeEncodeError as error:
            prefix = text[: error.start].encode("utf-8")
            offset = len(prefix)
            raise error_at(
                "E_LEX_INVALID_UTF8",
                name,
                line_index_of(prefix),
                (offset, offset + 1),
                "source contains an unpaired surrogate",
            ) from error
        return Source(name, data)

    @property
    def length(self) -> int:
        """Number of native code point indexes, excluding the end position (LEX-24)."""
        return len(self.text)

    def byte_at(self, index: int) -> int:
        """The byte offset of a code point index."""
        if not isinstance(index, int) or index < 0 or index > self.length:
            raise ValueError("index is outside the source")
        return self._byte_offset[index]

    def span(self, start: int, end: int) -> Span:
        """The byte span of a range of code point indexes."""
        if start > end:
            raise ValueError("source range is reversed")
        return (self.byte_at(start), self.byte_at(end))

    def error(self, code: str, start: int, end: int, message: str) -> TemplateError:
        """Creates a template error at a supplied byte span, including an EOF span."""
        return error_at(code, self.name, self.lines, (start, end), message)
