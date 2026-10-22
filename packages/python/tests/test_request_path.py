"""RT-59: rendering a loaded artifact parses nothing and discovers no source (the artifact directory holds no .tpl file), and
two renders with the same assign give identical bytes and leave the assign unchanged."""

import unittest
from pathlib import Path

from polyspec.template import load_artifact

ARTIFACT = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "artifact-runtime" / "artifact"


class RequestPath(unittest.TestCase):
    def test_renders_a_loaded_artifact_the_same_way(self):
        program = load_artifact(str(ARTIFACT))
        assign = {"x": "a<b"}
        first = program.render("page.tpl", assign)
        self.assertEqual(program.render("page.tpl", assign), first)
        self.assertEqual(first, "<p>a&lt;b</p>")
        self.assertEqual(assign, {"x": "a<b"})
