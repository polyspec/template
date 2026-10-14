#!/usr/bin/env python3

"""decode_template reads the canonical AST JSON into the AST of the package (AST-10)."""

import json
import unittest
from pathlib import Path

from polyspec.template import (
    AstDecodeError,
    AstProgram,
    Engine,
    EngineOptions,
    MapLoader,
    decode_template,
    parse,
)

from .cases import case_directories

ROOT = Path(__file__).resolve().parents[3]

ECHO = (
    '{"type":"Template","name":"x.tpl","body":[{"type":"Echo","expr":{"type":"Binary","op":"+",'
    '"left":{"type":"Var","name":"a","span":[3,4]},"right":{"type":"Literal","kind":"number","value":1,'
    '"span":[7,8]},"span":[3,8]},"span":[0,9]}],"comments":[]}'
)


class DecodeTemplateTest(unittest.TestCase):
    def test_decode_reads_the_ast_of_every_conformance_case(self):
        count = 0
        for directory in case_directories():
            path = directory / "expected.ast.json"
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            decoded = decode_template(text)
            # A number literal is a float, as parse makes it, so the file is
            # compared with its integers read as floats.
            self.assertEqual(
                json.loads(json.dumps(decoded)),
                json.loads(text, parse_int=float),
                str(path),
            )
            count += 1
        self.assertGreater(count, 0, "no case has an expected.ast.json")

    def test_a_decoded_template_is_the_ast_that_parse_returns_and_renders(self):
        # RT-41: the decode returns the AST of parse, spans as tuples and
        # numbers as floats, and a program renders it without its source.
        ast = decode_template(ECHO)
        self.assertEqual(ast, parse("{= a + 1}", "x.tpl"))
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader({"x.tpl": ast}))))
        self.assertEqual(engine.render("x.tpl", {"a": 2}), "3")

    def test_decode_fails_naming_the_json_pointer_of_the_invalid_node(self):
        fixture = json.loads(
            (ROOT / "tests/fixtures/ast-decode/invalid.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertTrue(fixture["cases"], "invalid.json has no case")
        for case in fixture["cases"]:
            with self.subTest(case["name"]):
                with self.assertRaises(AstDecodeError) as raised:
                    decode_template(json.dumps(case["ast"]))
                self.assertEqual(raised.exception.path, case["path"])
                shown = case["path"] or "the root"
                self.assertIn(shown, str(raised.exception))

    def test_decode_fails_on_text_that_is_not_json(self):
        # NaN and Infinity, which the json module reads by default, are no
        # JSON either.
        for text in ["{", ECHO.replace('"value":1', '"value":NaN')]:
            with self.subTest(text):
                with self.assertRaises(ValueError) as raised:
                    decode_template(text)
                self.assertNotIsInstance(raised.exception, AstDecodeError)

    def test_the_embedded_schema_is_the_contract_schema(self):
        embedded = ROOT / "packages/python/src/polyspec/template/ast.schema.json"
        contract = ROOT / "contracts/schema/ast.schema.json"
        self.assertEqual(
            embedded.read_bytes(),
            contract.read_bytes(),
            f"{embedded} differs from {contract}: copy the contract schema to it",
        )


if __name__ == "__main__":
    unittest.main()
