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
    bind,
    merge,
)

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "bound-data"
CASES = json.loads((FIXTURE / "cases.json").read_text(encoding="utf-8"))


def engine() -> Engine:
    return Engine(AstProgram(EngineOptions(loader=FsLoader(str(FIXTURE)))))


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
