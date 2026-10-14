#!/usr/bin/env python3
"""The conformance cases rendered in-process (CNF-6 to CNF-9): the AST of every
case that has expected.ast.json equals that file, and the render of input.tpl
with the data.json, define.json and env.json of the case gives expected.html, or
the error of expected.error.json by its code, template and position. Each case
is the test `<group>/<name>`, as the suite unit conformance of
config/parity.json reads the results."""

import json
import unittest
from pathlib import Path

from polyspec.template import (
    DEFAULT_DELIMITERS,
    AstProgram,
    BindError,
    Engine,
    EngineOptions,
    FsLoader,
    RenderOptions,
    Source,
    TemplateError,
    parse_delimiters,
    parse_json_bytes,
    parse_template,
)

from .cases import CaseTest, case_suite, delimiters_of


def plain(value: object) -> object:
    """A value of parse_json_bytes or of the AST as the dicts, lists and
    scalars that json.loads gives for the same JSON text: a span tuple of the
    AST is a list."""
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def read_json(path: Path) -> "object | None":
    """The value of a JSON file of the case, or None when the case has none."""
    return parse_json_bytes(path.read_bytes()) if path.exists() else None


class CaseConformance(CaseTest):
    def run_case(self) -> None:
        delimiters = delimiters_of(self.directory)
        expected_ast = self.directory / "expected.ast.json"
        if expected_ast.exists():
            source = Source.from_bytes(
                "input.tpl", (self.directory / "input.tpl").read_bytes()
            )
            ast = parse_template(
                source,
                DEFAULT_DELIMITERS
                if delimiters is None
                else parse_delimiters(delimiters),
            )
            # Every number of the JSON text is a number of the data model, a
            # double (VAL-1), as the AST holds it.
            self.assertEqual(
                plain(ast),
                json.loads(expected_ast.read_text("utf-8"), parse_int=float),
                "ast",
            )
        expected_error = self.directory / "expected.error.json"
        try:
            html = self.render(delimiters)
        except TemplateError as error:
            self.assertTrue(
                expected_error.exists(),
                f"render failed with {error.code}: {error}",
            )
            actual = {
                "code": error.code,
                "template": error.template,
                "line": error.line,
                "col": error.col,
            }
            self.assertEqual(
                actual, json.loads(expected_error.read_text("utf-8")), "error"
            )
            return
        self.assertFalse(expected_error.exists(), f"rendered {html!r}")
        self.assertEqual(
            html,
            (self.directory / "expected.html").read_bytes().decode("utf-8"),
            "html",
        )

    def render(self, delimiters: "str | None") -> str:
        """The output of input.tpl with the inputs of the case; a binding error
        of the data is the template error of its code without a position, as
        the command line reports it (CNF-4)."""
        engine = Engine(
            AstProgram(
                EngineOptions(
                    loader=FsLoader(str(self.directory)), delimiters=delimiters
                )
            )
        )
        options = RenderOptions()
        try:
            assign = read_json(self.directory / "data.json")
            define = read_json(self.directory / "define.json")
            env = read_json(self.directory / "env.json")
        except BindError as error:
            raise TemplateError(
                error.code, "input.tpl", 0, 0, 0, 0, str(error)
            ) from None
        if define is not None:
            options.define = plain(define)
        if env is not None:
            options.env = plain(env)
        return engine.render("input.tpl", {} if assign is None else assign, options)


def load_tests(
    _loader: unittest.TestLoader, _tests: unittest.TestSuite, _pattern: "str | None"
) -> unittest.TestSuite:
    return case_suite(CaseConformance)
