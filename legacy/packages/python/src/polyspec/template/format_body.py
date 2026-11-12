"""Tag body formatting: writes the body of each tag kind in the formatting style
(GRM-2)."""

from __future__ import annotations

import re

from .format_expression import join_tokens

_WHITESPACE = re.compile(r"[ \t\r\n]*")
_LINE_TERMINATOR = re.compile(r"[\r\n]")


def _blank(text: str) -> bool:
    return _WHITESPACE.fullmatch(text) is not None


def format_body(
    kind: str, source: str, body_start: int, body_end: int, tokens: list[dict]
) -> "str | None":
    """The formatted body of a tag, or None when the tag is kept as written:
    comments, directives, bodies that contain a line terminator and bodies whose
    expression tokens do not cover every non-whitespace character. `tokens` are
    the tokens the parser classified inside the body, its sigil first."""
    body = source[body_start:body_end]
    if _LINE_TERMINATOR.search(body) or kind in ("comment", "directive"):
        return None
    sigil = tokens[0]
    rest = tokens[1:]

    def text(token: dict) -> str:
        return source[token["start"] : token["end"]]

    def expression(items: list[dict], start: int) -> "str | None":
        return _expression_text(source, body_end, items, start)

    # The tag body holds only spaces and tabs besides its words once it parsed
    # and has no line terminator.
    after = source[sigil["end"] : body_end].strip(" \t")
    if kind == "echo":
        return _with_rest("=", expression(rest, sigil["end"]))
    if kind == "if":
        return _with_rest("?", expression(rest, sigil["end"]))
    if kind == "elseif":
        return _with_rest(":?", expression(rest, sigil["end"]))
    if kind == "else":
        return ":"
    if kind == "close":
        return "/"
    if kind == "ifblock":
        return _with_rest("?#", after)
    if kind == "include":
        return _with_rest("+", after)
    if kind == "block":
        return _with_rest("#", " ".join(_words(after)))
    if kind == "for":
        # The loop variable and its `=`, then the iterated expression.
        name, equals = rest[0], rest[1]
        iterated = expression(rest[2:], equals["end"])
        return None if iterated is None else f"@ {text(name)} = {iterated}"
    if kind == "assignment":
        # The assigned name and its operator, then the value unless the
        # operator is `++` or `--`.
        name, operator = rest[0], rest[1]
        if len(rest) == 2:
            if _blank(source[operator["end"] : body_end]):
                return f":{text(name)}{text(operator)}"
            return None
        value = expression(rest[2:], operator["end"])
        return None if value is None else f":{text(name)} {text(operator)} {value}"
    raise ValueError(f"unknown tag kind {kind!r}")


def _with_rest(sigil: str, rest: "str | None") -> "str | None":
    if rest is None:
        return None
    return sigil if rest == "" else f"{sigil} {rest}"


def _expression_text(
    source: str, body_end: int, tokens: list[dict], start: int
) -> "str | None":
    """Joins the expression tokens that start at `start`; None when anything
    other than whitespace lies between them."""
    cursor = start
    joined: list[tuple[str, str]] = []
    for token in tokens:
        if not _blank(source[cursor : token["start"]]):
            return None
        joined.append((source[token["start"] : token["end"]], token["kind"]))
        cursor = token["end"]
    if not _blank(source[cursor:body_end]):
        return None
    if not joined:
        return None
    return join_tokens(joined)


def _words(text: str) -> list[str]:
    """Splits a block tag body at horizontal whitespace outside string literals."""
    result: list[str] = []
    current = ""
    quote: "str | None" = None
    index = 0
    while index < len(text):
        char = text[index]
        if quote is not None:
            current += char
            if char == "\\":
                current += text[index + 1 : index + 2]
                index += 1
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in (" ", "\t"):
            if current:
                result.append(current)
            current = ""
            index += 1
            continue
        if char in ('"', "'"):
            quote = char
        current += char
        index += 1
    if current:
        result.append(current)
    return result


__all__ = []
