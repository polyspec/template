#!/usr/bin/env python3
"""The tokens of the conformance cases (CNF-16): every case whose input parses
has the tokens of expected.tokens.json, the EDT-8 tokens of the analysis as
[start, end, type] with UTF-8 byte offsets counted after a byte order mark
(FMT-1, FMT-2), and a case whose input does not parse has no such file. Each
case is the test `<group>/<name>`, as the suite unit tokens of
config/parity.json reads the results."""

import json
import unittest

from polyspec.template import (
    DEFAULT_DELIMITERS,
    Source,
    analyze_template,
    parse_delimiters,
)

from .cases import CaseTest, case_suite, delimiters_of


class CaseTokens(CaseTest):
    def run_case(self) -> None:
        expected_file = self.directory / "expected.tokens.json"
        if not (self.directory / "expected.ast.json").exists():
            self.assertFalse(
                expected_file.exists(), "expected.tokens.json without expected.ast.json"
            )
            return
        delimiters = delimiters_of(self.directory)
        source = Source.from_bytes(
            "input.tpl", (self.directory / "input.tpl").read_bytes()
        )
        analysis = analyze_template(
            source,
            DEFAULT_DELIMITERS if delimiters is None else parse_delimiters(delimiters),
        )
        tokens = [
            [source.byte_at(t["start"]), source.byte_at(t["end"]), t["kind"]]
            for t in analysis.tokens
        ]
        self.assertEqual(tokens, json.loads(expected_file.read_text("utf-8")))


def load_tests(
    loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: "str | None"
) -> unittest.TestSuite:
    return case_suite(CaseTokens)
