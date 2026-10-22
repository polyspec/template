"""RT-62: a prepared render renders identical bytes on every call, and render is prepare(...).render()."""

import unittest
from pathlib import Path

from polyspec.template import load_artifact

ARTIFACT = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "artifact-runtime"
    / "artifact"
)


class PreparedRender(unittest.TestCase):
    def test_prepared_render_is_the_single_call_render(self):
        program = load_artifact(str(ARTIFACT))
        prepared = program.prepare("page.tpl", {"x": "a<b"})
        first = prepared.render()
        self.assertEqual(prepared.render(), first)
        self.assertEqual(program.render("page.tpl", {"x": "a<b"}), first)
