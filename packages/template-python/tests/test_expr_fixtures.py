#!/usr/bin/env python3
"""The expression fixtures that every language shares (tests/fixtures/expr/cases.json):
tokens, canonical AST with spans, parse errors and evaluated values."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from polyspec.template import (
    AstProgram,
    EngineOptions,
    Evaluator,
    Frame,
    RenderContext,
    Scope,
    TemplateError,
    bind_map,
)
from polyspec.template.expr_lexer import ExpressionLexer, LexerOptions
from polyspec.template.expr_parser import ExpressionParser
from polyspec.template.functions import Env
from polyspec.template.source import Source

CASES = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "tests"
        / "fixtures"
        / "expr"
        / "cases.json"
    ).read_text(encoding="utf-8")
)
BARE = LexerOptions(None, 0, None)


def plain(value):
    """The JSON form of a template value."""
    if hasattr(value, "text"):
        return value.text
    if isinstance(value, list):
        return [plain(item) for item in value]
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, float) and value == 0:
        return 0.0
    return value


def same(actual, expected):
    """Equality that tells a boolean from a number."""
    if isinstance(expected, bool) or isinstance(actual, bool):
        return (
            isinstance(actual, bool)
            and isinstance(expected, bool)
            and actual == expected
        )
    if isinstance(expected, list):
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(same(a, e) for a, e in zip(actual, expected))
        )
    if isinstance(expected, dict):
        return (
            isinstance(actual, dict)
            and list(actual) == list(expected)
            and all(same(actual[key], expected[key]) for key in expected)
        )
    return type(actual) in (type(expected), float, int) and actual == expected


def to_json_value(node):
    """A span is a tuple in the parser; the fixtures write a list."""
    if isinstance(node, tuple):
        return [to_json_value(item) for item in node]
    if isinstance(node, list):
        return [to_json_value(item) for item in node]
    if isinstance(node, dict):
        return {key: to_json_value(item) for key, item in node.items()}
    return node


class ExpressionFixtures(unittest.TestCase):
    def test_the_fixture_file_holds_cases(self):
        self.assertGreater(len(CASES), 0)

    def test_every_case(self):
        for case in CASES:
            with self.subTest(case=case["name"]):
                source = Source.from_bytes("expression", case["expr"].encode("utf-8"))
                if "error" in case:
                    parser = ExpressionParser(source, 0, BARE, "expression")
                    with self.assertRaises(TemplateError) as caught:
                        parser.parse_expression()
                        token = parser.peek()
                        if token.type != "EOF":
                            raise parser.unexpected(token)
                    self.assertEqual(caught.exception.code, case["error"])
                    continue
                lexer = ExpressionLexer(source, 0, BARE, "expression")
                tokens = []
                while True:
                    token = lexer.next()
                    tokens.append({"type": token.type, "value": token.value})
                    if token.type == "EOF":
                        break
                self.assertEqual(tokens, case["tokens"])
                tree = to_json_value(
                    ExpressionParser(source, 0, BARE, "expression").parse_expression()
                )
                self.assertEqual(tree, case["ast"])
                for index, evaluation in enumerate(case.get("cases", [])):
                    root = bind_map(evaluation["data"])
                    context = RenderContext(
                        AstProgram(EngineOptions()), root, Env("Z", 0.0), "expression"
                    )
                    result = Evaluator(context).evaluate(
                        tree, Frame("expression", None, root), Scope()
                    )
                    self.assertTrue(
                        same(plain(result), evaluation["value"]),
                        f"case {index}: {plain(result)!r} != {evaluation['value']!r}",
                    )


if __name__ == "__main__":
    unittest.main()
