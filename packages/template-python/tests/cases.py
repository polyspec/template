"""The conformance cases of tests/cases for the per-case tests: the case
directories, the delimiters of their options.json, and the test case class
whose instances are the cases of a suite. A case runs as one test whose id and
description are `<group>/<name>`, the case names of the suite units of
config/parity.json."""

import json
import unittest
from pathlib import Path

CASES = Path(__file__).resolve().parents[3] / "tests" / "cases"


def case_directories() -> list[Path]:
    """Every case directory `<group>/<name>` of tests/cases, sorted."""
    return sorted(path for path in CASES.glob("*/*") if path.is_dir())


def delimiters_of(directory: Path) -> "str | None":
    """The delimiters of the options.json of `directory`, or None when the
    directory has no options.json or the file names no delimiters."""
    try:
        text = (directory / "options.json").read_text("utf-8")
    except FileNotFoundError:
        return None
    return json.loads(text).get("delimiters")


class CaseTest(unittest.TestCase):
    """One case of a suite. A subclass defines run_case; load_tests of its
    module returns case_suite(subclass). The test method is not named test_*,
    so the default loader makes no instance without a case directory."""

    def __init__(self, directory: Path) -> None:
        super().__init__("run_case")
        self.directory = directory

    def run_case(self) -> None:
        raise NotImplementedError

    def id(self) -> str:
        return f"{self.directory.parent.name}/{self.directory.name}"

    def __str__(self) -> str:
        return self.id()

    def shortDescription(self) -> None:
        return None


def case_suite(test: "type[CaseTest]") -> unittest.TestSuite:
    """One instance of `test` for each case directory."""
    return unittest.TestSuite(test(directory) for directory in case_directories())
