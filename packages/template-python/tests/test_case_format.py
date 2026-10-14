#!/usr/bin/env python3
"""The format results of the conformance cases (CNF-17): every case whose input
parses formats to the entries of expected.format.json, with the default options
("indent") and with indent None ("keep"), and a case whose input does not parse
has no such file. Each case is the test `<group>/<name>`, as the suite unit
formatting of config/parity.json reads the results."""

import json
import unittest

from polyspec.template import FormatOptions, FormatResult, format_template

from .cases import CaseTest, case_suite, delimiters_of


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


class CaseFormat(CaseTest):
    def run_case(self) -> None:
        expected_file = self.directory / "expected.format.json"
        if not (self.directory / "expected.ast.json").exists():
            self.assertFalse(
                expected_file.exists(), "expected.format.json without expected.ast.json"
            )
            return
        delimiters = delimiters_of(self.directory)
        text = (self.directory / "input.tpl").read_bytes().decode("utf-8")
        indent = format_template(
            text, FormatOptions(name="input.tpl", delimiters=delimiters)
        )
        keep = format_template(
            text, FormatOptions(name="input.tpl", delimiters=delimiters, indent=None)
        )
        self.assertEqual(
            {"indent": result_object(indent), "keep": result_object(keep)},
            json.loads(expected_file.read_text("utf-8")),
        )


def load_tests(
    loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: "str | None"
) -> unittest.TestSuite:
    return case_suite(CaseFormat)
