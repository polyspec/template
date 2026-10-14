#!/usr/bin/env python3
"""The conformance cases of tests/cases for the token analysis and the
formatter (CNF-2): the tokens of every input that parses equal
expected.tokens.json, the formatted texts and errors equal
expected.format.json, and over every .tpl under tests/cases the formatter holds
the safety invariant and is idempotent. Python ranges are code point indexes;
this suite converts them to the UTF-8 byte offsets of the case files, counted
after a byte order mark is removed."""

import json
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

CASES = Path(__file__).resolve().parents[3] / "tests" / "cases"
_LINE_INDENTATION = re.compile(r"(^|\n)[ \t]+")


def delimiters_for(path: Path) -> "str | None":
    options = path.parent / "options.json"
    if not options.exists():
        return None
    return json.loads(options.read_text("utf-8")).get("delimiters")


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


def result_object(result: FormatResult) -> dict:
    """The form of a result in expected.format.json (no message)."""
    if result.ok:
        return {"text": result.text}
    error = result.error
    return {
        "error": {
            "reason": error.reason,
            "code": error.code,
            "line": error.line,
            "col": error.col,
        }
    }


def readable_inputs() -> list[Path]:
    """The case inputs that are valid UTF-8; an input with invalid UTF-8 is a
    lexical error case without a source string (LEX-1)."""
    return [path for path in sorted(CASES.glob("*/*/input.tpl")) if _readable(path)]


class ExpectedFiles(unittest.TestCase):
    def test_finds_the_conformance_inputs(self):
        self.assertGreater(len(readable_inputs()), 200)

    def test_tokens_of_every_input_that_parses_equal_expected_tokens(self):
        for path in readable_inputs():
            delimiters = delimiters_for(path)
            source = Source.from_bytes("input.tpl", path.read_bytes())
            expected_file = path.parent / "expected.tokens.json"
            with self.subTest(case=str(path.parent.relative_to(CASES))):
                try:
                    analysis = analyze_template(source, delimiter_pair(delimiters))
                except TemplateError:
                    self.assertFalse(expected_file.exists())
                    continue
                tokens = [
                    [source.byte_at(t["start"]), source.byte_at(t["end"]), t["kind"]]
                    for t in analysis.tokens
                ]
                self.assertEqual(tokens, json.loads(expected_file.read_text("utf-8")))

    def test_formatted_text_of_every_input_that_parses_equals_expected_format(self):
        for path in readable_inputs():
            delimiters = delimiters_for(path)
            text = path.read_bytes().decode("utf-8")
            expected_file = path.parent / "expected.format.json"
            with self.subTest(case=str(path.parent.relative_to(CASES))):
                if parsed(text.removeprefix("﻿"), delimiters) is None:
                    self.assertFalse(expected_file.exists())
                    continue
                expected = json.loads(expected_file.read_text("utf-8"))
                options = FormatOptions(name="input.tpl", delimiters=delimiters)
                self.assertEqual(
                    {
                        "indent": result_object(format_template(text, options)),
                        "keep": result_object(
                            format_template(
                                text,
                                FormatOptions(
                                    name="input.tpl", delimiters=delimiters, indent=None
                                ),
                            )
                        ),
                    },
                    expected,
                )


class SafetyInvariant(unittest.TestCase):
    """Over every .tpl under tests/cases, with indent None and with the
    default indentation: the formatted AST equals the source AST without spans
    (and, when indented, without line indentation), the text outside tags is
    unchanged (up to line indentation), and formatting is idempotent. With
    indentation the result may instead be the html error."""

    def test_holds_the_invariant_and_idempotence_over_every_case_template(self):
        files = [path for path in sorted(CASES.rglob("*.tpl")) if _readable(path)]
        self.assertGreater(len(files), 200)
        for path in files:
            with self.subTest(file=str(path.relative_to(CASES))):
                self.check(path)

    def check(self, path: Path) -> None:
        source = path.read_bytes().decode("utf-8")
        delimiters = delimiters_for(path)
        name = str(path.relative_to(CASES))
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


def _readable(path: Path) -> bool:
    try:
        path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


if __name__ == "__main__":
    unittest.main()
