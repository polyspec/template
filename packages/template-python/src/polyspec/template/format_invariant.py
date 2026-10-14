"""Safety invariant of the formatter: two templates are equivalent when their
ASTs are equal after every `span` field is removed (AST-2, AST-7), and, for
indented lines, after the spaces and tabs at the start of every line of text
are removed."""

from __future__ import annotations

import re

_LINE_INDENTATION = re.compile(r"(^|\n)[ \t]+")


def without_spans(value):
    """A copy of an AST value without `span` fields."""
    if isinstance(value, list):
        return [without_spans(item) for item in value]
    if isinstance(value, dict):
        return {
            key: without_spans(field) for key, field in value.items() if key != "span"
        }
    return value


def _is_empty_text(item) -> bool:
    return (
        isinstance(item, dict)
        and item.get("type") == "Text"
        and item.get("value") == ""
    )


def without_line_indentation(value):
    """A copy of an AST value whose `Text` nodes have no spaces or tabs at the
    start of a line. A `Text` node that becomes empty is removed: indentation
    after a line that the renderer removes is a `Text` node of its own."""
    if isinstance(value, list):
        items = [without_line_indentation(item) for item in value]
        return [item for item in items if not _is_empty_text(item)]
    if isinstance(value, dict):
        return {
            key: _LINE_INDENTATION.sub(r"\1", field)
            if value.get("type") == "Text" and key == "value" and isinstance(field, str)
            else without_line_indentation(field)
            for key, field in value.items()
        }
    return value


def same_tree(left, right) -> bool:
    """Compares two AST values structurally, ignoring object key order and every
    `span` field."""
    return without_spans(left) == without_spans(right)
