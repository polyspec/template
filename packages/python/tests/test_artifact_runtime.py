"""RT-56: the artifact that the build compiler wrote loads through load_artifact and renders with the bytes of its source.

The fixture is the output of compileAst of tests/fixtures/artifact-runtime.
"""

import unittest
from pathlib import Path

from polyspec.template import load_artifact

REPO = Path(__file__).resolve().parents[3]


class ArtifactRuntime(unittest.TestCase):
    def test_load_artifact_renders_the_source_bytes(self):
        program = load_artifact(str(REPO / "tests" / "fixtures" / "artifact-runtime" / "artifact"))
        self.assertEqual(program.render("page.tpl", {"x": "a<b"}), "<p>a&lt;b</p>")
