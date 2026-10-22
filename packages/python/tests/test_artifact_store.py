"""RT-56 ArtifactStore.loadOrRefresh: "dev" builds on every call, "true" reuses an artifact that loads, and "false" never
builds."""

import unittest
from pathlib import Path

from polyspec.template import load_or_refresh

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "artifact-runtime"


class ArtifactStore(unittest.TestCase):
    def test_load_or_refresh_follows_its_policy(self):
        builds = []
        directory = str(FIXTURE / "artifact")
        load_or_refresh(directory, "true", builds.append)
        self.assertEqual(len(builds), 0)
        load_or_refresh(directory, "dev", builds.append)
        self.assertEqual(len(builds), 1)
        program = load_or_refresh(directory, "false", builds.append)
        self.assertEqual(program.render("page.tpl", {"x": "b"}), "<p>b</p>")
        self.assertEqual(len(builds), 1)
        with self.assertRaises(RuntimeError):
            load_or_refresh(str(FIXTURE / "none"), "false", builds.append)
