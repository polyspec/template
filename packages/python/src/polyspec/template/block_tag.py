"""Path tokens (GRM-3) and block tag bodies (GRM-13 to GRM-15)."""

from __future__ import annotations

# Parser machinery stays internal; these are the public module contracts.
__all__ = []

import re

from .expr_lexer import lex_string_literal
from .expr_parser import ExpressionParser
from .scanner import is_horizontal_space, skip_horizontal_space
from .source import Source

_PATH_CHARS = re.compile(r"[A-Za-z0-9_./-]\Z")
_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")


class IncludePath:
    """The path of an include tag, its range and whether it is a quoted string."""

    __slots__ = ("path", "start", "end", "quoted")

    def __init__(self, path: str, start: int, end: int, quoted: bool):
        self.path = path
        self.start = start
        self.end = end
        self.quoted = quoted


class BlockBody:
    __slots__ = ("id", "path", "scope", "words", "end")

    def __init__(
        self,
        id: "str | None",
        path: "str | None",
        scope: list[dict],
        words: list[tuple[int, int, bool]],
        end: int,
    ):
        self.id = id
        self.path = path
        self.scope = scope
        # The words of the body as (start, end, quoted): the id, the path and
        # each scope item with its value.
        self.words = words
        self.end = end


class RawTagReader:
    def __init__(
        self, source: Source, template: str, close: str, close_count: int, fail
    ):
        self.source = source
        self.text = source.text
        self.template = template
        self.close = close
        self.close_count = close_count
        self._fail = fail

    def _at_close(self, index: int) -> bool:
        return self.text.startswith(self.close * self.close_count, index)

    def _read_token(self, index: int) -> "dict | None":
        """Reads a quoted string or a run of path characters; None at the close
        delimiter or end of input."""
        index = skip_horizontal_space(self.text, index)
        if index >= len(self.text) or self._at_close(index):
            return None
        char = self.text[index]
        if char in ('"', "'"):
            decoded, end = lex_string_literal(self.source, index, self.template)
            return {
                "kind": "path",
                "value": decoded,
                "start": index,
                "end": end,
                "quoted": True,
            }
        end = index
        while end < len(self.text) and _PATH_CHARS.match(self.text[end]):
            end += 1
        value = self.text[index:end]
        if "." in value or "/" in value:
            return {
                "kind": "path",
                "value": value,
                "start": index,
                "end": end,
                "quoted": False,
            }
        if _IDENT.match(value):
            return {"kind": "ident", "value": value, "start": index, "end": end}
        return {"kind": "ident", "value": "", "start": index, "end": index + 1}

    def read_include_path(self, index: int) -> IncludePath:
        """GRM-12: `+ path`."""
        token = self._read_token(index)
        if token is None or token["value"] == "":
            at = skip_horizontal_space(self.text, index)
            raise self._fail(
                "E_PARSE_INVALID_PATH", at, at + 1, "include requires a path"
            )
        if token["kind"] != "path":
            raise self._fail(
                "E_PARSE_INVALID_PATH",
                token["start"],
                token["end"],
                f"{json_text(token['value'])} is not a path",
            )
        return IncludePath(
            token["value"], token["start"], token["end"], token["quoted"]
        )

    def read_block_body(self, index: int) -> BlockBody:
        """GRM-13 to GRM-15: `# [id] [path] {scope_item}`."""
        id: "str | None" = None
        path: "str | None" = None
        scope: list[dict] = []
        words: list[tuple[int, int, bool]] = []

        def word(item: dict, end: "int | None" = None) -> None:
            words.append(
                (
                    item["start"],
                    item["end"] if end is None else end,
                    item.get("quoted", False),
                )
            )

        cursor = index
        token = self._read_token(cursor)
        if token is None or token["value"] == "":
            at = skip_horizontal_space(self.text, cursor)
            raise self._fail(
                "E_PARSE_INVALID_BLOCK_TAG",
                at,
                at + 1,
                "block tag requires an identifier or a path",
            )
        if token["kind"] == "path":
            path = token["value"]
            cursor = token["end"]
            word(token)
        else:
            id = token["value"]
            cursor = token["end"]
            word(token)
            token = self._read_token(cursor)
            if token is not None and token["kind"] == "path":
                path = token["value"]
                cursor = token["end"]
                word(token)
        while True:
            token = self._read_token(cursor)
            if token is None:
                break
            if token["kind"] != "ident" or token["value"] == "":
                raise self._fail(
                    "E_PARSE_INVALID_BLOCK_TAG",
                    token["start"],
                    token["end"],
                    f"unexpected {json_text(self.text[token['start'] : token['end']])} in block tag",
                )
            cursor = token["end"]
            if self.text[cursor : cursor + 1] == ":":
                value_start = cursor + 1
                if value_start >= len(self.text) or is_horizontal_space(
                    ord(self.text[value_start])
                ):
                    raise self._fail(
                        "E_PARSE_INVALID_BLOCK_TAG",
                        cursor,
                        cursor + 1,
                        'scope item requires a value after ":"',
                    )
                from .expr_lexer import LexerOptions

                parser = ExpressionParser(
                    self.source,
                    value_start,
                    LexerOptions(
                        close=self.close, close_count=self.close_count, open_index=None
                    ),
                    self.template,
                )
                expr = parser.parse_postfix(True)
                scope.append({"name": token["value"], "expr": expr})
                cursor = parser.end
                word(token, cursor)
            else:
                word(token)
                scope.append(
                    {
                        "name": token["value"],
                        "expr": {
                            "type": "Var",
                            "name": token["value"],
                            "span": self.source.span(token["start"], token["end"]),
                        },
                    }
                )
        return BlockBody(id, path, scope, words, cursor)


def json_text(value: str) -> str:
    import json

    return json.dumps(value)
