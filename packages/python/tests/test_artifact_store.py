"""RT-56 ArtifactStore.loadOrRefresh: "dev" builds on every call, "true" reuses an artifact that loads, and "false" never
builds."""

import json
import os
import tempfile
import unittest
from pathlib import Path

from polyspec.template import load_or_refresh

FIXTURE = (
    Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "artifact-runtime"
)


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

    def test_true_fails_on_a_broken_manifest(self):
        builds = []
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "manifest.json").write_text("not json")
            with self.assertRaises(json.JSONDecodeError):
                load_or_refresh(directory, "true", builds.append)
        self.assertEqual(builds, [])

    def test_true_fails_on_an_unreadable_manifest(self):
        builds = []
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory, "manifest.json")
            manifest.write_text("{}")
            os.chmod(manifest, 0)
            try:
                with self.assertRaises(PermissionError):
                    load_or_refresh(directory, "true", builds.append)
            finally:
                os.chmod(manifest, 0o644)
        self.assertEqual(builds, [])
