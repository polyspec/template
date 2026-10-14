#!/usr/bin/env python3
"""Renders of one program from concurrent threads (RT-70): after the host
registered its functions, the template cache of the program is the only state
that renders share and write, and a bound map (VAL-22) is read by every render
that it is given to."""

import unittest
from concurrent.futures import ThreadPoolExecutor

from polyspec.template import AstProgram, Engine, EngineOptions, MapLoader, bind

PAGE = {
    "page.tpl": "<p>{= title}</p>{+ /part.tpl}",
    "part.tpl": "<i>{= count}</i>",
}
EXPECTED = "<p>T</p><i>2</i>"


def renders_of(engine: Engine, assign, threads: int = 8, rounds: int = 50) -> set:
    """The distinct outputs of `rounds` renders in each of `threads` threads
    that render page.tpl of one engine at the same time."""

    def worker(_index: int) -> set:
        return {engine.render("page.tpl", assign) for _ in range(rounds)}

    with ThreadPoolExecutor(max_workers=threads) as pool:
        return set().union(*pool.map(worker, range(threads)))


class Concurrency(unittest.TestCase):
    def test_concurrent_renders_share_one_program(self):
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader(PAGE))))
        self.assertEqual(renders_of(engine, {"title": "T", "count": 2}), {EXPECTED})

    def test_concurrent_renders_read_one_bound_map(self):
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader(PAGE))))
        self.assertEqual(
            renders_of(engine, bind({"title": "T", "count": 2})), {EXPECTED}
        )
