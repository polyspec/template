#!/usr/bin/env python3
"""Bound data with the expectations that every implementation shares
(tests/fixtures/bound-data/cases.json, VAL-22): a bound map renders the bytes
of the host map that it was bound from, also through a prepared render more
than once (RT-61, RT-62), and merge keeps the keys of the first map in place
and lets a later map override a name (RT-26)."""

import json
import unittest
from pathlib import Path

from polyspec.template import (
    AstProgram,
    Engine,
    EngineOptions,
    FsLoader,
    TemplateError,
    bind,
    merge,
)

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "bound-data"
CASES = json.loads((FIXTURE / "cases.json").read_text(encoding="utf-8"))


def engine() -> Engine:
    return Engine(AstProgram(EngineOptions(loader=FsLoader(str(FIXTURE)))))


def failure(operation) -> dict:
    try:
        operation()
    except TemplateError as error:
        return error.to_object()
    raise AssertionError("the operation did not fail")


def expect_failure(testcase, operation, code: str) -> None:
    error = failure(operation)
    testcase.assertEqual(
        {
            key: error[key]
            for key in ("code", "template", "line", "col", "offset", "end")
        },
        {"code": code, "template": "", "line": 0, "col": 0, "offset": 0, "end": 0},
    )


class BoundData(unittest.TestCase):
    def test_a_bound_map_renders_the_bytes_of_the_host_map(self):
        program = engine()
        page = CASES["outputs"]["page"]
        self.assertEqual(program.render("page.tpl", bind(CASES["assign"])), page)
        self.assertEqual(program.render("page.tpl", CASES["assign"]), page)
        prepared = program.prepare("page.tpl", bind(CASES["assign"]))
        self.assertEqual([prepared.render(), prepared.render()], [page, page])

    def test_merge_follows_the_precedence_of_rt_26(self):
        merged = merge(bind(CASES["assign"]), bind(CASES["second"]))
        self.assertEqual(list(merged.entries), CASES["mergedKeys"])
        self.assertEqual(
            engine().render("page.tpl", merged), CASES["outputs"]["merged"]
        )

    # ERR-14: a failed bind has the code of the failed check, an empty template and zero positions.
    def test_bind_fails_with_the_code_of_the_failed_check_without_a_position(self):
        for value in (5, [1], '{"a":1}'):
            expect_failure(
                self, lambda value=value: bind(value), "E_DATA_UNSUPPORTED_TYPE"
            )
        expect_failure(
            self, lambda: bind({"n": float("nan")}), "E_DATA_NUMBER_NOT_FINITE"
        )
        expect_failure(self, lambda: bind({"n": 2**53}), "E_DATA_NUMBER_RANGE")
        expect_failure(self, lambda: bind({"s": "\ud800"}), "E_DATA_INVALID_UTF8")
        deep = 1
        for _ in range(65):
            deep = [deep]
        expect_failure(self, lambda: bind({"deep": deep}), "E_DATA_DEPTH")
        bound = bind({"a": 1})
        expect_failure(self, lambda: merge(bound, {"b": 2}), "E_DATA_UNSUPPORTED_TYPE")
        expect_failure(self, lambda: merge({"b": 2}, bound), "E_DATA_UNSUPPORTED_TYPE")
