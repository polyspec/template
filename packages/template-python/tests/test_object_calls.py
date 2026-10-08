#!/usr/bin/env python3
"""Member calls on assigned objects, logical class calls, host argument values
(VAL-21) and native object equality (EXP-39) in the AST program, with the
fixtures that every language shares in tests/fixtures/native-object."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from polyspec.template import (
    AstProgram,
    Engine,
    EngineOptions,
    BindError,
    FsLoader,
    RenderOptions,
    SafeString,
    TemplateError,
    bind_value,
)

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "native-object"
HOST_VALUES = json.loads((FIXTURE / "host-values.json").read_text(encoding="utf-8"))


class Order:
    label = "Order 12"

    def status_label(self, prefix):
        if not isinstance(prefix, str):
            raise TypeError("invalid status_label")
        return prefix + ":12"

    def fail(self, prefix):
        raise RuntimeError("failed member")

    def _private(self):
        return "hidden"


def fixture_engine(register):
    program = AstProgram(EngineOptions(loader=FsLoader(str(FIXTURE))))
    register(program)
    return Engine(program)


def order_runtime(program):
    program.register_class("Order", "suffix", lambda args, _context: "done" + args[0])

    def fail(args, _context):
        raise RuntimeError("failed class")

    program.register_class("Order", "fail", fail)


def describe_value(value, order):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return f"bool({str(value).lower()})"
    if isinstance(value, (int, float)):
        return f"number({int(value) if float(value).is_integer() else value})"
    if isinstance(value, str):
        return f"string({value})"
    if isinstance(value, list):
        return "list(" + ",".join(describe_value(item, order) for item in value) + ")"
    if isinstance(value, dict):
        return (
            "map("
            + ",".join(
                f"{key}={describe_value(item, order)}" for key, item in value.items()
            )
            + ")"
        )
    return "object(order)" if value is order else "unexpected"


class ValueOrder:
    def __init__(self):
        self.describe = lambda *args: describe_arguments(args, self)


def describe_arguments(args, order):
    return ",".join(describe_value(item, order) for item in args)


def value_runtime(order):
    def register(runtime):
        _register_values(runtime, order)

    return register


def _register_values(runtime, order):

    def describe(args, _context):
        return describe_arguments(args, order)

    def mutate(args, _context):
        args[0][0] = "changed"
        args[1]["k"] = "changed"
        args[2].append("added")

    runtime.register("describe", describe)
    runtime.register("mutate", mutate)
    runtime.register("pick", lambda args, _context: args[0])
    runtime.register_class("Order", "describe", describe)


class ObjectCalls(unittest.TestCase):
    def render(self, target, register, assign, options=None):
        return fixture_engine(register).render(
            target, assign, options or RenderOptions()
        )

    def test_member_call_class_call_and_public_field(self):
        order = Order()
        html = self.render("input.tpl", order_runtime, {"order": order})
        self.assertEqual(
            html, "<article><h1>Order 12</h1><p>ready:12</p><p>done!</p></article>\n"
        )

    def test_the_object_reaches_include_block_and_definition_unchanged(self):
        order = Order()
        runtime = order_runtime
        self.assertEqual(
            self.render("include.tpl", runtime, {"order": order}), "Order 12|p:12\n"
        )
        self.assertEqual(
            self.render("block.tpl", runtime, {"order": order}), "Order 12|p:12\n"
        )
        define = {"card": {"template": "part.tpl", "data": {"o": order}}}
        self.assertEqual(
            self.render(
                "define.tpl", runtime, {"order": order}, RenderOptions(define=define)
            ),
            "Order 12|p:12\n",
        )

    def test_call_errors_have_the_declared_codes(self):
        codes = {
            "unknown-member.tpl": "E_RUNTIME_UNKNOWN_FUNCTION",
            "unknown-class.tpl": "E_RUNTIME_UNKNOWN_FUNCTION",
            "throw-member.tpl": "E_RUNTIME_HOST_FUNCTION",
            "throw-class.tpl": "E_RUNTIME_HOST_FUNCTION",
            "member-type.tpl": "E_RUNTIME_HOST_FUNCTION",
            "member-arity.tpl": "E_RUNTIME_HOST_FUNCTION",
        }
        for target, code in codes.items():
            with self.subTest(target=target):
                with self.assertRaises(TemplateError) as caught:
                    self.render(target, order_runtime, {"order": Order()})
                self.assertEqual(caught.exception.code, code)

    def test_a_private_method_is_not_callable(self):
        engine = Engine(
            AstProgram(EngineOptions(loader=_Map({"m.tpl": "{= order._private() }"})))
        )
        with self.assertRaises(TemplateError) as caught:
            engine.render("m.tpl", {"order": Order()})
        self.assertEqual(caught.exception.code, "E_RUNTIME_UNKNOWN_FUNCTION")

    def test_host_arguments_and_native_object_equality(self):
        for target, output in HOST_VALUES["outputs"].items():
            with self.subTest(target=target):
                order = ValueOrder()
                assign = {
                    "order": order,
                    "same": order,
                    "other": ValueOrder(),
                    "items": [1],
                }
                self.assertEqual(
                    self.render(target, value_runtime(order), assign), output
                )

    def test_a_native_object_has_no_order_and_no_json_text(self):
        for target, code in HOST_VALUES["errors"].items():
            with self.subTest(target=target):
                order = ValueOrder()
                assign = {
                    "order": order,
                    "same": order,
                    "other": ValueOrder(),
                    "items": [1],
                }
                with self.assertRaises(TemplateError) as caught:
                    self.render(target, value_runtime(order), assign)
                self.assertEqual(caught.exception.code, code)

    def test_values_without_a_binding_are_rejected(self):
        for value in ({1}, b"x", len, Order, sys, (n for n in [1]), complex(1, 2)):
            with self.subTest(value=type(value).__name__):
                with self.assertRaises(BindError) as caught:
                    bind_value(value)
                self.assertEqual(caught.exception.code, "E_DATA_UNSUPPORTED_TYPE")

    def test_a_class_instance_binds_to_one_native_object_per_binding(self):
        order = Order()
        self.assertIs(bind_value(order).target, order)

    def test_a_safe_string_argument_reaches_host_code_as_text(self):
        seen = []
        program = AstProgram(
            EngineOptions(loader=_Map({"m.tpl": '{= probe(raw("r")) }'}))
        )
        program.register("probe", lambda args, _context: seen.append(args[0]))
        Engine(program).render("m.tpl", {})
        self.assertEqual(seen, ["r"])
        self.assertNotIsInstance(seen[0], SafeString)


def _Map(files):
    from polyspec.template import MapLoader

    return MapLoader(files)


if __name__ == "__main__":
    unittest.main()
