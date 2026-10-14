#!/usr/bin/env python3
"""Renders of one program from concurrent threads (RT-70): after the host
registered its functions, the template cache of the program is the only state
that renders share and write, and a bound map (VAL-22) is read by every render
that it is given to. The program guards that cache, so renders that load a
template whose version changes under them keep one parse of each version
that the refresh policy admits."""

import threading
import unittest
from concurrent.futures import ThreadPoolExecutor

from polyspec.template import (
    AstProgram,
    Engine,
    EngineOptions,
    LoadedSource,
    MapLoader,
    bind,
)

PAGE = {
    "page.tpl": "<p>{= title}</p>{+ /part.tpl}",
    "part.tpl": "<i>{= count}</i>",
}
EXPECTED = "<p>T</p><i>2</i>"
THREADS = 8


class ChangingLoader:
    """A loader whose template has a new source and version on every load, and
    whose first THREADS loads return together once every thread loaded, so that
    the renders reach the template cache of the program at the same time. The text makes
    the parse long enough that the renders overlap in the cache."""

    def __init__(self) -> None:
        self.barrier = threading.Barrier(THREADS)
        self.count = 0
        self.count_lock = threading.Lock()

    def load(self, name: str) -> LoadedSource:
        with self.count_lock:
            self.count += 1
            version = str(self.count)
        if int(version) <= THREADS:
            self.barrier.wait()
        return LoadedSource(f"{version}|" + "<p>{= a}</p>" * 2000, version)


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

    def test_the_false_policy_keeps_the_first_parse_under_concurrent_loads(self):
        # Under artifact refresh false the program never parses a template
        # again once it holds one (RT-64): every render of the threads, which
        # loaded eight versions at the same time, renders the one parse that
        # the program kept.
        engine = Engine(
            AstProgram(EngineOptions(loader=ChangingLoader(), artifact_refresh="false"))
        )

        def render(_index: int) -> str:
            return engine.render("page.tpl", {"a": 1}).split("|")[0]

        with ThreadPoolExecutor(max_workers=THREADS) as pool:
            versions = set(pool.map(render, range(THREADS)))
        self.assertEqual(len(versions), 1, versions)
        self.assertEqual(
            engine.render("page.tpl", {"a": 1}).split("|")[0], versions.pop()
        )
