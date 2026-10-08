"""Standalone line groups (LEX-14, LEX-15)."""

from __future__ import annotations


def standalone_ranges(text: str, tags: list[dict]) -> list[tuple[int, int]]:
    """The code point index ranges that standalone line groups remove from the output."""
    line_starts = [0]
    for index, char in enumerate(text):
        if char == "\n":
            line_starts.append(index + 1)
    line_count = len(line_starts)

    def line_of(index: int) -> int:
        low, high = 0, line_count - 1
        while low < high:
            middle = (low + high + 1) >> 1
            if line_starts[middle] <= index:
                low = middle
            else:
                high = middle - 1
        return low

    def line_end(line: int) -> int:
        return line_starts[line + 1] if line + 1 < line_count else len(text)

    tags_by_line: list[list[dict]] = [[] for _ in range(line_count)]
    for tag in sorted(tags, key=lambda item: item["start"]):
        tags_by_line[line_of(tag["start"])].append(tag)

    ranges: list[tuple[int, int]] = []
    line = 0
    while line < line_count:
        group_end = line
        has_tag = False
        has_echo = False
        group_tags: list[dict] = []
        for cursor in range(line, group_end + 1):
            for tag in tags_by_line[cursor]:
                has_tag = True
                if tag["echo"]:
                    has_echo = True
                group_tags.append(tag)
                end_line = line_of(max(tag["start"], tag["end"] - 1))
                if end_line > group_end:
                    group_end = end_line
        if has_tag and not has_echo:
            start = line_starts[line]
            end = line_end(group_end)
            if _only_whitespace_outside(text, start, end, group_tags):
                ranges.append((start, end))
        line = group_end + 1
    return ranges


def _only_whitespace_outside(text: str, start: int, end: int, tags: list[dict]) -> bool:
    index = start
    for tag in tags:
        if not _whitespace_only(text, index, tag["start"]):
            return False
        index = tag["end"]
    return _whitespace_only(text, index, end)


def _whitespace_only(text: str, start: int, end: int) -> bool:
    for index in range(start, end):
        if text[index] not in " \t\r\n":
            return False
    return True
