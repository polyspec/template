#!/usr/bin/env python3
"""Over every .tpl under tests/cases the formatter holds the safety invariant
and is idempotent (FMT-13, FMT-15). The tokens and the format results of each
case are compared in test_case_tokens.py and test_case_format.py."""

import re
import unittest
from pathlib import Path

from polyspec.template import (
    DEFAULT_DELIMITERS,
    FormatOptions,
    FormatResult,
    Source,
    TemplateError,
    analyze_template,
    format_template,
    parse_delimiters,
    parse_template,
)
from polyspec.template.format_invariant import same_tree, without_line_indentation

from .cases import CASES, delimiters_of

_LINE_INDENTATION = re.compile(r"(^|\n)[ \t]+")


def delimiter_pair(value: "str | None") -> tuple[str, str]:
    return DEFAULT_DELIMITERS if value is None else parse_delimiters(value)


def parsed(text: str, delimiters: "str | None") -> "dict | None":
    try:
        return parse_template(
            Source.from_text("x.tpl", text), delimiter_pair(delimiters)
        )
    except TemplateError:
        return None


def outside_tags(text: str, delimiters: "str | None") -> list[str]:
    """The source text outside every tag, comment and directive, in order."""
    source = text[1:] if text.startswith("﻿") else text
    tags = analyze_template(
        Source.from_text("x.tpl", source), delimiter_pair(delimiters)
    ).tags
    pieces: list[str] = []
    cursor = 0
    for tag in tags:
        pieces.append(source[cursor : tag["start"]])
        cursor = tag["end"]
    pieces.append(source[cursor:])
    return pieces


def without_indentation(pieces: list[str]) -> list[str]:
    return [_LINE_INDENTATION.sub(r"\1", piece) for piece in pieces]


class SafetyInvariant(unittest.TestCase):
    """Over every .tpl under tests/cases, with indent None and with the
    default indentation: the formatted AST equals the source AST without spans
    (and, when indented, without line indentation), the text outside tags is
    unchanged (up to line indentation), and formatting is idempotent. With
    indentation the result may instead be the html error. A template that is
    not UTF-8 is the parse error E_LEX_INVALID_UTF8 of its bytes."""

    def test_holds_the_invariant_and_idempotence_over_every_case_template(self):
        files = sorted(CASES.rglob("*.tpl"))
        self.assertTrue(files, f"{CASES} holds no template")
        for path in files:
            with self.subTest(file=str(path.relative_to(CASES))):
                self.check(path)

    def check(self, path: Path) -> None:
        data = path.read_bytes()
        name = str(path.relative_to(CASES))
        try:
            source = data.decode("utf-8")
        except UnicodeDecodeError:
            with self.assertRaises(TemplateError) as raised:
                Source.from_bytes(name, data)
            self.assertEqual(raised.exception.code, "E_LEX_INVALID_UTF8")
            return
        delimiters = delimiters_of(path.parent)
        options = FormatOptions(name=name, delimiters=delimiters)
        kept = FormatOptions(name=name, delimiters=delimiters, indent=None)
        result = format_template(source, kept)
        indented = format_template(source, options)
        before = parsed(source.removeprefix("﻿"), delimiters)
        if before is None:
            for item in (result, indented):
                self.assertFalse(item.ok)
                self.assertEqual(item.error.reason, "parse")
            return
        self.assertTrue(result.ok, result.error)
        after = parsed(result.text.removeprefix("﻿"), delimiters)
        self.assertTrue(same_tree(before, after))
        self.assertEqual(
            outside_tags(result.text, delimiters), outside_tags(source, delimiters)
        )
        self.assertEqual(
            format_template(result.text, kept),
            FormatResult(ok=True, text=result.text, changed=False),
        )
        if not indented.ok:
            self.assertEqual(indented.error.reason, "html")
            return
        after = parsed(indented.text.removeprefix("﻿"), delimiters)
        self.assertTrue(
            same_tree(without_line_indentation(before), without_line_indentation(after))
        )
        self.assertEqual(
            without_indentation(outside_tags(indented.text, delimiters)),
            without_indentation(outside_tags(source, delimiters)),
        )
        self.assertEqual(
            format_template(indented.text, options),
            FormatResult(ok=True, text=indented.text, changed=False),
        )


if __name__ == "__main__":
    unittest.main()
