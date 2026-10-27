"""RT-74, RT-22, RT-35, ERR-2: public render state works without a program."""

import unittest
from polyspec.template import RenderContext, RuntimeEnvironment, Frame, TemplateError


class ContextSDK(unittest.TestCase):
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
