"""RT-74, RT-22, RT-35, ERR-2: public render state works without a program."""

import unittest
from polyspec.template import RenderContext, RuntimeEnvironment, Frame, TemplateError
from polyspec import template as sdk


class ContextSDK(unittest.TestCase):
    def test_ordered_value_sdk_carriers(self):
        # VAL-1, VAL-4, VAL-6: native dict snapshots preserve ordered SDK values.
        safe = sdk.SafeString("<i>")
        values = {"first": safe, "second": False}
        values["first"] = safe
        copy = values.copy()
        copy["third"] = None
        keys = list(values)
        keys[0] = "changed"
        self.assertEqual(list(values), ["first", "second"])
        self.assertEqual(len(values), 2)
        self.assertIn("first", values)
        self.assertIsNone(values.get("missing"))
        self.assertIs(copy["first"], safe)
        self.assertEqual(safe.text, "<i>")
        del copy["second"]
        self.assertEqual(list(copy.values()), [safe, None])
        self.assertEqual(list(copy.items()), [("first", safe), ("third", None)])

    def test_ast_program_protocols(self):
        # RT-1, RT-5, RT-6, RT-74: concrete operations share one runtime with the public protocol.
        loader = sdk.MapLoader({"a.tpl": "{= hello()}|{= Box::value()}"})
        program = sdk.AstProgram(sdk.EngineOptions(loader=loader))

        def hello(_args, _context):
            return "host"

        def value(_args, _context):
            return "box"

        program.register("hello", hello)
        program.register_class("Box", "value", value)
        self.assertIsInstance(program, sdk.Program)
        self.assertIs(program.loader, loader)
        self.assertIs(program.host_function("hello"), hello)
        self.assertIs(program.class_function("Box", "value"), value)
        self.assertEqual(program.limits(), program.runtime.limits())
        self.assertEqual(program.artifact_refresh, "true")
        self.assertEqual(program.prepare("a.tpl", {}).render(), "host|box")
        self.assertEqual(program.render("a.tpl", {}), "host|box")

    def test_isolated_state_positioned_errors_and_bounded_output(self):
        services = RuntimeEnvironment({"outputBytes": 2})
        root = {"root": "value"}
        env = {"timezone": "Z", "now": 123}
        context = RenderContext(services, root, env, "entry.tpl")
        other = RenderContext(services, root, env, "other.tpl")
        self.assertIs(context.services, services)
        self.assertIs(context.root_data, root)
        self.assertIs(context.env, env)
        self.assertEqual(context.entry_name, "entry.tpl")
        self.assertEqual(context.iterations, 0)
        context.iterations += 1
        context.registry["layout"] = {"html": "ready"}
        self.assertEqual(context.registry["layout"], {"html": "ready"})
        self.assertEqual(other.registry, {})
        self.assertEqual(other.iterations, 0)
        frame = Frame("part.tpl", [0, 2], root)
        error = context.fail("E_RUNTIME_TYPE", None, None, "unpositioned")
        self.assertEqual(
            (error.template, error.line, error.col, error.offset, error.end),
            ("entry.tpl", 0, 0, 0, 0),
        )
        error = context.fail("E_RUNTIME_TYPE", frame, (2, 3), "positioned")
        self.assertEqual(
            (error.template, error.line, error.col, error.offset, error.end),
            ("part.tpl", 2, 1, 2, 3),
        )
        context.enter("entry.tpl", None, None)
        self.assertEqual(context.chain, ["entry.tpl"])
        with self.assertRaises(TemplateError) as caught:
            context.enter("entry.tpl", frame, (2, 3))
        self.assertEqual(caught.exception.code, "E_LOAD_CYCLE")
        self.assertEqual(context.chain, ["entry.tpl"])
        context.leave()
        self.assertEqual(context.chain, [])
        context.at(frame, (2, 3))
        context.output.write("é")
        self.assertEqual(context.output.text(), "é")
        self.assertEqual(other.output.text(), "")
        with self.assertRaises(TemplateError) as caught:
            context.output.write("x")
        error = caught.exception
        self.assertEqual(
            (
                error.code,
                error.template,
                error.line,
                error.col,
                error.offset,
                error.end,
            ),
            ("E_RUNTIME_LIMIT", "part.tpl", 2, 1, 2, 3),
        )
