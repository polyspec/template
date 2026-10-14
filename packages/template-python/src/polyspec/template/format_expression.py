"""Expression spacing: joins the expression tokens of one tag with the
separators of the formatting style (docs/operations/editor-tools.md)."""

from __future__ import annotations

# An expression token: its text and the EDT-8 class that the parser gives it.
ExpressionToken = tuple[str, str]


def _is_name(token: "ExpressionToken | None") -> bool:
    """A name that can be called or indexed: a variable or a function name, not
    a keyword."""
    return token is not None and (
        token[1] == "variable"
        or (token[1] == "function" and not token[0].startswith("."))
    )


def _is_accessor(token: "ExpressionToken | None") -> bool:
    """DOT_IDENT and DOT_INDEX tokens (EXP-5); they stay adjacent to the token
    on their left."""
    return token is not None and (
        token[1] == "property" or (token[1] == "function" and token[0].startswith("."))
    )


def _ends_operand(token: "ExpressionToken | None") -> bool:
    """True when the token can end an operand, so that a following `-` is binary
    and a following `[` is an index."""
    if token is None:
        return False
    if token[0] in (")", "]"):
        return True
    if token[1] == "keyword":
        return token[0] != "in"
    return token[1] != "operator"


def join_tokens(tokens: list[ExpressionToken]) -> str:
    """Joins expression tokens with the separators of the formatting style: one
    space around binary and ternary operators, `|`, `=>` and `in`; one space
    after `,`; no space after `(`, `[`, `...` and unary `!` and `-`; no space
    before `,`, `)`, `]` and accessors; no space between a function or method
    name and `(`, between an operand and an index `[`, and around the `::`
    token of `Class::name`."""
    if not tokens:
        return ""
    unary = [
        token[0] == "!"
        or (token[0] == "-" and not _ends_operand(tokens[index - 1] if index else None))
        for index, token in enumerate(tokens)
    ]
    output = [tokens[0][0]]
    for index in range(1, len(tokens)):
        previous = tokens[index - 1]
        current = tokens[index]
        output.append(_separator(previous, current, unary[index - 1]))
        output.append(current[0])
    return "".join(output)


def _separator(
    previous: ExpressionToken, current: ExpressionToken, previous_unary: bool
) -> str:
    if previous[0] == "::" or current[0] == "::":
        return ""
    if current[0] in (",", ")", "]") or _is_accessor(current):
        return ""
    if previous[0] in ("(", "[", "...") or previous_unary:
        return ""
    if current[0] == "(":
        return "" if _is_name(previous) or _is_accessor(previous) else " "
    if current[0] == "[":
        return "" if _ends_operand(previous) else " "
    return " "
