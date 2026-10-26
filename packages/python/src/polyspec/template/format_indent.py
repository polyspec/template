"""Indentation: the spaces and tabs at the start of each line, set by the
nesting of HTML elements and template blocks."""

from __future__ import annotations

import re

_VOID = frozenset(
    (
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr",
    )
)  # fmt: skip
# Elements whose content is not HTML markup: the indentation does not read tags
# inside them.
_RAW = frozenset(("script", "style", "textarea"))
# Elements whose lines keep their indentation.
_KEPT = frozenset(("pre", "script", "style", "textarea"))
_OPEN_BLOCK = frozenset(("if", "for", "ifblock"))
_BRANCH = frozenset(("elseif", "else"))
_HTML_TAG = re.compile(r"<(/?)([A-Za-z][A-Za-z0-9-]*)")
_HORIZONTAL = re.compile(r"[ \t]*")


class IndentError(Exception):
    """Why the HTML structure cannot be indented. `index` is the code point
    index of the tag where the structure fails."""

    def __init__(self, index: int, message: str):
        super().__init__(message)
        self.index = index
        self.message = message


class _Step:
    """A change of depth at an index. `dedent` marks a tag that takes one level
    from its own line."""

    __slots__ = ("index", "delta", "dedent")

    def __init__(self, index: int, delta: int, dedent: bool):
        self.index = index
        self.delta = delta
        self.dedent = dedent


class _Block:
    """A template block: the open HTML elements at its start, at the end of its
    first branch, and whether it has an else branch."""

    __slots__ = ("start", "branch_end", "has_else")

    def __init__(self, start: list[tuple[str, int]]):
        self.start = start
        self.branch_end: "list[str] | None" = None
        self.has_else = False


def indent_edits(
    text: str,
    tags: list[dict],
    unit: str,
    template_blocks: str,
    range_: "tuple[int, int] | None",
) -> list[tuple[int, int, str]]:
    """The edits (start, end, text) that set the indentation of every line, or
    IndentError when the HTML structure cannot be indented."""
    edits: list[tuple[int, int, str]] = []
    for start, end, indentation in line_indentations(text, tags, unit, template_blocks):
        if indentation is None:
            continue
        if range_ is not None and (start < range_[0] or start >= range_[1]):
            continue
        if text[start:end] != indentation:
            edits.append((start, end, indentation))
    return edits


def line_indentations(
    text: str, tags: list[dict], unit: str, template_blocks: str
) -> list[tuple[int, int, "str | None"]]:
    """The indentation of every line as (start, end of its current indentation,
    indentation under the rule or None for a line that keeps its indentation)."""
    steps, kept, inside = _scan_structure(text, tags, template_blocks)
    dedents = {step.index for step in steps if step.dedent}
    lines: list[tuple[int, int, "str | None"]] = []
    step = 0
    depth = 0
    line_start = 0
    while line_start <= len(text):
        while step < len(steps) and steps[step].index < line_start:
            depth += steps[step].delta
            step += 1
        first = _HORIZONTAL.match(text, line_start).end()
        if _within(kept, line_start):
            lines.append((line_start, first, None))
        else:
            blank = first == len(text) or text[first] in ("\n", "\r")
            level = depth + (1 if _within(inside, line_start) else 0)
            if first in dedents:
                level -= 1
            # The formatter empties a blank line.
            lines.append((line_start, first, "" if blank else unit * max(level, 0)))
        newline = text.find("\n", line_start)
        if newline < 0:
            break
        line_start = newline + 1
    return lines


def _within(ranges: list[tuple[int, int]], index: int) -> bool:
    return any(start < index < end for start, end in ranges)


def _scan_structure(text: str, tags: list[dict], template_blocks: str):
    steps: list[_Step] = []
    kept: list[tuple[int, int]] = []
    inside: list[tuple[int, int]] = []
    elements: list[tuple[str, int]] = []
    blocks: list[_Block] = []
    counted = template_blocks == "indent"
    state = {"next": 0}
    raw: "str | None" = None
    kept_start: "int | None" = None
    position = 0

    def names() -> list[str]:
        return [name for name, _ in elements]

    def before_line(index: int) -> int:
        """The index from which a change of depth applies to the line of a tag:
        before the line when the tag starts it."""
        line_start = text.rfind("\n", 0, index) + 1
        if _HORIZONTAL.fullmatch(text, line_start, index):
            return line_start - 1
        return index

    def template_tag(tag: dict) -> None:
        """Template tags are opaque to the HTML scan; block tags open, branch
        and close template blocks. Every branch of a block must end with the
        same open HTML elements, and a block without an else branch with those
        of its start."""
        nonlocal elements
        kept.append((tag["start"], tag["end"]))
        kind = tag["kind"]
        if kind in _OPEN_BLOCK:
            blocks.append(_Block(list(elements)))
            if counted:
                steps.append(_Step(tag["end"], 1, False))
            return
        if kind not in _BRANCH and kind != "close":
            return
        if not blocks:
            return
        block = blocks[-1]
        end = names()
        if block.branch_end is not None and block.branch_end != end:
            raise IndentError(
                tag["start"],
                "the HTML elements open at the end of this branch differ from "
                "those of the first branch",
            )
        if kind == "close":
            if not block.has_else and [name for name, _ in block.start] != end:
                raise IndentError(
                    tag["start"],
                    "a template block without an else branch must end with the "
                    "HTML elements open at its start",
                )
            blocks.pop()
            # The close tag aligns with the start of its block; the elements
            # that every branch opened apply after it.
            opened = len(end) - len(block.start)
            if opened != 0:
                steps.append(_Step(before_line(tag["start"]), -opened, False))
                steps.append(_Step(tag["end"], opened, False))
            if counted:
                steps.append(_Step(tag["start"], -1, True))
            return
        block.branch_end = end
        if kind == "else":
            block.has_else = True
        # The next branch starts from the elements open at the start of the block.
        steps.append(
            _Step(before_line(tag["start"]), len(block.start) - len(elements), False)
        )
        elements = list(block.start)
        if counted:
            steps.append(_Step(tag["start"], 0, True))

    def html_tag_end(start: int) -> int:
        """Moves past one HTML tag from `<` and returns its end, reading
        template tags inside it."""
        quote: "str | None" = None
        quote_start = 0
        index = start + 1
        while index < len(text):
            if state["next"] < len(tags) and tags[state["next"]]["start"] == index:
                tag = tags[state["next"]]
                template_tag(tag)
                state["next"] += 1
                index = tag["end"]
                continue
            character = text[index]
            if quote is not None:
                if character == quote:
                    kept.append((quote_start, index))
                    quote = None
            elif character in ('"', "'"):
                quote = character
                quote_start = index
            elif character == ">":
                return index + 1
            index += 1
        raise IndentError(start, 'the HTML tag is not closed with ">"')

    def skip_template_tags(end: int) -> int:
        """Template tags inside an HTML comment are still template tags; the
        comment keeps its lines."""
        while state["next"] < len(tags) and tags[state["next"]]["start"] < end:
            tag = tags[state["next"]]
            state["next"] += 1
            template_tag(tag)
        return end

    while position < len(text):
        if state["next"] < len(tags) and tags[state["next"]]["start"] == position:
            tag = tags[state["next"]]
            template_tag(tag)
            state["next"] += 1
            position = tag["end"]
            continue
        if text[position] != "<":
            position += 1
            continue
        if raw is not None and not _starts_with_end_tag(text, position, raw):
            position += 1
            continue
        if text.startswith("<!--", position):
            close = text.find("-->", position + 4)
            end = len(text) if close < 0 else close + 3
            kept.append((position, end))
            position = skip_template_tags(end)
            continue
        if text[position + 1 : position + 2] in ("!", "?"):
            position = html_tag_end(position)
            continue
        match = _HTML_TAG.match(text[position : position + 64])
        if match is None:
            position += 1
            continue
        closing = match.group(1) == "/"
        name = match.group(2).lower()
        end = html_tag_end(position)
        if "\n" in text[position:end]:
            inside.append((position, end))
        if closing:
            if name in _VOID:
                position = end
                continue
            if not elements or elements[-1][0] != name:
                if not elements:
                    message = f"the end tag </{name}> has no open element"
                else:
                    message = (
                        f"the end tag </{name}> does not match the open element "
                        f"<{elements[-1][0]}>"
                    )
                raise IndentError(position, message)
            steps.append(_Step(position, -1, True))
            elements.pop()
            if (
                name in _KEPT
                and not any(element in _KEPT for element, _ in elements)
                and kept_start is not None
            ):
                newline = text.find("\n", position)
                kept.append((kept_start, len(text) if newline < 0 else newline))
                kept_start = None
            raw = None
            position = end
            continue
        self_closing = text[end - 2 : end - 1] == "/"
        if name not in _VOID and not self_closing:
            elements.append((name, position))
            steps.append(_Step(end, 1, False))
            if name in _KEPT and kept_start is None:
                kept_start = end
            if name in _RAW:
                raw = name
        position = end

    if elements:
        name, start = elements[-1]
        raise IndentError(start, f"the element <{name}> is not closed")
    steps.sort(key=lambda item: item.index)
    return steps, kept, inside


def _starts_with_end_tag(text: str, index: int, name: str) -> bool:
    return text[index : index + len(name) + 2].lower() == f"</{name}"


__all__ = []
