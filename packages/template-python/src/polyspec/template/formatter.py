"""Formatter entry: formats every tag and the indentation of every line, and
refuses a result whose AST differs from the AST of the source
(docs/operations/editor-tools.md)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .errors import TemplateError, position_of
from .format_body import format_body
from .format_indent import IndentError, indent_edits
from .format_invariant import same_tree, without_line_indentation
from .parser import analyze_template, parse_template
from .scanner import DEFAULT_DELIMITERS, parse_delimiters
from .source import Source

_BOM = "﻿"
_INDENT_UNIT = re.compile(r" +|\t")


@dataclass(frozen=True)
class FormatOptions:
    """What `format_template` accepts besides the source.

    `range` is a (start, end) pair of code point indexes into the source; only
    tags that lie completely inside it and lines that start inside it are
    formatted. `indent` is the indent unit, a run of spaces or one tab; None
    keeps the indentation of every line. `template_blocks` is "indent", where
    template blocks add a level like HTML elements, or "flat", where they add
    none.
    """

    name: str = "template.tpl"
    delimiters: "str | None" = None
    range: "tuple[int, int] | None" = None
    indent: "str | None" = "  "
    template_blocks: str = "indent"


@dataclass(frozen=True)
class FormatError:
    """Why `format_template` returned no text.

    `reason` is "parse" when the source does not parse, "invariant" when the
    formatted text does not parse to the same AST, and "html" when the HTML
    structure is not balanced, so the lines cannot be indented. `code` is the
    error code of the parser or None. `line` and `col` are 1-based; `col`
    counts UTF-8 bytes, as parser errors do (ERR-1).
    """

    reason: str
    code: "str | None"
    line: int
    col: int
    message: str


@dataclass(frozen=True)
class FormatResult:
    """The formatted text, or the reason why the source is kept."""

    ok: bool
    text: "str | None" = None
    changed: bool = False
    error: "FormatError | None" = None


def format_template(
    source: str, options: "FormatOptions | None" = None
) -> FormatResult:
    """Formats the whitespace inside the tags of a template and the indentation
    of its lines. Other text outside tags, comments and directives are never
    changed. The source and the result are parsed, and the result is returned
    only when both ASTs are equal without their `span` fields and, when lines
    are indented, without the spaces and tabs at the start of lines of text.

    Raises ValueError for an indent unit that is not a run of spaces or one
    tab, a template_blocks value other than "indent" or "flat", or delimiters
    that are not a delimiter pair.
    """
    options = options or FormatOptions()
    indent = options.indent
    if indent is not None and _INDENT_UNIT.fullmatch(indent) is None:
        raise ValueError("indent must be a run of spaces or one tab")
    if options.template_blocks not in ("indent", "flat"):
        raise ValueError('template_blocks must be "indent" or "flat"')
    delimiters = DEFAULT_DELIMITERS
    if options.delimiters is not None:
        delimiters = parse_delimiters(options.delimiters)
        if delimiters is None:
            raise ValueError(f"{options.delimiters!r} is not a delimiter pair")
    name = options.name
    bom = _BOM if source.startswith(_BOM) else ""
    text = source[len(bom) :]
    template_source = Source.from_text(name, text)
    try:
        analysis = analyze_template(template_source, delimiters)
    except TemplateError as error:
        return FormatResult(
            ok=False,
            error=FormatError(
                "parse", error.code, error.line, error.col, error.message
            ),
        )

    shift = len(bom)
    range_ = (
        None
        if options.range is None
        else (options.range[0] - shift, options.range[1] - shift)
    )
    edits: list[tuple[int, int, str]] = []
    for tag in analysis.tags:
        if tag["kind"] == "directive":
            continue
        if range_ is not None and (tag["start"] < range_[0] or tag["end"] > range_[1]):
            continue
        tokens = [
            token
            for token in analysis.tokens
            if token["start"] >= tag["body_start"] and token["end"] <= tag["body_end"]
        ]
        body = format_body(
            tag["kind"], text, tag["body_start"], tag["body_end"], tokens
        )
        if body is None or body == text[tag["body_start"] : tag["body_end"]]:
            continue
        edits.append((tag["body_start"], tag["body_end"], body))
    if indent is not None:
        try:
            edits.extend(
                indent_edits(
                    text, analysis.tags, indent, options.template_blocks, range_
                )
            )
        except IndentError as error:
            line, col = position_of(
                template_source.lines, template_source.byte_at(error.index)
            )
            return FormatResult(
                ok=False, error=FormatError("html", None, line, col, error.message)
            )
        edits.sort(key=lambda edit: edit[0])
    if not edits:
        return FormatResult(ok=True, text=source, changed=False)

    formatted = _apply(text, edits)
    line, col = position_of(template_source.lines, template_source.byte_at(edits[0][0]))
    try:
        after = parse_template(Source.from_text(name, formatted), delimiters)
    except TemplateError as error:
        return FormatResult(
            ok=False,
            error=FormatError(
                "invariant",
                None,
                line,
                col,
                f"formatted text does not parse: {error.message}",
            ),
        )
    if indent is None:
        same = same_tree(analysis.ast, after)
    else:
        same = same_tree(
            without_line_indentation(analysis.ast), without_line_indentation(after)
        )
    if not same:
        return FormatResult(
            ok=False,
            error=FormatError(
                "invariant",
                None,
                line,
                col,
                "formatted text parses to a different AST",
            ),
        )
    return FormatResult(ok=True, text=bom + formatted, changed=True)


def _apply(text: str, edits: list[tuple[int, int, str]]) -> str:
    output: list[str] = []
    cursor = 0
    for start, end, replacement in edits:
        output.append(text[cursor:start])
        output.append(replacement)
        cursor = end
    output.append(text[cursor:])
    return "".join(output)
