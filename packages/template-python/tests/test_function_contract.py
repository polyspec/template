#!/usr/bin/env python3
"""The canonical function contract (packages/template-compiler/functions.json) against
the Python registry: the same function names, the same argument ranges, arity
errors at run time, and the call syntax the contract accepts and rejects."""

import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from polyspec.template import (
    BUILTINS,
    AstProgram,
    EngineOptions,
    Frame,
    RenderContext,
    RuntimeBindings,
    TemplateError,
    parse,
)
from polyspec.template.functions import Env

CONTRACT = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "template-compiler"
        / "functions.json"
    ).read_text(encoding="utf-8")
)


def bindings():
    context = RenderContext(
        AstProgram(EngineOptions()), {}, Env("Z", 0.0), "contract.tpl"
    )
    return RuntimeBindings(context), Frame("contract.tpl", None, {})


class FunctionContract(unittest.TestCase):
    def test_the_registry_has_the_canonical_names_and_argument_ranges(self):
        expected = {
            fn["name"]: (
                fn["minArgs"],
                math.inf if fn["maxArgs"] == -1 else fn["maxArgs"],
            )
            for fn in CONTRACT["canonical"]
        }
        actual = {
            name: (builtin.minimum, builtin.maximum)
            for name, builtin in BUILTINS.items()
        }
        self.assertGreater(len(expected), 0)
        self.assertEqual(actual, expected)

    def test_the_contract_declares_python_support(self):
        for fn in CONTRACT["canonical"]:
            self.assertEqual(
                fn["support"]["python"], {"ast": "pass", "gen": "pass"}, fn["name"]
            )

    def test_an_argument_count_outside_the_range_is_an_arity_error(self):
        runtime, frame = bindings()
        for fn in CONTRACT["canonical"]:
            counts = []
            if fn["minArgs"] > 0:
                counts.append(fn["minArgs"] - 1)
            if fn["maxArgs"] != -1:
                counts.append(fn["maxArgs"] + 1)
            for count in counts:
                with self.subTest(function=fn["name"], count=count):
                    with self.assertRaises(TemplateError) as caught:
                        runtime.call(fn["name"], [None] * count, frame, (0, 1))
                    self.assertEqual(caught.exception.code, "E_RUNTIME_ARITY")

    def test_the_call_syntax_of_the_contract(self):
        kinds = {
            "identifier(args...)": ("{= f(1) }", "Call"),
            "object.method(args...)": ("{= o.m(1) }", "MemberCall"),
            "Class::function(args...)": ("{= C::f(1) }", "ClassCall"),
        }
        syntax = CONTRACT["syntax"]
        for key, (source, node) in kinds.items():
            self.assertIn(key, syntax.values())
            self.assertEqual(parse(source, "t.tpl")["body"][0]["expr"]["type"], node)
        for source in ("{= \\Vendor\\dt::format(1) }", "{= new Foo(1) }"):
            with self.subTest(source=source):
                with self.assertRaises(TemplateError) as caught:
                    parse(source, "t.tpl")
                self.assertEqual(caught.exception.code, "E_PARSE_UNEXPECTED_TOKEN")


if __name__ == "__main__":
    unittest.main()
