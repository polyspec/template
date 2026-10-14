#!/usr/bin/env python3
"""The tokens of the conformance cases (CNF-16): every case whose input parses
has the tokens of expected.tokens.json, the EDT-8 tokens of the analysis as
[start, end, type] with UTF-8 byte offsets counted after a byte order mark
(FMT-1, FMT-2), and a case whose input does not parse has no such file. Each
case is the test method test_<group>/<name>, as the suite unit tokens of
config/parity.json reads the results."""

import json
import unittest
from pathlib import Path

from polyspec.template import (
    DEFAULT_DELIMITERS,
    Source,
    analyze_template,
    parse_delimiters,
)

CASES = Path(__file__).resolve().parents[3] / "tests" / "cases"


def check(test: unittest.TestCase, directory: Path) -> None:
    expected_file = directory / "expected.tokens.json"
    if not (directory / "expected.ast.json").exists():
        test.assertFalse(
            expected_file.exists(), "expected.tokens.json without expected.ast.json"
        )
        return
    options = directory / "options.json"
    delimiters = (
        json.loads(options.read_text("utf-8")).get("delimiters")
        if options.exists()
        else None
    )
    source = Source.from_bytes("input.tpl", (directory / "input.tpl").read_bytes())
    analysis = analyze_template(
        source,
        DEFAULT_DELIMITERS if delimiters is None else parse_delimiters(delimiters),
    )
    tokens = [
        [source.byte_at(t["start"]), source.byte_at(t["end"]), t["kind"]]
        for t in analysis.tokens
    ]
    test.assertEqual(tokens, json.loads(expected_file.read_text("utf-8")))


class CaseTokens(unittest.TestCase):
    pass


def _case_test(directory: Path):
    def test(self: unittest.TestCase) -> None:
        check(self, directory)

    return test


for _directory in sorted(path for path in CASES.glob("*/*") if path.is_dir()):
    setattr(
        CaseTokens,
        f"test_{_directory.parent.name}/{_directory.name}",
        _case_test(_directory),
    )
