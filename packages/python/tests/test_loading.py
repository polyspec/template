#!/usr/bin/env python3
"""Loading and its failures, as the other implementations test them: the map
loader and the open files of the filesystem loader (RT-10, T23.5), the
artifact refresh policies of a program (RT-64), a loader that fails (RT-9,
ERR-6), the files that the filesystem loader cannot load (RT-10), JSON text that
is not one document (VAL-12) and a delimiter option that is not a delimiter pair,
which is the argument error of Python (ERR-13)."""

import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from polyspec.template import (
    AstProgram,
    BindError,
    Engine,
    EngineOptions,
    FsLoader,
    MapLoader,
    TemplateError,
    parse_json_bytes,
)


def engine_of(loader, refresh: str = "true") -> Engine:
    return Engine(AstProgram(EngineOptions(loader=loader, artifact_refresh=refresh)))


def code_of(run) -> "str | None":
    """The code of the template error that `run` raises, or None."""
    try:
        run()
    except TemplateError as error:
        return error.code
    return None


class FailingLoader:
    def load(self, name: str):
        raise OSError(f"cannot reach {name}")


class ResultLoader:
    """Returns one fixed result for every name."""

    def __init__(self, result):
        self.result = result

    def load(self, name: str):
        return self.result


class Loading(unittest.TestCase):
    def test_artifact_refresh_policies(self):
        # RT-76: under dev a program renders the changed source of a template, and under
        # false it keeps its first parse.
        dev_loader = MapLoader({"a.tpl": "1"})
        dev = engine_of(dev_loader, "dev")
        self.assertEqual(dev.render("a.tpl", {}), "1")
        dev_loader.set("a.tpl", "2")
        self.assertEqual(dev.render("a.tpl", {}), "2")

        immutable_loader = MapLoader({"a.tpl": "1"})
        immutable = engine_of(immutable_loader, "false")
        self.assertEqual(immutable.render("a.tpl", {}), "1")
        immutable_loader.set("a.tpl", "2")
        self.assertEqual(immutable.render("a.tpl", {}), "1")

    def test_the_map_loader_returns_a_held_source_with_a_version(self):
        loader = MapLoader({"a.tpl": "x"})
        loaded = loader.load("a.tpl")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.source, "x")
        self.assertNotEqual(loaded.version, "")
        self.assertIsNone(loader.load("b.tpl"))

    def test_the_filesystem_loader_keeps_no_file_open(self):
        # RT-75: the filesystem loader closes each file that it reads before load
        # returns, so no file stays open.
        # A loader that read many templates holds no descriptor of them, as
        # the open descriptors of the process in /dev/fd show (T23.5).
        with tempfile.TemporaryDirectory() as directory:
            templates = 64
            for index in range(templates):
                Path(directory, f"t{index}.tpl").write_text("x")
            loader = FsLoader(directory)
            before = len(os.listdir("/dev/fd"))
            for index in range(templates):
                self.assertIsNotNone(loader.load(f"t{index}.tpl"))
            self.assertLessEqual(len(os.listdir("/dev/fd")), before)

    def test_a_loader_error_is_a_load_failure(self):
        self.assertEqual(
            code_of(lambda: engine_of(FailingLoader()).render("a.tpl", {})),
            "E_LOAD_FAILED",
        )

    def test_a_loader_result_without_a_source_an_ast_or_a_version_is_a_load_failure(
        self,
    ):
        # RT-9: a result that holds neither a source text nor an AST, or no version, fails to load; the
        # attributes are read in the handling of the result, so a missing one is the failure too.
        cases = [
            (
                "template a.tpl cannot be loaded: the loader returned no source text and no AST",
                SimpleNamespace(version="1"),
            ),
            (
                "template a.tpl cannot be loaded: the loader returned no version",
                SimpleNamespace(source="a"),
            ),
            (
                "template a.tpl cannot be loaded: the loader returned no version",
                SimpleNamespace(source="a", version=""),
            ),
        ]
        for message, result in cases:
            with self.assertRaises(TemplateError) as caught:
                engine_of(ResultLoader(result)).render("a.tpl", {})
            self.assertEqual(
                (caught.exception.code, caught.exception.message),
                ("E_LOAD_FAILED", message),
            )
        self.assertEqual(
            engine_of(ResultLoader(SimpleNamespace(source="", version="1"))).render(
                "a.tpl", {}
            ),
            "",
        )

    def test_the_filesystem_loader_separates_missing_and_unreadable_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            locked = root / "locked.tpl"
            locked.write_text("x")
            locked.chmod(0o000)
            (root / "folder.tpl").mkdir()
            try:
                engine = engine_of(FsLoader(directory))
                # Root reads a file of mode 0o000 and every other user cannot
                # (T19.11): the file fails to load exactly when the process
                # cannot read it.
                readable = os.access(locked, os.R_OK)
                self.assertEqual(readable, os.geteuid() == 0)
                if readable:
                    self.assertEqual(engine.render("locked.tpl", {}), "x")
                else:
                    self.assertEqual(
                        code_of(lambda: engine.render("locked.tpl", {})),
                        "E_LOAD_FAILED",
                    )
                for name in ("folder.tpl", "missing.tpl"):
                    self.assertEqual(
                        code_of(lambda: engine.render(name, {})), "E_LOAD_NOT_FOUND"
                    )
            finally:
                locked.chmod(0o600)

    def test_text_that_is_not_one_json_document_is_invalid_json(self):
        for text in ("", " ", "{", '{"a": }', "[1,]", '{"a": 1} x', "nul", '"a', "01"):
            with self.assertRaises(BindError, msg=text) as caught:
                parse_json_bytes(text.encode())
            self.assertEqual(caught.exception.code, "E_DATA_INVALID_JSON", text)

    def test_an_invalid_delimiter_option_is_a_value_error(self):
        # LEX-21, LEX-22: a delimiter option is a string of two delimiter characters.
        with self.assertRaisesRegex(ValueError, "is not a delimiter pair"):
            AstProgram(EngineOptions(delimiters="[[["))
