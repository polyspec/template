#!/usr/bin/env python3
"""The format results of the conformance cases (CNF-17): every case whose input
parses formats to the entries of expected.format.json, with the default options
("indent") and with indent None ("keep"), and a case whose input does not parse
has no such file. Each case is the test method test_<group>/<name>, as the suite
unit formatting of config/parity.json reads the results."""

import json
import unittest
from pathlib import Path

from polyspec.template import FormatOptions, FormatResult, format_template

CASES = Path(__file__).resolve().parents[3] / "tests" / "cases"


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


def check(test: unittest.TestCase, directory: Path) -> None:
    expected_file = directory / "expected.format.json"
    if not (directory / "expected.ast.json").exists():
        test.assertFalse(
            expected_file.exists(), "expected.format.json without expected.ast.json"
        )
        return
    options = directory / "options.json"
    delimiters = (
        json.loads(options.read_text("utf-8")).get("delimiters")
        if options.exists()
        else None
    )
    text = (directory / "input.tpl").read_bytes().decode("utf-8")
    indent = format_template(
        text, FormatOptions(name="input.tpl", delimiters=delimiters)
    )
    keep = format_template(
        text, FormatOptions(name="input.tpl", delimiters=delimiters, indent=None)
    )
    test.assertEqual(
        {"indent": result_object(indent), "keep": result_object(keep)},
        json.loads(expected_file.read_text("utf-8")),
    )


class CaseFormat(unittest.TestCase):
    pass


def _case_test(directory: Path):
    def test(self: unittest.TestCase) -> None:
        check(self, directory)

    return test


for _directory in sorted(path for path in CASES.glob("*/*") if path.is_dir()):
    setattr(
        CaseFormat,
        f"test_{_directory.parent.name}/{_directory.name}",
        _case_test(_directory),
    )
