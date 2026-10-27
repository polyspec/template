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

from polyspec import template as sdk
from polyspec.template import loader as native_loader

from polyspec.template import (
    AstProgram,
    BindError,
    Engine,
    EngineOptions,
    FsLoader,
    MapLoader,
    TemplateError,
    parse_json_bytes,
    parse,
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
    def test_public_parsed_template_data_and_cache_identity(self):
        # RT-9, RT-40: only source input has a source line index.
        source = "x\nz"
        tree = parse(source, "a.tpl")
        for value in [source, tree]:
            program = AstProgram(EngineOptions(loader=MapLoader({"a.tpl": value})))
            artifact = program.load_template("a.tpl", None, None)
            self.assertEqual(artifact["ast"], tree)
            self.assertEqual(
                artifact["lines"], [0, 2] if isinstance(value, str) else None
            )
            self.assertIs(program.load_template("a.tpl", None, None), artifact)

    def test_map_loader_versions_source_and_ast_content(self):
        # RT-9, RT-10, RT-40: native result payloads and versions survive replacement.
        self.assertIs(sdk.LoadResult, native_loader.LoadResult)
        self.assertIs(sdk.LoadedSource, native_loader.LoadedSource)
        self.assertIs(sdk.LoadedAst, native_loader.LoadedAst)
        self.assertIs(sdk.Loader, native_loader.Loader)
        self.assertIs(sdk.MapLoader, native_loader.MapLoader)
        loader = MapLoader()
        for ast in [False, True]:
            versions = []
            for text in ["first", "second", "second"]:
                value = parse(text, "a.tpl") if ast else text
                loader.set("a.tpl", value)
                result = loader.load("a.tpl")
                self.assertIsNotNone(result)
                self.assertEqual(result.ast if ast else result.source, value)
                self.assertFalse(hasattr(result, "source" if ast else "ast"))
                self.assertNotEqual(result.version, "")
                versions.append(result.version)
            self.assertNotEqual(versions[0], versions[1])
            self.assertEqual(versions[1], versions[2])

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

    def test_the_parse_is_reused_while_the_version_stays_the_same(self):
        # RT-40: under the default artifact refresh policy `true` (RT-76) an engine parses a template once per
        # name@version and reuses the parse while the loader reports the same version.
        class VersionedLoader:
            def __init__(self, source: str, version: str):
                self.source = source
                self.version = version

            def load(self, name: str):
                if name != "a.tpl":
                    return None
                return SimpleNamespace(
                    source=self.source, ast=None, version=self.version
                )

        loader = VersionedLoader("1", "v1")
        engine = engine_of(loader)
        self.assertEqual(engine.render("a.tpl", {}), "1")
        loader.source = "2"
        self.assertEqual(engine.render("a.tpl", {}), "1")
        loader.version = "v2"
        self.assertEqual(engine.render("a.tpl", {}), "2")

    def test_the_map_loader_returns_a_held_source_with_a_version(self):
        # RT-9, RT-10: a map loader returns a held source with its version, and nothing
        # for another name.
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
        # RT-9, ERR-6: a loader that fails is E_LOAD_FAILED for the entry template, with
        # that template, line 0 and col 0.
        with self.assertRaises(TemplateError) as caught:
            engine_of(FailingLoader()).render("a.tpl", {})
        error = caught.exception.to_object()
        self.assertEqual(
            (error["code"], error["template"], error["line"], error["col"]),
            ("E_LOAD_FAILED", "a.tpl", 0, 0),
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
        # RT-9, RT-10: an unreadable regular file is E_LOAD_FAILED; a directory and a
        # missing name do not exist, E_LOAD_NOT_FOUND.
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
